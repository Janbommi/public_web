import {cardPanels,connectedCount,short} from './cards.mjs?v=web12';
import {createClient} from '../account/client.mjs?v=web12';
import {signInWithUsername} from '../account/username.mjs?v=web12';
import {createSessionStorage,endDeviceSession,logoutMessage,SESSION_KEY} from '../account/session.mjs?v=web12';
import {currentKstMonth,shiftMonth} from '../connect/months.mjs';
import {categoriesFor,cardCategoriesFor,createBudgetState,budgetTotals,failureKind} from './state.mjs?v=web12';
import {showOwnerNav,browserContext,seenHomeTip,markHomeTip} from '../shared/page.mjs?v=web12';
const $=s=>document.querySelector(s);
const won=n=>n===null||n===undefined?'—':(n<0?'−':'')+new Intl.NumberFormat('ko-KR').format(Math.abs(n))+'원';
let persistenceUnavailable=false;
function showStorageWarning(){
 persistenceUnavailable=true;
 for(const element of document.querySelectorAll('.storage-warning'))element.hidden=false;
 $('#remember').checked=false;
}
const storage=createSessionStorage(()=>localStorage,showStorageWarning);
// Registered before the client's own listener, so another tab's logout is named as such.
addEventListener('storage',event=>{if((event.key===SESSION_KEY&&event.newValue===null)||event.key===null){if(authenticated){storage.forget();reset('다른 탭에서 로그아웃했어요.');}}});
const client=createClient('https://xcchskngoactqsiiutsp.supabase.co','sb_publishable_sONZt44kSnkbF8mjzoAgGQ_QOfmwm1v',{
 auth:{persistSession:true,storage,storageKey:SESSION_KEY,autoRefreshToken:true,detectSessionInUrl:false},
 global:{fetch:(url,options={})=>fetch(url,{...options,cache:'no-store',signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)})}
});
let authenticated=false,slot=null,entry=0,editKind=null,editCard='hana',rendered='',loginAttempt=0,homeTip=false,announced='';
const call=async(name,args,signal)=>{
 const query=client.rpc(name,args);const {data,error,status}=await (signal?query.abortSignal(signal):query);
 if(error)throw Object.assign(Error('request'),{code:error.code,status});return data;
};
const model=createBudgetState(call,render);
const clock=t=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit'}).format(t);
function view(name){
 $('#login-panel').hidden=name!=='login';$('#restoring').hidden=name!=='restoring';
 $('#app').hidden=name!=='app';$('#footer').hidden=name!=='app';
}
function say(text){if(text!==announced){announced=text;$('#status').textContent=text;}}
const monthWord=m=>m===currentKstMonth()?'이번 달':`${Number(m.slice(5))}월`;
function heroMarkup(d){
 const t=budgetTotals(d),known=d.net!==null,trial=d.month<'2026-11';
 const remain=t.remaining!==null&&t.remaining<0?' class="negative"':'';
 return `<section class="hero" aria-labelledby="hero-label"><p id="hero-label" class="hero-label"><span>연결 카드 수집 사용액</span>${trial?'<span>연결 시험 기간</span>':''}</p><p class="amount">${won(t.used)}</p><p class="scope">연결 카드 ${connectedCount(d)}장 기준 · 전체 지출이 아니에요</p>${known?'':`<p class="hero-empty">이 달에 수집된 자료가 아직 없어요. 0원이라는 뜻은 아니에요.</p><button class="text-button" data-action="previous" type="button">지난달 보기</button>`}<dl class="metrics"><div><dt>${d.planState==='saved'?`${monthWord(d.month)} 예산`:'임시 예산'}</dt><dd>${won(t.planned)}</dd></div><div><dt>수집분 기준 잔여</dt><dd${remain}>${won(t.remaining)}</dd></div></dl><p class="basis">대출·저축 배정액까지 포함한 예산에서 수집된 사용액만 뺀 값이에요.</p></section>`;
}
const skeleton=()=>`<section class="hero" aria-labelledby="hero-label"><p id="hero-label" class="hero-label"><span>연결 카드 수집 사용액</span></p><p class="amount"><span class="skeleton"></span></p><p class="scope">예산을 불러오고 있어요.</p><dl class="metrics"><div><dt>이번 달 예산</dt><dd><span class="skeleton"></span></dd></div><div><dt>수집분 기준 잔여</dt><dd><span class="skeleton"></span></dd></div></dl><p class="basis">대출·저축 배정액까지 포함한 예산에서 수집된 사용액만 뺀 값이에요.</p></section>`;
const unregistered='<div class="notice-card" role="alert"><h2>아직 우리 집에 연결되지 않은 계정이에요</h2><p>가족에게 연결 상태를 확인해 달라고 해 주세요.</p></div>';
const unstable=(button='<button data-action="page-reload" type="button">다시 시도</button>')=>`<div class="notice-card warn" role="alert"><h2>연결이 불안정해요</h2><p>인터넷 연결을 확인한 뒤 다시 시도해 주세요. 로그인은 그대로예요.</p>${button}</div>`;
function plansMarkup(d){
 const rows=categoriesFor(slot).map(([key,label])=>{
  const used=d.used?.[key]??0,budget=d.budget?.[key]??null,over=budget!==null&&used>budget;
  return `<article class="budget-row ${over?'over':''}"><div class="budget-row-head"><h3>${label}</h3><strong>${used>0?won(used):'—'}<small> / ${budget===null?'예산 미설정':won(budget)}</small></strong></div><progress class="bar" max="${budget>0?budget:Math.max(used,1)}" value="${used}" aria-label="${label} 분류된 사용액 ${won(used)}"></progress>${used===0?'':over?`<p class="row-note">${won(used-budget)} 초과</p>`:''}</article>`;
 }).join('');
 const hint=d.needsReview?'수집 합계가 바뀌어 기존 분류를 다시 확인해야 해요.':slot==='partner'&&!d.ownAllocations?.some(x=>x.net!=null)?'카드 주인이 목적별로 나누면 예산 막대에 반영돼요.':'용돈·구독 등 목적별로 나누면 예산 막대에 반영돼요.';
 return `<section class="panel" aria-labelledby="plans-title"><div class="section-top"><h2 id="plans-title">항목별 예산</h2><button data-edit="plan" class="secondary" type="button">예산 조정</button></div><div class="unsplit"><span>아직 나누지 않은 금액</span><strong>${won(d.unclassified)}</strong></div><p class="tracking-note">${hint}</p>${rows}</section>`;
}
function refreshMarkup(state){
 const time=state.updatedAt?clock(state.updatedAt):'';
 if(state.failed)return `<div class="refresh-row failed"><span>갱신하지 못했어요 · ${time} 기준</span><button class="text-button" data-action="reload" type="button">다시 시도</button></div>`;
 return `<div class="refresh-row"><span>${time} 기준</span><button class="text-button" data-action="reload" type="button"${state.refreshing?' disabled':''}>${state.refreshing?'불러오는 중':'새로고침'}</button></div>`;
}
const homeTipMarkup=()=>`<div class="notice-card" id="home-tip"><h2>홈 화면에 추가하면 앱처럼 열 수 있어요</h2><p>Safari 공유 버튼에서 ‘홈 화면에 추가’를 눌러 주세요. 처음 열 때 다시 로그인해야 할 수 있어요.</p><button class="secondary" data-action="close-tip" type="button">닫기</button></div>`;
function controls(state){
 const month=state.month??currentKstMonth(),input=$('#month');
 // Keep the native picker open during background checks.
 if(document.activeElement!==input)input.value=month;
 input.max=currentKstMonth();input.disabled=state.busy;
 $('#next').disabled=state.busy||month>=currentKstMonth();$('#prev').disabled=state.busy||month<='2000-01';$('#save').disabled=state.busy||state.conflict;
}
function render(state){
 if(state.phase==='signed-out'){rendered='';if(authenticated)reset(state.message);return;}
 controls(state);
 $('#content').setAttribute('aria-busy',String(state.busy));
 if($('#editor').open){$('#edit-error').textContent=state.message;$('#conflict-reload').hidden=!state.conflict;return;}
 const box=$('#content');
 if(state.phase==='loading'){rendered='';box.innerHTML=skeleton();say('예산을 불러오고 있어요.');return;}
 if(state.phase==='unregistered'){rendered='';say('');box.innerHTML=unregistered;return;}
 if(state.phase==='error'){rendered='';say('');box.innerHTML=unstable('<button data-action="retry" type="button">다시 시도</button>');return;}
 if(state.phase!=='ready')return;
 const d=state.data,refresh=refreshMarkup(state),signature=JSON.stringify([d,slot,homeTip]);
 say(state.failed?'갱신하지 못했어요.':'');
 const row=$('#refresh-slot');
 // Unchanged values only update the time row, so scroll, focus and open cards stay put.
 if(signature===rendered&&row){row.innerHTML=refresh;return;}
 const open=new Set([...box.querySelectorAll('details[open][data-key]')].map(x=>x.dataset.key));
 rendered=signature;
 box.innerHTML=`${heroMarkup(d)}<div id="refresh-slot">${refresh}</div>${homeTip?homeTipMarkup():''}<div class="budget-columns">${cardPanels(d,slot)}${plansMarkup(d)}</div>`;
 for(const item of box.querySelectorAll('details[data-key]'))if(open.has(item.dataset.key))item.open=true;
}
function reset(message=''){
 authenticated=false;rendered='';slot=null;clearEditor();showOwnerNav(null);
 $('#content').replaceChildren();model.clear('');loginNote(message);view('login');
}
// A closed sheet keeps no amounts in the page.
function clearEditor(){
 $('#editor').close();editKind=null;$('#fields').replaceChildren();
 for(const id of ['#edit-title','#edit-note','#edit-error','#edit-total'])$(id).textContent='';
}
// Before the session and role are known, month moves cannot load anything.
function unavailable(markup){view('app');$('.month-bar').hidden=true;$('#content').innerHTML=markup;}
function loginNote(text){$('#login-note').textContent=text;$('#login-note').hidden=!text;}
function openEditor(kind,card='hana'){
 const d=model.state.data;if(!d||model.state.busy)return;model.dismiss();editKind=kind;editCard=card;
 const allocation=d.ownAllocations?.find(x=>x.card===card)??(card==='hana'?d.ownAllocation:null);if(kind!=='plan'&&!allocation)return;
 const cats=kind==='plan'?categoriesFor(slot):cardCategoriesFor(slot),values=kind==='plan'?d.budget:allocation?.amounts;
 $('#edit-title').textContent=kind==='plan'?`${monthWord(model.state.month)} 예산 조정`:`내 ${short[card]??'카드'} 합계 나누기`;
 $('#edit-note').textContent=kind==='plan'?'이 달에만 적용되고 다른 기기에도 함께 저장돼요.':`수집 합계 ${won(allocation.net)} 안에서 배분해 주세요. 나머지는 미분류로 남아요.`;
 $('#fields').innerHTML=cats.map(([key,label])=>`<label>${label}<input name="${key}" type="number" min="0" max="1000000000" step="1" inputmode="numeric" required value="${values?.[key]??0}"></label>`).join('');
 $('#edit-error').textContent='';$('#conflict-reload').hidden=true;updateEditTotal();$('#editor').showModal();
}
function updateEditTotal(){const total=[...$('#fields').querySelectorAll('input')].reduce((a,e)=>a+Number(e.value||0),0);$('#edit-total').textContent=`합계 ${won(total)}`;}
function closeEditor(){
 const kind=editKind;afterEditor();
 if(kind==='plan')$('[data-edit=plan]')?.focus();
}
// After a conflict the shown values are stale, so closing the sheet fetches the latest ones.
function afterEditor(){
 const stale=model.state.conflict;clearEditor();model.dismiss();render(model.state);
 if(stale)load();
}
// The confirmed month, not an unfinished picker value, is what background checks reload.
function load(month=model.state.month??currentKstMonth(),options){if(authenticated&&slot&&!$('#editor').open)return model.load(month,options);}
$('#fields').addEventListener('input',updateEditTotal);
$('#content').addEventListener('click',event=>{
 const edit=event.target.closest('[data-edit]');if(edit)return openEditor(edit.dataset.edit,edit.dataset.card);
 const action=event.target.closest('[data-action]')?.dataset.action;
 if(action==='reload'||action==='retry')load();
 else if(action==='page-reload')location.reload();
 else if(action==='re-enter')enter();
 else if(action==='previous')load(shiftMonth($('#month').value,-1));
 else if(action==='close-tip'){homeTip=false;rendered='';render(model.state);}
});
$('#close').onclick=closeEditor;
$('#editor').addEventListener('cancel',()=>{queueMicrotask(afterEditor);});
$('#conflict-reload').onclick=async()=>{
 const kind=editKind;
 if(!await model.resolveConflict())return;
 if(!$('#editor').open||kind!=='plan')return;
 const budget=model.state.data.budget;
 for(const input of $('#fields').querySelectorAll('input'))input.value=budget?.[input.name]??0;
 updateEditTotal();$('#conflict-reload').hidden=true;$('#edit-error').textContent='최신 예산을 불러왔어요. 확인하고 다시 저장해 주세요.';
};
$('#edit-form').onsubmit=async event=>{
 event.preventDefault();const amounts=Object.fromEntries([...$('#fields').querySelectorAll('input')].map(input=>[input.name,Number(input.value)]));
 const total=Object.values(amounts).reduce((a,b)=>a+b,0);
 if(Object.values(amounts).some(n=>!Number.isSafeInteger(n)||n<0)||total>1000000000||(editKind==='classification'&&total>(model.state.data.ownAllocations?.find(x=>x.card===editCard)??model.state.data.ownAllocation).net)){$('#edit-error').textContent='입력한 금액과 합계를 확인해 주세요.';return;}
 if(await model.save(editKind,amounts,editCard)){closeEditor();say(model.state.failed?'저장했어요. 최신 금액은 새로고침해 확인해 주세요.':'저장했어요.');}
};
$('#month').onchange=()=>load($('#month').value);
$('#prev').onclick=()=>load(shiftMonth($('#month').value,-1));
$('#next').onclick=()=>load(shiftMonth($('#month').value,1));
$('#logout').onclick=async()=>{
 reset('');$('#login-form button').disabled=true;
 const result=await endDeviceSession(client.auth,storage);
 loginNote(logoutMessage(result));
 $('#login-form button').disabled=false;
};
async function enter(){
 const id=++entry;authenticated=true;slot=null;view('app');$('.month-bar').hidden=false;
 let context;
 try{context=await call('household_context',{});}
 catch(error){
  if(id!==entry||!authenticated)return;
  const kind=failureKind(error);
  if(kind==='expired')return reset('로그인이 끝났어요. 다시 로그인해 주세요.');
  // The role decides labels and owner links, so nothing renders until it is known.
  return unavailable(kind==='unregistered'?unregistered:unstable('<button data-action="re-enter" type="button">다시 시도</button>'));
 }
 if(id!==entry||!authenticated)return;
 slot=context?.memberSlot==='partner'?'partner':'me';showOwnerNav(slot);
 const browser=browserContext();
 await model.load(currentKstMonth());
 if(browser.safari&&!browser.standalone&&!seenHomeTip()&&model.state.phase==='ready'){homeTip=true;markHomeTip();rendered='';render(model.state);}
}
$('#login-form').addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget,attempt=++loginAttempt,button=form.querySelector('button');
 button.disabled=true;button.textContent='로그인 중…';$('#login-error').textContent='';loginNote('');
 const username=form.elements.username.value.trim(),password=form.elements.password.value;
 try{
  storage.choose(form.elements.remember.checked);await client.auth.startAutoRefresh();
  const {data,error}=await signInWithUsername(client.auth,'https://xcchskngoactqsiiutsp.supabase.co/functions/v1/household-login',username,password);
  if(attempt!==loginAttempt)return;
  if(error&&(error.status===undefined||error.status===0||error.status>=500))throw Error('network');
  if(error||!data?.session){form.elements.password.value='';$('#login-error').textContent=error?.status===429?'로그인 시도가 많아요. 잠시 뒤 다시 시도해 주세요.':'아이디나 비밀번호가 맞지 않아요. 다시 입력해 주세요.';form.elements.password.focus();return;}
  form.reset();if(persistenceUnavailable)showStorageWarning();await enter();$('#page-title').focus();
 }catch{if(attempt===loginAttempt){form.elements.password.value='';$('#login-error').textContent='연결이 불안정해요. 인터넷 연결을 확인한 뒤 다시 로그인해 주세요.';}}
 finally{button.disabled=false;button.textContent='로그인';}
});
$('#copy-link').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);$('#copy-link').textContent='복사했어요';}catch{$('#copy-link').textContent='복사하지 못했어요';}};
client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||(event==='TOKEN_REFRESHED'&&!session)){if(authenticated){storage.forget();reset('로그인이 끝났어요. 다시 로그인해 주세요.');}}});
addEventListener('pagehide',()=>{if(authenticated)model.clear('');});
addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
$('#in-app').hidden=!browserContext().inApp;
view('restoring');
try{
 const {data,error}=await client.auth.getSession();
 if(data?.session)await enter();
 // Only a rejected session asks for a new login; server or network trouble keeps the saved one.
 else if(error&&error.status!==401)unavailable(unstable());
 else{if(error)loginNote('로그인이 끝났어요. 다시 로그인해 주세요.');view('login');}
}catch{unavailable(unstable());}
setInterval(()=>{if(authenticated&&!document.hidden&&!$('#editor').open&&model.state.phase==='ready')load(undefined,{quiet:true});},30000);
addEventListener('visibilitychange',()=>{if(!document.hidden&&authenticated&&!$('#editor').open&&model.state.phase==='ready')load(undefined,{quiet:true});});
