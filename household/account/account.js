import {createClient} from './client.mjs?v=web12';
import {createAssetState,assetTotals} from './state.mjs?v=web12';
import {createSessionStorage,endDeviceSession,logoutMessage,SESSION_KEY} from './session.mjs?v=web12';
import {showOwnerNav} from '../shared/page.mjs?v=web12';
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const won=n=>(n<0?'−':'')+new Intl.NumberFormat('ko-KR').format(Math.abs(n))+'원';
const sessionStorage=createSessionStorage(()=>window.localStorage);
const client=createClient('https://xcchskngoactqsiiutsp.supabase.co','sb_publishable_sONZt44kSnkbF8mjzoAgGQ_QOfmwm1v',{
  auth:{persistSession:true,storage:sessionStorage,storageKey:SESSION_KEY,autoRefreshToken:true,detectSessionInUrl:false},
  global:{fetch:(url,options={})=>fetch(url,{...options,cache:'no-store',signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)})}
});
let signedIn=false,leaving=false,restoring=true,trouble=false,rendered='';
const model=createAssetState(async(name,args,signal)=>{
  const {data,error,status}=await client.rpc(name,args).abortSignal(signal);
  if(error)throw Object.assign(Error(error.message),{code:error.code,status});return data;
},render);
// Ownership reads from the viewer's side; the stored owner value never changes.
const ownerLabel=(owner,slot)=>owner==='household'?'가계':owner===slot?'본인':owner==='me'||owner==='partner'?'배우자':'확인 필요';
const clock=t=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit'}).format(t);
const refreshRow=state=>state.failed?`<div class="refresh-row failed"><span>갱신하지 못했어요 · ${clock(state.updatedAt)} 기준</span><button class="text-button" data-action="reload" type="button">다시 시도</button></div>`:`<div class="refresh-row"><span>${clock(state.updatedAt)} 기준</span><button class="text-button" data-action="reload" type="button">새로고침</button></div>`;
const unstable=action=>`<div class="notice-card warn" role="alert"><h2>연결이 불안정해요</h2><p>인터넷 연결을 확인한 뒤 다시 시도해 주세요. 로그인은 그대로예요.</p><button data-action="${action}" type="button">다시 시도</button></div>`;
function render(state){
  if(state.phase==='signed-out')signedIn=false;
  $('#login-needed').hidden=state.phase!=='signed-out'||restoring||trouble;
  $('#logout-row').hidden=!signedIn;
  $('#message').textContent=state.message;
  $('#assets').setAttribute('aria-busy',String(state.phase==='loading'));
  if(state.phase!=='ready'){
    rendered='';$('#assets').replaceChildren();
    if(trouble)$('#assets').innerHTML=unstable('page-reload');
    else if(state.phase==='error')$('#assets').innerHTML=unstable('reload');
    else if(state.phase==='unregistered')$('#assets').innerHTML='<div class="notice-card" role="alert"><h2>아직 우리 집에 연결되지 않은 계정이에요</h2><p>가족에게 연결 상태를 확인해 달라고 해 주세요.</p></div>';
    return;
  }
  showOwnerNav(state.context.memberSlot);
  // Unchanged balances only update the time row, so scroll, focus and open forms stay put.
  const signature=JSON.stringify([state.assets,state.context]),slot$=$('#refresh-slot');
  if(signature===rendered&&slot$){slot$.innerHTML=refreshRow(state);return;}
  const open=new Set([...$('#assets').querySelectorAll('details[open][data-key]')].map(x=>x.dataset.key));
  rendered=signature;
  if(!state.assets.length){$('#assets').innerHTML='<div class="notice-card"><h2>아직 등록된 자산이 없어요</h2><p>초기 자산 이관을 준비 중입니다.</p><a href="../budget/">월 예산 보기</a></div>';return;}
  const total=assetTotals(state.assets),slot=state.context.memberSlot;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  $('#assets').innerHTML=`<div class="summary-card"><small>확인된 순자산</small><p class="net">${won(total.net)}</p><div class="pair"><div><small>확인된 자산</small><strong>${won(total.assets)}</strong></div><div><small>확인된 부채</small><strong>${won(total.liabilities)}</strong></div></div></div><div id="refresh-slot">${refreshRow(state)}</div>${total.missing?`<p class="warn-line">미확인 잔액 ${total.missing}개를 제외한 합계예요. 미입력은 0원이 아니에요.</p>`:''}<p class="message">자산별 마지막 확인 잔액이에요. 기준일이 다를 수 있고 실시간 금융기관 잔액은 아니에요.</p>`+
    state.assets.map(a=>`<article class="asset"><div class="asset-head"><h2>${esc(a.label)}</h2><strong>${a.value===null?'잔액 미확인':won(a.value)}</strong></div><dl><dt>관리 구분</dt><dd>${ownerLabel(a.owner,slot)}</dd><dt>잔액 기준일</dt><dd>${esc(a.asOf??'미확인')}</dd></dl>${a.included?'':'<p class="excluded-note">가계 합계 제외</p>'}<details data-key="${esc(a.id)}"><summary>이 자산 수정</summary><form data-asset="${esc(a.id)}" data-version="${a.version}"><p class="message">출금가능액(총평가액에 포함): ${a.available===null?'미확인':won(a.available)}</p><label>잔액 (원)<input name="value" type="number" min="0" max="1000000000000" step="1" value="${a.value??''}" inputmode="numeric"></label><label>출금가능액 (원)<input name="available" type="number" min="0" max="1000000000000" step="1" value="${a.available??''}" ${a.kind==='liability'?'readonly':''} inputmode="numeric"></label><label>잔액 기준일<input name="asOf" type="date" min="2000-01-01" max="${today}" value="${esc(a.asOf??'')}"></label><label class="check"><input name="included" type="checkbox" ${a.included?'checked':''}>가계 합계에 포함</label><p class="message">모르는 금액·기준일은 빈칸으로 남겨 주세요.</p><button type="submit">잔액 저장</button></form></details></article>`).join('');
  for(const item of $('#assets').querySelectorAll('details[data-key]'))if(open.has(item.dataset.key))item.open=true;
}
client.auth.onAuthStateChange((event,session)=>{
  if(event==='SIGNED_OUT'||(event==='TOKEN_REFRESHED'&&!session)){signedIn=false;sessionStorage.forget();model.clear('로그인이 끝났어요. 다시 로그인해 주세요.');}
});
$('#logout').onclick=async()=>{
  leaving=true;signedIn=false;model.clear('로그아웃 중이에요.');
  const result=await endDeviceSession(client.auth,sessionStorage);
  model.clear(logoutMessage(result));
};
$('#assets').addEventListener('click',event=>{
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(action==='reload')model.load();else if(action==='page-reload')location.reload();
});
$('#assets').addEventListener('submit',async event=>{
  const form=event.target.closest('form[data-asset]');if(!form)return;event.preventDefault();
  const inputs=form.elements,button=form.querySelector('button');button.disabled=true;
  const number=name=>inputs[name].value===''?null:Number(inputs[name].value);
  try {const saved=await model.save(form.dataset.asset,Number(form.dataset.version),{value:number('value'),available:number('available'),asOf:inputs.asOf.value,included:inputs.included.checked});if(saved)$('#message').textContent='잔액을 저장했어요.';}
  catch(error){if(signedIn)$('#message').textContent=error.message;}finally{button.disabled=false;}
});
window.addEventListener('pagehide',()=>{leaving=true;signedIn=false;model.clear();});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
window.addEventListener('storage',event=>{
  if((event.key===SESSION_KEY&&event.newValue===null)||event.key===null){leaving=true;signedIn=false;sessionStorage.forget();model.clear('다른 탭에서 로그아웃했어요.');}
});
render(model.state);
// Fetch fresh balances after restoring Auth. Never restore a cached finance screen.
$('#message').textContent='저장된 로그인을 확인하고 있어요.';
try {
  const {data,error}=await client.auth.getSession();
  restoring=false;
  if(!leaving){
    // A rejected or expired session needs a new login; only other failures are connection trouble.
    if(error?.status===401)model.clear('로그인이 끝났어요. 다시 로그인해 주세요.');
    else if(error){trouble=true;model.clear('');}
    else if(data.session){signedIn=true;await model.load();}
    else model.clear('');
  }
} catch {restoring=false;trouble=true;if(!leaving)model.clear('');}
