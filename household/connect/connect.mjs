import {hanaSummaryText,hanaSummaryDisplay} from './summary.mjs?v=design07';
import {connectionHealth} from './health.mjs?v=0.94';
import {currentKstMonth,shiftMonth} from './months.mjs?v=health1';
import {createClient} from '../account/client.mjs?v=web12';
import {createSessionStorage,endDeviceSession,logoutMessage,SESSION_KEY} from '../account/session.mjs?v=web12';
import {createPairingState} from './state.mjs?v=design07';
const $=s=>document.querySelector(s);
const guide=document.querySelector('#guide');
function openGuide(){if(location.hash==='#guide'){guide.open=true;guide.scrollIntoView({block:'start'});}}
addEventListener('hashchange',openGuide);openGuide();

const storage=createSessionStorage(()=>localStorage);
const client=createClient('https://xcchskngoactqsiiutsp.supabase.co','sb_publishable_sONZt44kSnkbF8mjzoAgGQ_QOfmwm1v',{
 auth:{persistSession:true,storage,storageKey:SESSION_KEY,autoRefreshToken:true,detectSessionInUrl:false},
 global:{fetch:(url,options={})=>fetch(url,{...options,cache:'no-store',signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)})}
});
let generation=0;
const model=createPairingState(async(name,args,signal)=>{
 const {data,error}=await client.rpc(name,args).abortSignal(signal);if(error)throw Error('request');return data;
},()=>crypto.getRandomValues(new Uint8Array(32)),state=>{
 $('#status').textContent=state.message;$('#login').hidden=state.authenticated;$('#actions').hidden=!state.authenticated;
 $('#pair').disabled=state.busy||!state.owner||!state.summary||Boolean(state.summary.deviceId);
 $('#revoke').disabled=state.busy||!state.owner||!state.summary?.deviceId;$('#reload').disabled=state.busy;
 $('#secret').hidden=!state.token;$('#token').value=state.token;
 const s=state.summary;
 $('#capture-total').textContent=state.authenticated?hanaSummaryText(s):'';
 const display=state.authenticated?hanaSummaryDisplay(s):{amount:'—',caption:''};
 $('#capture-amount').textContent=display.amount;$('#capture-caption').textContent=display.caption;
 const health=state.authenticated?connectionHealth(s,state.owner):{title:'',next:'',detail:''};
 $('#connection').textContent=health.title;$('#next-step').textContent=health.next;$('#diagnostic').textContent=health.detail;
 $('#diagnostic').hidden=!state.authenticated||!state.owner;
 $('#month').value=state.month??currentKstMonth();$('#month').max=currentKstMonth();
 $('#month').disabled=state.busy;$('#previous-month').disabled=state.busy||!shiftMonth(state.month,-1);
 $('#next-month').disabled=state.busy||!state.month||state.month>=currentKstMonth();
});
const cardStates={'not-paired':'연결 전','revoked':'연결 해제됨','expired':'연결 만료','profile-pending':'카드 확인 대기','pilot':'일부 수집'};
async function showCardStates(){
 try{const {data,error}=await client.rpc('card_tracking',{p_month:currentKstMonth()});if(error)throw error;
  for(const item of document.querySelectorAll('[data-card-state]'))item.textContent=cardStates[data.find(c=>c.card===item.dataset.cardState)?.state]??'상태 확인 필요';
 }catch{for(const item of document.querySelectorAll('[data-card-state]'))item.textContent='상태를 불러오지 못했어요';}
}
function clear(message){generation++;model.clear(message);}
$('#pair').onclick=()=>model.pair();$('#revoke').onclick=()=>{if(confirm('이 폰의 서버 연결을 해제할까요? 이후 전송이 중단됩니다. 이미 반영된 합계는 유지됩니다.'))model.revoke();};$('#reload').onclick=()=>model.load();
 $('#month').onchange=()=>model.load($('#month').value);
 $('#previous-month').onclick=()=>model.load(shiftMonth(model.state.month,-1));
 $('#next-month').onclick=()=>model.load(shiftMonth(model.state.month,1));
$('#copy').onclick=async()=>{const e=generation;try{await navigator.clipboard.writeText(model.state.token);if(e===generation)$('#status').textContent='키를 복사했습니다. 앱에 붙여넣고 클립보드에서 삭제해 주세요.';}catch{if(e===generation)$('#status').textContent='복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.';}};
$('#logout').onclick=async()=>{clear('로그아웃 중입니다.');const e=generation;const result=await endDeviceSession(client.auth,storage);if(e===generation||!model.state.authenticated)model.clear(logoutMessage(result));};
client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||(event==='TOKEN_REFRESHED'&&!session)){storage.forget();clear('로그인이 종료됐습니다.');}});
addEventListener('storage',e=>{if((e.key===SESSION_KEY&&e.newValue===null)||e.key===null){storage.forget();clear('다른 탭에서 로그아웃했습니다.');}});
addEventListener('pagehide',()=>clear('화면을 떠나 연결 키를 지웠습니다.'));
addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
const initial=generation;
try{const {data,error}=await client.auth.getSession();if(initial===generation){if(!error&&data.session){showCardStates();await model.load();}else clear('로그인 후 이 페이지로 돌아와 주세요.');}}
catch{if(initial===generation)clear('로그인을 확인하지 못했어요. 로그인 화면에서 다시 확인해 주세요.');}

