const ALLOWANCE={me:{personal_me:'내 용돈',personal_partner:'배우자 용돈'},partner:{personal_me:'배우자 용돈',personal_partner:'내 용돈'}};
export const CATEGORIES=[['loan','대출 원리금'],['insurance','보험'],['bills','관리비·통신'],['grocery','마트·생활'],['dining','외식·배달'],['baby','쇼핑·아기'],['transport','교통·주유'],['personal_me','본인 용돈'],['personal_partner','배우자 용돈'],['subscriptions','구독'],['grooming','미용'],['gifts','경조사·기타'],['saving','저축·투자']];
export const CARD_CATEGORIES=CATEGORIES.filter(([key])=>!['loan','saving','personal_partner'].includes(key));
// Labels follow the viewer; the stored category keys never change.
export function categoriesFor(slot){return CATEGORIES.map(([key,label])=>[key,ALLOWANCE[slot]?.[key]??label]);}
export function cardCategoriesFor(slot){const other=slot==='partner'?'personal_me':'personal_partner';return categoriesFor(slot).filter(([key])=>!['loan','saving',other].includes(key));}
export function budgetTotals(data){
 const planned=data.budget?Object.values(data.budget).reduce((a,b)=>a+b,0):null;
 return {planned,used:data.net,remaining:planned===null||data.net===null?null:planned-data.net};
}
// A 401 means the session is gone; a 42501 from a valid session means no household membership.
export function failureKind(error){
 if(error?.status===401)return 'expired';
 if(error?.code==='42501')return 'unregistered';
 return 'network';
}
const MESSAGES={expired:'로그인이 끝났어요. 다시 로그인해 주세요.',unregistered:'',network:''};
export function createBudgetState(rpc,render=()=>{},now=()=>Date.now()){
 let epoch=0,request=0,controller=new AbortController();
 const blank={phase:'signed-out',data:null,month:null,message:'',busy:false,refreshing:false,failed:false,conflict:false,updatedAt:null,failure:null};
 let state={...blank};
 const emit=patch=>{state={...state,...patch};render({...state});};
 function clear(message='로그인 후 우리 집 예산을 확인하세요.'){
  epoch++;request++;controller.abort();controller=new AbortController();
  state={...blank,message};render({...state});
 }
 async function load(month,{quiet=false}={}){
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))return;
  const sameMonth=state.month===month&&state.data!==null;
  // Background checks must not interrupt a save or a load the user asked for.
  if(quiet&&(state.busy||state.refreshing))return;
  if(state.busy&&sameMonth)return;
  const e=epoch,id=++request;
  if(sameMonth)emit({refreshing:!quiet});
  else emit({phase:'loading',busy:true,data:null,month,message:'',failed:false,failure:null,updatedAt:null,conflict:false});
  try{
   const data=await rpc('household_budget',{p_month:month},controller.signal);
   // Fresh values carry the latest version, so an earlier conflict no longer applies.
   if(e===epoch&&id===request)emit({phase:'ready',data,busy:false,refreshing:false,failed:false,failure:null,message:'',conflict:false,updatedAt:now()});
  }catch(error){
   if(e!==epoch||id!==request)return;
   const kind=failureKind(error);
   if(kind==='expired'){clear(MESSAGES.expired);return;}
   // A failed refresh keeps the last values with their time; only a first load shows an error.
   if(sameMonth)emit({busy:false,refreshing:false,failed:true});
   else emit({phase:kind==='unregistered'?'unregistered':'error',data:null,busy:false,refreshing:false,failure:kind});
  }
 }
 async function save(kind,amounts,card='hana'){
  if(state.busy||state.phase!=='ready')return false;
  const e=epoch,d=state.data,month=state.month;const allocation=d.ownAllocations?.find(x=>x.card===card)??(card==='hana'?d.ownAllocation:null);if(kind!=='plan'&&!allocation)return false;
  emit({busy:true,message:'',conflict:false});
  try{
   const args=kind==='plan'?{p_month:month,p_expected_version:d.version,p_amounts:amounts}:
    {p_month:month,p_expected_version:allocation.version,p_expected_count:allocation.eventCount,p_expected_net:allocation.net,p_amounts:amounts};
   if(kind!=='plan'&&card!=='hana')args.p_card=card;
   await rpc(kind==='plan'?'household_save_budget':card==='hana'?'household_classify_hana':'household_classify_card',args,controller.signal);
   if(e!==epoch)return false;
   // The server accepted the save; a failed reload only leaves older values marked as not refreshed.
   emit({busy:false});await load(month);return e===epoch;
  }catch(error){
   if(e!==epoch)return false;
   if(error.status===401){clear(MESSAGES.expired);return false;}
   if(error.code==='40001')emit({busy:false,conflict:true,message:'다른 기기에서 먼저 저장했어요. 입력한 값은 아직 저장되지 않았어요.'});
   else emit({busy:false,message:'저장을 확인하지 못했어요. 창을 닫고 새로고침해 저장 상태와 금액을 확인해 주세요.'});
   return false;
  }
 }
 async function resolveConflict(){
  const month=state.month;emit({conflict:false,message:''});await load(month);
  if(state.failed){emit({conflict:true,message:'최신 예산을 불러오지 못했어요. 다시 시도해 주세요.'});return false;}
  return state.phase==='ready';
 }
 function dismiss(){if(state.conflict||state.message)emit({conflict:false,message:''});}
 return {load,save,clear,resolveConflict,dismiss,get state(){return {...state};}};
}
