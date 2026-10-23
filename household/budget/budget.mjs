import {cardPanels} from './cards.mjs?v=cards09';
import {createClient} from '../account/supabase.mjs';
import {createSessionStorage,endDeviceSession,SESSION_KEY} from '../account/session.mjs';
import {currentKstMonth,shiftMonth} from '../connect/months.mjs';
import {CATEGORIES,CARD_CATEGORIES,createBudgetState,budgetTotals} from './state.mjs?v=cards09';
const $=s=>document.querySelector(s),won=n=>n===null?'—':new Intl.NumberFormat('ko-KR').format(n)+'원';
const storage=createSessionStorage(()=>localStorage);
const client=createClient('https://xcchskngoactqsiiutsp.supabase.co','sb_publishable_sONZt44kSnkbF8mjzoAgGQ_QOfmwm1v',{
 auth:{persistSession:true,storage,storageKey:SESSION_KEY,autoRefreshToken:true,detectSessionInUrl:false},
 global:{fetch:(url,options={})=>fetch(url,{...options,cache:'no-store',signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)})}
});
let authenticated=false,generation=0,editKind=null,editCard='hana';
function openGuide(){const target=location.hash==='#partner-guide'?$('#partner-guide'):location.hash==='#guide'?$('#guide'):null;if(target){target.open=true;target.scrollIntoView({block:'start'});}}
addEventListener('hashchange',openGuide);openGuide();
const model=createBudgetState(async(name,args,signal)=>{
 const {data,error}=await client.rpc(name,args).abortSignal(signal);if(error)throw Object.assign(Error('request'),{code:error.code});return data;
},render);
function render(state){
 $('#status').textContent=state.message;$('#login').hidden=authenticated;$('#signed-actions').hidden=!authenticated;
 $('#content').setAttribute('aria-busy',String(state.busy));$('#reload').disabled=state.busy;
 $('#month').value=state.month??currentKstMonth();$('#month').max=currentKstMonth();
 for(const selector of ['#month','#prev','#next'])$(selector).disabled=state.busy;
 $('#next').disabled=state.busy||$('#month').value>=currentKstMonth();$('#prev').disabled=state.busy||$('#month').value<='2000-01';
 $('#save').disabled=state.busy;
 if($('#editor').open){$('#edit-error').textContent=state.message;return;}
 const box=$('#content');box.replaceChildren();if(state.phase!=='ready')return;
 const d=state.data,t=budgetTotals(d),known=d.net!==null;
 box.innerHTML=`<div class="budget-layout"><section class="budget-hero"><div class="hero-top"><h2>수집된 국내 일시불 사용액</h2><span class="badge">${d.month<'2026-11'?'10월 연결 시험':'연결 카드 일부 수집'}</span></div><p class="amount">${won(t.used)}</p><p class="muted small">${known?'분류 전 금액도 포함된 합계예요.':'이 달에 수집된 자료가 아직 없어요.'}</p><div class="hero-metrics"><div><small>${d.planState==='saved'?'이 달의 예산':'임시 예산'}</small><strong>${won(t.planned)}</strong></div><div><small>수집분 기준 잔여</small><strong>${won(t.remaining)}</strong></div></div></section><section class="panel"><div class="section-top"><h2>항목별 예산</h2><button data-edit="plan" class="secondary">예산 조정</button></div>${CATEGORIES.map(([key,label])=>{
  const used=d.used[key]??0,budget=d.budget?.[key]??null;const status=used>0?won(used):'—';
  return `<article class="budget-row ${budget!==null&&used>budget?'over':''}"><div class="budget-row-head"><h3>${label}</h3><strong>${status}<small> / ${budget===null?'예산 미설정':won(budget)}</small></strong></div><progress max="${budget>0?budget:Math.max(used,1)}" value="${used}" aria-label="${label} 분류된 사용액 ${won(used)}"></progress>${used===0?'<p class="row-note">분류된 실적 없음</p>':budget!==null&&used>budget?`<p class="row-note">${won(used-budget)} 초과</p>`:''}</article>`;
 }).join('')}</section><aside class="side-stack"><section class="panel"><p class="eyebrow">TO ORGANIZE</p><h2>${d.needsReview?'분류 재확인':'아직 나누지 않은 금액'}</h2><div class="unclassified">${won(d.unclassified)}</div><p>${d.needsReview?'수집 합계가 바뀌어 기존 분류를 다시 확인해야 해요.':'용돈·구독 등 목적별로 나누면 예산 막대에 반영돼요.'}</p></section>${cardPanels(d)}</aside></div>`;
}
function clear(message){generation++;authenticated=false;$('#editor').close();$('#fields').replaceChildren();editKind=null;model.clear(message);}
function openEditor(kind,card='hana'){
 const d=model.state.data;if(!d||model.state.busy)return;editKind=kind;editCard=card;
 const allocation=d.ownAllocations?.find(x=>x.card===card)??(card==='hana'?d.ownAllocation:null);if(kind!=='plan'&&!allocation)return;
 const cats=kind==='plan'?CATEGORIES:CARD_CATEGORIES,values=kind==='plan'?d.budget:allocation?.amounts;
 $('#edit-title').textContent=kind==='plan'?'이번 달 예산 조정':`내 ${{hana:'하나',kb:'KB',nh:'NH',shinhan:'신한'}[card]??'카드'} 합계 나누기`;
 $('#edit-note').textContent=kind==='plan'?'이 달에만 적용돼요. 다른 기기에도 함께 저장됩니다.':`수집 합계 ${won(allocation.net)} 안에서 배분해 주세요. 나머지는 미분류로 남아요.`;
 $('#fields').innerHTML=cats.map(([key,label])=>`<label>${label}<input name="${key}" type="number" min="0" max="1000000000" step="1" inputmode="numeric" required value="${values?.[key]??0}"></label>`).join('');
 $('#edit-error').textContent='';updateEditTotal();$('#editor').showModal();
}
function updateEditTotal(){const total=[...$('#fields').querySelectorAll('input')].reduce((a,e)=>a+Number(e.value||0),0);$('#edit-total').textContent=`합계 ${won(total)}`;}
$('#fields').addEventListener('input',updateEditTotal);
$('#content').addEventListener('click',event=>{const button=event.target.closest('[data-edit]');if(button)openEditor(button.dataset.edit,button.dataset.card);});
$('#close').onclick=()=>{$('#editor').close();$('#fields').replaceChildren();render(model.state);};
$('#editor').addEventListener('cancel',()=>{queueMicrotask(()=>{$('#fields').replaceChildren();render(model.state);});});
$('#edit-form').onsubmit=async event=>{
 event.preventDefault();const amounts=Object.fromEntries([...$('#fields').querySelectorAll('input')].map(input=>[input.name,Number(input.value)]));
 const total=Object.values(amounts).reduce((a,b)=>a+b,0);
 if(Object.values(amounts).some(n=>!Number.isSafeInteger(n)||n<0)||total>1000000000||(editKind==='classification'&&total>(model.state.data.ownAllocations?.find(x=>x.card===editCard)??model.state.data.ownAllocation).net)){$('#edit-error').textContent='입력한 금액과 합계를 확인해 주세요.';return;}
 if(await model.save(editKind,amounts,editCard)){$('#editor').close();$('#fields').replaceChildren();render(model.state);$('#status').textContent='저장했어요.';}
};
function load(month=$('#month').value||currentKstMonth()){if(authenticated&&!$('#editor').open)return model.load(month);}
$('#month').onchange=()=>load();$('#prev').onclick=()=>load(shiftMonth($('#month').value,-1));$('#next').onclick=()=>load(shiftMonth($('#month').value,1));$('#reload').onclick=()=>load();
$('#logout').onclick=async()=>{clear('로그아웃 중…');const result=await endDeviceSession(client.auth,storage);clear(result.cleared?'이 기기에서 로그아웃했어요.':'브라우저에서 사이트 데이터를 삭제해 주세요.');};
client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||(event==='TOKEN_REFRESHED'&&!session)){storage.forget();clear('로그인이 종료됐어요.');}});
addEventListener('storage',event=>{if((event.key===SESSION_KEY&&event.newValue===null)||event.key===null){storage.forget();clear('다른 탭에서 로그아웃했어요.');}});
addEventListener('pagehide',()=>clear());addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
const initial=generation;render(model.state);
try{const {data,error}=await client.auth.getSession();if(initial===generation){if(!error&&data.session){authenticated=true;await model.load(currentKstMonth());}else clear();}}catch{clear('로그인과 연결을 확인해 주세요.');}
setInterval(()=>{if(authenticated&&!document.hidden&&!$('#editor').open&&model.state.phase==='ready')load();},30000);
addEventListener('visibilitychange',()=>{if(!document.hidden&&authenticated&&!$('#editor').open)load();});
