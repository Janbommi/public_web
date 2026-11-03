// Management pages stay hidden until the server confirms the owner account.
import {createClient} from '../account/client.mjs?v=web12';
import {createSessionStorage,SESSION_KEY} from '../account/session.mjs?v=web12';
import {showOwnerNav} from './page.mjs?v=web12';
const $=s=>document.querySelector(s);
const client=createClient('https://xcchskngoactqsiiutsp.supabase.co','sb_publishable_sONZt44kSnkbF8mjzoAgGQ_QOfmwm1v',{auth:{persistSession:true,storage:createSessionStorage(()=>localStorage),storageKey:SESSION_KEY,autoRefreshToken:false,detectSessionInUrl:false}});
let ended=false;
function notice(title,body){$('#owner-view').hidden=true;$('#gate-title').textContent=title;$('#gate-body').textContent=body;$('#gate-notice').hidden=false;$('#gate-wait').hidden=true;}
function end(){ended=true;notice('로그인이 끝났어요','월 예산에서 다시 로그인해 주세요.');}
client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')end();});
addEventListener('storage',event=>{if(event.key===null||(event.key===SESSION_KEY&&event.newValue===null))end();});
addEventListener('pagehide',()=>{ended=true;$('#owner-view').hidden=true;});
try{
 const {data}=await client.auth.getSession();
 if(!data.session)notice('로그인이 필요해요','월 예산에서 로그인해 주세요.');
 else{
  const {data:context,error}=await client.rpc('household_context');
  if(error)notice('연결을 확인해 주세요','잠시 뒤 다시 시도해 주세요.');
  else if(context?.memberSlot==='me'&&!ended){showOwnerNav('me',true);$('#gate-wait').hidden=true;$('#owner-view').hidden=false;}
  else notice('여기는 카드 관리 화면이에요','이 계정에서는 카드 연결을 관리하지 않아요. 예산과 카드 현황은 월 예산에서 볼 수 있어요.');
 }
}catch{notice('연결을 확인해 주세요','잠시 뒤 다시 시도해 주세요.');}
