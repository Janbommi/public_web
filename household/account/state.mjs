export function createAssetState(rpc,notify=()=>{}) {
  let generation=0, pending;
  let state={phase:'signed-out',assets:[],context:null,message:''};
  const emit=next=>{state=next;notify(state);};
  function clear(message='') {generation++;pending?.abort();emit({phase:'signed-out',assets:[],context:null,message});}
  async function load() {
    const current=++generation;pending?.abort();pending=new AbortController();
    const signal=AbortSignal.any([pending.signal,AbortSignal.timeout(15000)]);
    emit({phase:'loading',assets:[],context:null,message:'공유 잔액을 확인하고 있어요.'});
    try {
      const context=await rpc('household_context',{},signal);
      const assets=await rpc('household_assets',{},signal);
      if(current!==generation)return;
      if(!context?.householdId || !Array.isArray(assets))throw Error('Invalid response');
      emit({phase:'ready',context,assets,message:''});
    } catch(error) {
      if(current!==generation)return;
      emit({phase:error.code==='42501'?'unregistered':'error',assets:[],context:null,
        message:error.code==='42501'?'로그인은 됐지만 아직 우리 가계에 등록되지 않은 계정이에요.':
          '공유 잔액을 확인하지 못했어요. 연결 상태를 확인한 후 다시 불러오거나 로그인해 주세요.'});
    }
  }
  async function save(id,version,values) {
    if(state.phase!=='ready')throw Error('잔액을 다시 불러와 주세요.');
    const current=generation;
    const {value,available,asOf,included}=values;
    for(const v of [value,available])if(v!==null && (!Number.isSafeInteger(v)||v<0||v>1e12))throw Error('금액을 확인해 주세요.');
    if((value===null&&available!==null)||(available!==null&&available>value))throw Error('출금가능액은 잔액 이하여야 해요.');
    try {
      await rpc('household_save_balance',{p_asset_id:id,p_expected_version:version,p_value_krw:value,
        p_available_krw:available,p_as_of:asOf||null,p_included:included},
        AbortSignal.any([pending.signal,AbortSignal.timeout(15000)]));
      if(current!==generation)return false;
      await load();return true;
    } catch(error) {
      if(current!==generation)return false;
      if(error.code==='40001') {await load();throw Error('다른 곳에서 잔액을 수정했어요. 최신 값을 확인하고 다시 입력해 주세요.');}
      if(error.code==='42501' || error.status===401){clear('접근 권한을 다시 확인하려면 로그인해 주세요.');throw Error('로그인이 필요합니다.');}
      throw Error(error.code==='22023'?'잔액·출금가능액·기준일을 확인해 주세요.':'저장 결과를 확인하지 못했어요. 다시 불러온 후 잔액을 확인해 주세요.');
    }
  }
  return {clear,load,save,get state(){return state;}};
}
export function assetTotals(assets) {
  let assetsTotal=0,liabilities=0,missing=0;
  for(const item of assets.filter(x=>x.included)) {
    if(item.value===null){missing++;continue;}
    if(!Number.isSafeInteger(item.value)||item.value<0)throw Error('Invalid balance');
    if(item.kind==='liability')liabilities+=item.value;else assetsTotal+=item.value;
  }
  if(!Number.isSafeInteger(assetsTotal)||!Number.isSafeInteger(liabilities))throw Error('Invalid total');
  return {assets:assetsTotal,liabilities,net:assetsTotal-liabilities,missing};
}
