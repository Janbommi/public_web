import {createClient} from './supabase.mjs';
import {createAssetState,assetTotals} from './state.mjs';
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const won=n=>new Intl.NumberFormat('ko-KR').format(n)+'원';
const client=createClient('https://xcchskngoactqsiiutsp.supabase.co','sb_publishable_sONZt44kSnkbF8mjzoAgGQ_QOfmwm1v',{
  auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:false},
  global:{fetch:(url,options={})=>fetch(url,{...options,cache:'no-store',signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)})}
});
let signedIn=false,loginAttempt=0;
const model=createAssetState(async(name,args,signal)=>{
  const {data,error,status}=await client.rpc(name,args).abortSignal(signal);
  if(error)throw Object.assign(Error(error.message),{code:error.code,status});return data;
},render);
function render(state) {
  if(state.phase==='signed-out')signedIn=false;
  $('#login-panel').hidden=signedIn;$('#account-actions').hidden=!signedIn;
  $('#message').textContent=state.message;
  $('#assets').setAttribute('aria-busy',String(state.phase==='loading'));
  $('#assets').replaceChildren();
  if(state.phase!=='ready')return;
  if(!state.assets.length){$('#assets').innerHTML='<div class="empty"><h2>잔액을 준비하고 있어요.</h2><p>가계 연결은 완료됐습니다. 초기 자산 등록과 이관·대조가 끝나면 이곳에서 같은 잔액을 볼 수 있어요.</p></div>';return;}
  const total=assetTotals(state.assets);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  $('#assets').innerHTML=`<p class="muted">${state.context.memberSlot==='me'?'본인':'배우자'} 계정 · 불러온 시각 ${esc(new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date()))}</p><div class="totals">${[['확인된 자산',total.assets],['확인된 부채',total.liabilities],['확인된 순자산',total.net]].map(([label,value])=>`<div class="total"><small>${label}</small><strong>${won(value)}</strong></div>`).join('')}</div>${total.missing?`<p class="notice">미확인 잔액 ${total.missing}개를 제외한 합계입니다. 미입력은 0원이 아닙니다.</p>`:''}<p class="muted small">자산별 마지막 확인 잔액입니다. 기준일이 다를 수 있으며 실시간 금융기관 잔액은 아닙니다.</p>`+
    state.assets.map(a=>`<article class="asset ${a.included?'':'excluded'}"><div class="asset-head"><h2>${esc(a.label)}</h2><strong>${a.value===null?'잔액 미확인':won(a.value)}</strong></div><dl><dt>명의</dt><dd>${({me:'본인',partner:'배우자',household:'공동'})[a.owner]??'확인 필요'}</dd><dt>잔액 기준일</dt><dd>${esc(a.asOf??'미확인')}</dd><dt>출금가능액 (총평가액에 포함)</dt><dd>${a.available===null?'미확인':won(a.available)}</dd><dt>가계 합계</dt><dd>${a.included?'포함':'제외'}</dd></dl><details><summary>이 자산 잔액 수정</summary><form data-asset="${esc(a.id)}" data-version="${a.version}"><label>잔액 (원)<input name="value" type="number" min="0" max="1000000000000" step="1" value="${a.value??''}" inputmode="numeric"></label><label>출금가능액 (원)<input name="available" type="number" min="0" max="1000000000000" step="1" value="${a.available??''}" ${a.kind==='liability'?'readonly':''} inputmode="numeric"></label><label>잔액 기준일<input name="asOf" type="date" min="2000-01-01" max="${today}" value="${esc(a.asOf??'')}"></label><label class="check"><input name="included" type="checkbox" ${a.included?'checked':''}>가계 합계에 포함</label><p class="muted small">모르는 금액·기준일은 빈칸으로 남겨 주세요.</p><button type="submit">잔액 저장</button></form></details></article>`).join('');
}
client.auth.onAuthStateChange((event,session)=>{
  if(event==='SIGNED_OUT' || (event==='TOKEN_REFRESHED'&&!session)) {signedIn=false;model.clear('로그인이 종료됐습니다.');}
});
$('#login-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget,attempt=++loginAttempt,button=form.querySelector('button');
  button.disabled=true;$('#message').textContent='로그인 확인 중입니다.';
  const email=form.elements.email.value.trim(),password=form.elements.password.value;
  form.elements.password.value='';
  try {
    const {data,error}=await client.auth.signInWithPassword({email,password});
    if(attempt!==loginAttempt)return;
    if(error||!data.session)throw Error('로그인하지 못했어요. 이메일·비밀번호와 계정 등록 상태를 확인해 주세요.');
    signedIn=true;form.reset();await model.load();
  } catch(error) {if(attempt===loginAttempt)$('#message').textContent=error.message.startsWith('로그인하지')?error.message:'연결을 확인하고 다시 로그인해 주세요.';}
  finally {button.disabled=false;}
});
$('#logout').onclick=async()=>{
  loginAttempt++;signedIn=false;model.clear('로그아웃 중입니다.');$('#login-form button').disabled=true;
  try {const {error}=await client.auth.signOut({scope:'local'});model.clear(error?'이 탭의 자료를 지웠습니다. 서버 로그아웃은 확인하지 못했으니 탭을 닫아 주세요.':'로그아웃했습니다.');}
  catch {model.clear('이 탭의 자료를 지웠습니다. 연결 문제로 서버 로그아웃은 확인하지 못했으니 탭을 닫아 주세요.');}
  finally {$('#login-form button').disabled=false;}
};
$('#reload').onclick=()=>model.load();
$('#assets').addEventListener('submit',async event=>{
  const form=event.target.closest('form[data-asset]');if(!form)return;event.preventDefault();
  const inputs=form.elements,button=form.querySelector('button');button.disabled=true;
  const number=name=>inputs[name].value===''?null:Number(inputs[name].value);
  try {const saved=await model.save(form.dataset.asset,Number(form.dataset.version),{value:number('value'),available:number('available'),asOf:inputs.asOf.value,included:inputs.included.checked});if(saved)$('#message').textContent='잔액을 저장했습니다. 다른 기기에서 다시 불러오면 확인할 수 있어요.';}
  catch(error){if(signedIn)$('#message').textContent=error.message;}finally{button.disabled=false;}
});
window.addEventListener('pagehide',()=>{loginAttempt++;signedIn=false;model.clear();});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
render(model.state);
