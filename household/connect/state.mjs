// Credentials live in memory only. A logout/pagehide invalidates every pending result.
import {validMonth,currentKstMonth} from './months.mjs?v=health1';
export function createPairingState(rpc,randomBytes,render=()=>{}){
  let epoch=0,controller=new AbortController();
  let state={authenticated:false,busy:false,owner:false,summary:null,token:'',message:'',month:null};
  const emit=patch=>{state={...state,...patch};render({...state});};
  const current=e=>e===epoch;
  function clear(message='로그인 후 연결할 수 있습니다.'){
    epoch++;controller.abort();controller=new AbortController();
    state={authenticated:false,busy:false,owner:false,summary:null,token:'',message,month:null};render({...state});
  }
  async function load(month=state.month??currentKstMonth()){
    if(state.busy)return;
    if(!validMonth(month)||month>currentKstMonth()){emit({message:'조회할 월을 확인해 주세요.'});return;}
    const e=epoch;emit({busy:true,summary:null,month,message:'연결 상태를 확인하고 있어요.'});
    try{
      const context=await rpc('household_context',{},controller.signal);
      if(!current(e))return;
      const summary=await rpc('hana_summary',{p_month:month},controller.signal);
      if(current(e))emit({authenticated:true,owner:context.memberSlot==='me',summary,message:context.memberSlot==='me'?'본인 계정 · 최신 조회 완료':'배우자 계정 · 최신 조회 완료'});
    }catch{if(current(e))emit({authenticated:false,owner:false,summary:null,token:'',message:'연결 상태를 확인하지 못했어요. 로그인과 인터넷 연결을 확인해 주세요.'});}
    finally{if(current(e))emit({busy:false});}
  }
  async function pair(){
    if(state.busy||!state.authenticated||!state.owner||!state.summary||state.summary.deviceId)return;
    const e=epoch;emit({busy:true,token:'',message:'연결 키를 만들고 있어요.'});
    let token='';
    try{
      token=Array.from(randomBytes(),b=>b.toString(16).padStart(2,'0')).join('');
      if(!/^[a-f0-9]{64}$/.test(token))throw Error('random');
      const result=await rpc('hana_register_device',{p_token:token},controller.signal);
      if(current(e))emit({token,summary:{...state.summary,state:'profile-pending',deviceId:result.deviceId,lastContactAt:null,diagnostic:null},message:'키를 앱에 저장한 뒤 서버 연결을 확인해 주세요.'});
    }catch{if(current(e))emit({token:'',summary:null,message:'발급 결과를 확인하지 못했어요. 상태 새로고침 후 기존 연결이 있으면 해제하고 다시 만드세요.'});}
    finally{token='';if(current(e))emit({busy:false});}
  }
  async function revoke(){
    if(state.busy||!state.owner||!state.summary?.deviceId)return;
    const e=epoch,device=state.summary.deviceId;emit({busy:true,token:'',message:'연결을 해제하고 있어요.'});
    try{await rpc('hana_revoke_device',{p_device:device},controller.signal);if(current(e))emit({summary:{...state.summary,state:'revoked',deviceId:null,diagnostic:null},message:'서버 연결을 해제했습니다. 폰에서도 연결 키를 삭제해 주세요.'});}
    catch{if(current(e))emit({message:'연결 해제를 확인하지 못했어요. 다시 시도해 주세요.'});}
    finally{if(current(e))emit({busy:false});}
  }
  return {load,pair,revoke,clear,get state(){return {...state};}};
}
