export const CATEGORIES=[['loan','대출 원리금'],['insurance','보험'],['bills','관리비·통신'],['grocery','마트·생활'],['dining','외식·배달'],['baby','쇼핑·아기'],['transport','교통·주유'],['personal_me','본인 용돈'],['personal_partner','배우자 용돈'],['subscriptions','구독'],['grooming','미용'],['gifts','경조사·기타'],['saving','저축·투자']];
export const CARD_CATEGORIES=CATEGORIES.filter(([key])=>!['loan','saving','personal_partner'].includes(key));
export function budgetTotals(data){
 const planned=data.budget?Object.values(data.budget).reduce((a,b)=>a+b,0):null;
 return {planned,used:data.net,remaining:planned===null||data.net===null?null:planned-data.net};
}
export function createBudgetState(rpc,render=()=>{}){
 let epoch=0,controller=new AbortController();
 let state={phase:'signed-out',data:null,month:null,message:'',busy:false};
 const emit=patch=>{state={...state,...patch};render({...state});};
 function clear(message='로그인 후 우리 집 예산을 확인하세요.'){
  epoch++;controller.abort();controller=new AbortController();
  state={phase:'signed-out',data:null,month:null,message,busy:false};render({...state});
 }
 async function load(month){
  if(state.busy)return;
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))return;
  const e=epoch;emit({phase:'loading',busy:true,data:null,month,message:'불러오는 중…'});
  try{const data=await rpc('household_budget',{p_month:month},controller.signal);
   if(e===epoch)emit({phase:'ready',data,message:''});
  }catch{if(e===epoch)emit({phase:'error',data:null,message:'예산을 불러오지 못했어요. 로그인·연결을 확인하고 다시 불러와 주세요.'});}
  finally{if(e===epoch)emit({busy:false});}
 }
 async function save(kind,amounts,card='hana'){
  if(state.busy||state.phase!=='ready')return false;
  const e=epoch,d=state.data,month=state.month;const allocation=d.ownAllocations?.find(x=>x.card===card)??(card==='hana'?d.ownAllocation:null);if(kind!=='plan'&&!allocation)return false;emit({busy:true,message:'저장 중…'});
  try{
   const args=kind==='plan'?{p_month:month,p_expected_version:d.version,p_amounts:amounts}:
    {p_month:month,p_expected_version:allocation.version,p_expected_count:allocation.eventCount,p_expected_net:allocation.net,p_amounts:amounts};
   if(kind!=='plan'&&card!=='hana')args.p_card=card;
   await rpc(kind==='plan'?'household_save_budget':card==='hana'?'household_classify_hana':'household_classify_card',args,controller.signal);
   if(e!==epoch)return false;
   emit({busy:false});await load(month);return e===epoch&&state.phase==='ready';
  }catch(error){
   if(e===epoch)emit({message:error.code==='40001'?'다른 수정 또는 새 결제가 반영됐어요. 창을 닫고 새로고침한 뒤 다시 입력해 주세요.':'저장을 확인하지 못했어요. 창을 닫고 새로고침해 저장 상태와 금액을 확인해 주세요.'});return false;
  }finally{if(e===epoch)emit({busy:false});}
 }
 return {load,save,clear,get state(){return {...state};}};
}
