import {createClient} from '../account/client.mjs?v=web12';
import {signInWithUsername} from '../account/username.mjs?v=web12';
import {createSessionStorage,endDeviceSession,logoutMessage,SESSION_KEY} from '../account/session.mjs?v=web12';
import {browserContext} from '../shared/page.mjs?v=web12';
import {shiftMonth} from '../connect/months.mjs';
import {CARDS,CATEGORIES,clone,number,won,totals,validatePlan,label,escape,todayKst,validCash,hasCardPlan,importPreviousPlan,planSaveRequest,classifiableRows} from './dashboard-domain.mjs?v=web15';
import * as views from './dashboard-views.mjs?v=web15';
const BASE='https://xcchskngoactqsiiutsp.supabase.co',ENDPOINT=BASE+'/functions/v1/household-login';
const $=s=>document.querySelector(s),root=$('#dashboard'),main=$('#content');
let persistenceUnavailable=false;
const storage=createSessionStorage(()=>localStorage,()=>{persistenceUnavailable=true;$('#remember').checked=false;document.querySelectorAll('.storage-warning').forEach(e=>e.hidden=false);});
const client=createClient(BASE,'',{auth:{storage,storageKey:SESSION_KEY}});
const s={slot:null,month:todayKst().slice(0,7),view:'home',data:null,plan:null,busy:false,saving:false,draft:null,dirty:false,notice:'',cash:null,cashRequest:null,cashUncertain:false};
let epoch=0,request=0,photos=[],authenticated=false,loginAttempt=0,confirm=null,conflict=false;
const pendingKey=()=> 'jjaemiz-cash-pending-'+s.slot;
function pendingId(){try{const id=sessionStorage.getItem(pendingKey());return /^[0-9a-f-]{36}$/.test(id??'')?id:null;}catch{return null;}}
function rememberPending(id){try{if(id)sessionStorage.setItem(pendingKey(),id);else sessionStorage.removeItem(pendingKey());}catch{if(id)s.pendingStorageWarning=true;}}
async function recoverCash(){const id=pendingId(),e=epoch;if(!id)return;const result=await call('household_cash_request_status',{p_request_id:id});if(e!==epoch)return;if(result.saved){rememberPending(null);s.notice='앞서 입력한 현금 지출이 저장되어 있어요.';}else{s.cashRequest=id;s.notice='앞선 현금 저장을 확인하지 못했어요. 다시 입력할 때 같은 확인번호로 중복을 막아요.';}}
const say=text=>$('#announcement').textContent=text;
async function call(name,args={}){const r=await client.rpc(name,args);if(r.error)throw Object.assign(Error('request'),{code:r.error.code,status:r.status??r.error.status});return r.data;}
function show(which){$('#login-panel').hidden=which!=='login';$('#restoring').hidden=which!=='restoring';root.hidden=which!=='app';}
function note(text){$('#login-note').textContent=text;$('#login-note').hidden=!text;}
function forgetPhotos(){photos.forEach(u=>URL.revokeObjectURL(u));photos=[];$('.j-photos').replaceChildren();}
function reset(message=''){epoch++;request++;authenticated=false;forgetPhotos();Object.assign(s,{slot:null,view:'home',data:null,plan:null,draft:null,dirty:false,busy:false,saving:false,cash:null,cashRequest:null,cashUncertain:false,notice:'',cashMessage:''});confirm=null;conflict=false;main.replaceChildren();$('.j-nav').replaceChildren();say('');note(message);show('login');}
function classification(){const selected=classifiableRows(s.data,s.slot),cats=CATEGORIES.filter(c=>c.key!=='personal_'+(s.slot==='me'?'partner':'me'));return '<button class="j-back" data-go="manage">'+views.icon('left')+'관리</button><h1 class="j-title">내 카드 사용액 분류</h1><p class="j-subtitle">이미 쓴 금액을 목적별로 나눠요.<br>예산 계획은 바뀌지 않아요.</p>'+selected.map(a=>'<form class="classify-form j-plan-card" data-card="'+a.card+'"><h2>'+escape(CARDS.find(c=>c.id===a.card)?.name??a.card)+'</h2><p class="j-budget-note">수집 합계 '+won(a.net)+' 안에서 나눠요. 나머지는 미분류예요.</p>'+cats.map(c=>'<div class="j-allocation-row"><label>'+label(c,s.slot)+'</label>'+views.moneyInput('name="'+c.key+'"',a.amounts[c.key]??0,label(c,s.slot)+' 사용액')+'</div>').join('')+'<p class="j-error" role="alert"></p><button class="j-primary" type="submit">사용액 분류 저장</button></form>').join('');}
function render(){
 if(!authenticated||!s.slot)return;
 $('.j-nav').innerHTML=views.navigation(s);
 if(!s.data){main.innerHTML='<div class="j-month"><h1>우리 집 소비</h1></div><p class="j-subtitle">'+(s.busy?'불러오고 있어요.':s.error==='unregistered'?'아직 우리 집에 연결되지 않은 계정이에요.':'연결이 불안정해요. 다시 시도해 주세요.')+'</p>'+(!s.busy?'<button class="j-primary" data-reload>다시 시도</button>':'');return;}
 const fn={home:views.home,budget:views.budget,settings:views.settings,cash:views.cash,'cash-confirm':views.cashConfirm,manage:views.manage,connections:views.connections,classification};
 main.innerHTML=(s.notice?'<p class="j-feedback" role="status">'+escape(s.notice)+'</p>':'')+(fn[s.view]??views.home)(s);
 if(s.view==='settings')updateDraft();
}
function navigate(view,{discard=false}={}){
 if(s.saving)return;
 if(s.cashUncertain&&view!=='cash-confirm'){s.cashMessage='먼저 같은 기록의 저장 여부를 확인해 주세요.';render();return;}
 if(s.view==='settings'&&s.dirty&&!discard&&view!=='settings'){confirm={kind:'leave',view};updateDraft();$('[data-confirm-zone]').scrollIntoView({block:'nearest'});return;}
 if(view==='assets'){location.href='../account/';return;}
 if(view==='settings'){s.draft=clone(s.plan);s.dirty=false;conflict=false;s.saveError='';}
 else{s.draft=null;s.dirty=false;confirm=null;}
 s.view=view;s.notice='';render();main.focus();window.scrollTo({top:0,behavior:'instant'});
}
async function load(month=s.month,{quiet=false}={}){
 if(!authenticated||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||month>todayKst().slice(0,7)||s.saving)return;
 if(quiet&&(s.busy||['settings','cash','cash-confirm','classification'].includes(s.view)))return;
 const e=epoch,id=++request,startedView=s.view,same=s.month===month&&s.data;
 if(!same){s.month=month;s.data=null;s.plan=null;}s.busy=true;s.error=null;if(!quiet)render();
 try{const [data,plan]=await Promise.all([call('household_budget',{p_month:month}),call('household_budget_plan',{p_month:month})]);if(e!==epoch||id!==request)return;Object.assign(s,{data,plan,busy:false,failed:false,updated:Date.now()});if(startedView===s.view||!['settings','cash','cash-confirm','classification'].includes(s.view))render();}
 catch(error){if(e!==epoch||id!==request)return;if(error.status===401)return reset('로그인이 끝났어요. 다시 로그인해 주세요.');s.busy=false;s.failed=true;s.error=error.code==='42501'?'unregistered':'network';render();}
}
function updateDraft(){
 if(!s.draft||s.view!=='settings')return;
 const t=totals(s.draft),errors=validatePlan(s.draft),direct=hasCardPlan(s.draft);
 main.querySelector('#plan-form fieldset').disabled=s.saving;
 $('[data-plan-total]').textContent=won(t.sum);
 if(direct){$('[data-plan-common]').textContent=won(t.common);$('[data-plan-overall]').textContent=won(t.overall);}
 else{
  $('[data-plan-unassigned]').textContent=won(t.sum===null?null:t.remaining);
  for(const c of CATEGORIES){const n=number(s.draft.budgets[c.key]),sum=Object.values(s.draft.allocations[c.key]??{}).reduce((sum,v)=>sum+(Number.isFinite(number(v))?number(v):0),0);$('[data-balance="'+c.key+'"]').textContent=n===null?'예산 미설정':!Number.isFinite(n)?'금액 확인':sum>n?'배분 초과':sum===n?'전액 배분':'미배정 '+won(n-sum);}
 }
 $('[data-save-plan]').disabled=s.saving||conflict||Object.keys(errors).length>0;
 $('[data-plan-error]').textContent=s.saveError||errors.total||'';
 for(const el of main.querySelectorAll('[data-category-error]')){el.textContent=errors[el.dataset.categoryError]??'';el.hidden=!el.textContent;}
 for(const el of main.querySelectorAll('[data-plan-amount],[data-alloc-category],[data-direct-budget]'))el.setAttribute('aria-invalid',errors[el.dataset.budgetKey??el.dataset.planAmount??el.dataset.allocCategory]?'true':'false');
 const zone=$('[data-confirm-zone]');zone.innerHTML=conflict?'<div class="j-confirm"><p>다른 기기에서 먼저 저장했어요. 입력값은 아직 저장되지 않았어요.</p><button data-latest-plan>입력을 취소하고 최신 예산 불러오기</button></div>':confirm?'<div class="j-confirm"><p>'+(confirm.kind==='import'?'입력 중인 예산을 지난달 계획으로 바꿀까요?':'수정한 예산을 저장하지 않고 나갈까요?')+'</p><div class="j-confirm-actions"><button data-confirm>'+ (confirm.kind==='import'?'가져오기':'수정 취소하고 나가기')+'</button><button data-keep>계속 수정</button></div></div>':'';
}
async function importPlan(){const e=epoch,month=s.month;s.saving=true;updateDraft();try{const p=await call('household_budget_plan',{p_month:shiftMonth(month,-1)});if(e!==epoch)return;s.draft=importPreviousPlan(s.draft,p);s.dirty=true;confirm=null;s.saveError='';s.notice=shiftMonth(month,-1)+'월 계획을 가져왔어요. 예산 저장을 눌러야 적용돼요.';}catch(error){if(e!==epoch)return;if(error.status===401)return reset('로그인이 끝났어요. 다시 로그인해 주세요.');s.saveError=error.message==='previous-card-plan-missing'?'지난달에는 카드별 예산이 없어요. 입력값은 그대로예요.':'지난달 예산을 불러오지 못했어요. 입력값은 그대로예요.';}finally{if(e===epoch){s.saving=false;render();}}}
async function savePlan(){if(s.saving||conflict||Object.keys(validatePlan(s.draft)).length)return;const e=epoch,p=planSaveRequest(s.draft);s.saving=true;s.saveError='';render();try{const saved=await call(p.name,p.args);if(e!==epoch)return;s.plan=saved;s.draft=null;s.dirty=false;s.view='budget';s.notice='예산을 저장했어요.';say(s.notice);}catch(error){if(e!==epoch)return;if(error.status===401)return reset('로그인이 끝났어요. 다시 로그인해 주세요.');conflict=error.code==='40001';s.saveError=conflict?'':error.status>=400&&error.status<500?'입력한 금액과 배분을 확인해 주세요.':'저장을 확인하지 못했어요. 입력값을 유지했어요. 다시 저장하면 최신 상태를 확인해요.';}finally{if(e===epoch){s.saving=false;render();}}}
async function saveCash(){if(s.saving)return;const e=epoch;const previouslyPending=pendingId();rememberPending(s.cashRequest);s.saving=true;s.cashUncertain=true;s.cashMessage='저장 여부를 확인하고 있어요.';render();
 if(previouslyPending){try{const status=await call('household_cash_request_status',{p_request_id:s.cashRequest});if(e!==epoch)return;if(status.saved){rememberPending(null);s.cash=null;s.cashRequest=null;s.cashUncertain=false;s.saving=false;s.view='home';s.notice='앞서 입력한 현금 지출이 저장되어 있어요.';await load();return;}}catch(error){if(e!==epoch)return;if(error.status===401)return reset('로그인이 끝났어요. 다시 로그인해 주세요.');if(e===epoch){s.saving=false;s.cashMessage='저장 여부를 확인하지 못했어요. 같은 기록 저장 확인을 다시 눌러 주세요.';render();}return;}}
 try{const result=await call('household_add_cash',{p_request_id:s.cashRequest,p_spent_on:s.cash.date,p_amount_krw:number(s.cash.amount),p_category:s.cash.category});if(e!==epoch)return;if(!result.saved)throw Error('uncertain');rememberPending(null);const month=s.cash.date.slice(0,7),amount=number(s.cash.amount);s.cash=null;s.cashRequest=null;s.cashUncertain=false;s.saving=false;s.view='home';s.notice='현금 지출 '+won(amount)+'을 저장했어요.';await load(month);say(s.notice);}
 catch(error){if(e!==epoch)return;if(error.status===401)return reset('로그인이 끝났어요. 다시 로그인해 주세요.');if(error.status===400||error.status===403){s.cashUncertain=false;s.cashMessage='저장하지 못했어요. 날짜·금액·항목을 확인해 주세요.';}else s.cashMessage='저장 응답을 받지 못했어요. 아래 버튼으로 같은 기록의 저장 여부를 확인해 주세요.';}
 finally{if(e===epoch){s.saving=false;render();}}
}
async function renewCollector(card){
 if(s.saving||s.slot!=='partner'||!CARDS.some(c=>c.id===card&&c.owner===s.slot)||!s.data.cards?.some(c=>c.card===card&&c.canRenew===true))return;
 const e=epoch;s.saving=true;s.renewing=card;s.notice='';render();
 try{
  await call('household_renew_collector',{p_card:card});if(e!==epoch)return;
  s.saving=false;s.renewing=null;s.notice='연결 기간을 90일 연장했어요. 기존 단축어를 그대로 사용해요.';await load();say(s.notice);
 }catch(error){
  if(e!==epoch)return;if(error.status===401)return reset('로그인이 끝났어요. 다시 로그인해 주세요.');
  s.notice='연장을 확인하지 못했어요. 새로고침으로 만료일을 확인한 뒤 다시 시도해 주세요.';
 }finally{if(e===epoch){s.saving=false;s.renewing=null;render();}}
}
async function loadPhotos(){const e=epoch;try{const {data}=await client.auth.getSession();if(e!==epoch||!data?.session)return;for(const name of ['family-first.jpg','family-second.jpg']){const r=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({action:'photo',name}),cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(12000)});if(!r.ok)continue;const blob=await r.blob();if(e!==epoch)return;const url=URL.createObjectURL(blob);photos.push(url);const frame=document.createElement('div'),image=document.createElement('img');frame.className='j-photo';image.src=url;image.alt='우리 가족 사진';frame.append(image);$('.j-photos').append(frame);}}catch{/* Decorative photos never block finance. */}}
async function enter(){const e=++epoch;authenticated=true;s.slot=null;show('app');main.innerHTML='<p class="j-subtitle">우리 집 정보를 불러오고 있어요.</p>';try{const context=await call('household_context');if(e!==epoch)return;s.slot=context.memberSlot==='partner'?'partner':'me';await recoverCash();await load();if(e===epoch)void loadPhotos();}catch(error){if(e!==epoch)return;if(error.status===401)return reset('로그인이 끝났어요. 다시 로그인해 주세요.');main.innerHTML='<p class="j-subtitle">연결을 확인하지 못했어요.</p><button class="j-primary" data-enter>다시 시도</button>';}}
root.addEventListener('click',async event=>{const button=event.target.closest('button');if(!button)return;
 if(button.id==='logout'){reset('');const result=await endDeviceSession(client.auth,storage);note(logoutMessage(result));return;}
 if(button.hasAttribute('data-enter'))return enter();
 if(s.saving)return;
 if(button.dataset.go)return navigate(button.dataset.go);
 if(button.dataset.month)return load(shiftMonth(s.month,Number(button.dataset.month)));
 if(button.hasAttribute('data-reload'))return load();
 if(button.hasAttribute('data-import')){if(s.dirty){confirm={kind:'import'};updateDraft();}else await importPlan();return;}
 if(button.hasAttribute('data-keep')){confirm=null;updateDraft();return;}
 if(button.hasAttribute('data-confirm')){const pending=confirm;confirm=null;if(pending?.kind==='import')await importPlan();else navigate(pending?.view??'budget',{discard:true});return;}
 if(button.hasAttribute('data-latest-plan')){const e=epoch;s.saving=true;try{const p=await call('household_budget_plan',{p_month:s.month});if(e!==epoch)return;s.plan=p;s.draft=clone(p);s.dirty=false;conflict=false;s.saveError='최신 예산을 불러왔어요.';}catch{if(e===epoch)s.saveError='불러오지 못했어요. 다시 시도해 주세요.';}finally{if(e===epoch){s.saving=false;render();}}return;}
 if(button.dataset.addAllocation){const c=button.dataset.addAllocation,key=$('[data-add-pay="'+c+'"]').value;s.draft.allocations[c]??={};s.draft.allocations[c][key]='';s.dirty=true;$('[data-allocation-fields="'+c+'"]').innerHTML=views.allocationFields(CATEGORIES.find(x=>x.key===c),s);updateDraft();return;}
 if(button.dataset.renewCard)return renewCollector(button.dataset.renewCard);
 if(button.hasAttribute('data-save-cash'))await saveCash();
});
root.addEventListener('click',event=>{const link=event.target.closest('a');if(!link)return;if(link.matches('.j-brand')||link.getAttribute('href')==='../account/'){event.preventDefault();navigate(link.matches('.j-brand')?'home':'assets');}});
root.addEventListener('change',event=>{if(event.target.id==='month')load(event.target.value);});
root.addEventListener('input',event=>{const el=event.target;if(s.view==='settings'&&s.draft){if(el.dataset.directBudget)s.draft[el.dataset.directBudget][el.dataset.budgetKey]=el.value;else if(el.dataset.planAmount)s.draft.budgets[el.dataset.planAmount]=el.value;else if(el.dataset.allocCategory)s.draft.allocations[el.dataset.allocCategory][el.dataset.pay]=el.value;else return;s.dirty=true;s.saveError='';confirm=null;updateDraft();}});
root.addEventListener('focusout',event=>{const el=event.target;if(el.matches('input[inputmode="numeric"]')){const n=number(el.value);if(n!==null&&Number.isFinite(n))el.value=new Intl.NumberFormat('ko-KR').format(n);}});
root.addEventListener('submit',async event=>{event.preventDefault();const form=event.target;if(form.id==='plan-form')return savePlan();if(form.id==='cash-form'){const values=Object.fromEntries(new FormData(form)),message=validCash(values,s.slot);if(message){$('#cash-error').textContent=message;return;}s.cash=values;s.cashRequest=pendingId()??crypto.randomUUID();s.cashUncertain=false;s.cashMessage='';s.view='cash-confirm';render();main.focus();window.scrollTo({top:0,behavior:'instant'});return;}
 if(form.matches('.classify-form')){if(s.saving)return;const a=s.data.ownAllocations.find(a=>a.card===form.dataset.card),amounts=Object.fromEntries([...form.querySelectorAll('input')].map(i=>[i.name,number(i.value)??0])),total=Object.values(amounts).reduce((a,b)=>a+b,0);if(Object.values(amounts).some(n=>!Number.isSafeInteger(n))||total>a.net){form.querySelector('.j-error').textContent='분류 합계가 수집액을 넘지 않도록 확인해 주세요.';return;}const e=epoch;s.saving=true;form.querySelector('button').disabled=true;try{await call(a.card==='hana'?'household_classify_hana':'household_classify_card',{p_month:s.month,p_expected_version:a.version,p_expected_count:a.eventCount,p_expected_net:a.net,p_amounts:amounts,...(a.card==='hana'?{}:{p_card:a.card})});if(e!==epoch)return;s.notice='사용액 분류를 저장했어요.';s.saving=false;await load();}catch(error){if(e!==epoch)return;if(error.status===401)return reset('로그인이 끝났어요. 다시 로그인해 주세요.');form.querySelector('.j-error').textContent=error.code==='40001'?'수집액이나 분류가 바뀌었어요. 아래에서 최신 사용액을 불러와 주세요.':'저장을 확인하지 못했어요. 최신 사용액을 불러와 확인해 주세요.';const retry=document.createElement('button');retry.type='button';retry.dataset.reload='';retry.textContent='최신 사용액 불러오기';form.querySelector('.j-error').append(retry);}finally{if(e===epoch){s.saving=false;form.querySelector('button').disabled=false;}}}
});
$('#login-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,attempt=++loginAttempt,button=form.querySelector('button');button.disabled=true;button.textContent='로그인 중…';$('#login-error').textContent='';note('');try{storage.choose(form.elements.remember.checked);const {data,error}=await signInWithUsername(client.auth,ENDPOINT,form.elements.username.value.trim(),form.elements.password.value);if(attempt!==loginAttempt)return;if(error&&(error.status===undefined||error.status===0||error.status>=500))throw Error('network');if(error||!data?.session){form.elements.password.value='';$('#login-error').textContent=error?.status===429?'시도가 많아요. 잠시 뒤 다시 시도해 주세요.':'아이디나 비밀번호를 확인해 주세요.';return;}form.reset();if(persistenceUnavailable)$('#remember').checked=false;await enter();}catch{$('#login-error').textContent='연결이 불안정해요. 잠시 뒤 다시 시도해 주세요.';form.elements.password.value='';}finally{button.disabled=false;button.textContent='로그인';}});
$('#copy-link').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);$('#copy-link').textContent='복사했어요';}catch{$('#copy-link').textContent='복사하지 못했어요';}};
$('#in-app').hidden=!browserContext().inApp;
client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||event==='TOKEN_REFRESHED'&&!session)if(authenticated)reset('로그인이 끝났어요. 다시 로그인해 주세요.');});
addEventListener('storage',event=>{if(event.key===SESSION_KEY&&event.newValue===null||event.key===null)if(authenticated)reset('다른 탭에서 로그아웃했어요.');});
addEventListener('pagehide',()=>{if(authenticated)reset('');});
addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
setInterval(()=>{if(authenticated&&!document.hidden)load(s.month,{quiet:true});},30000);
addEventListener('visibilitychange',()=>{if(!document.hidden&&authenticated)load(s.month,{quiet:true});});
show('restoring');try{const {data,error}=await client.auth.getSession();if(data?.session)await enter();else if(error&&error.status!==401){show('login');note('접속 상태를 확인하지 못했어요. 잠시 뒤 새로고침해 주세요.');}else show('login');}catch{show('login');note('연결을 확인하지 못했어요. 잠시 뒤 새로고침해 주세요.');}

