import {seed} from './lib/seed.mjs';
import {dashboard,kstMonth,updateBudget,updateAssets,ingest,closeMonth} from './lib/domain.mjs';

export const STORAGE_KEY='ssabu.household.public-demo.v1';
// This adapter handles synthetic data on this browser only. It makes no network requests.
export function createDemoAPI({storage,locks,now=()=>new Date(),uuid=()=>crypto.randomUUID()}) {
  async function operate(path,body) {
    let state;
    try {
      const raw=storage.getItem(STORAGE_KEY);
      state=raw?JSON.parse(raw):seed(now());
      if(state.mode!=='demo'||state.schemaVersion!==1) throw Error('schema');
    } catch {throw new Error('브라우저의 예시 저장소를 읽지 못했습니다. 저장 허용 여부를 확인해 주세요.');}
    const url=new URL(path,'https://demo.invalid');
    if(!body && url.pathname==='/api/dashboard') return dashboard(state,url.searchParams.get('month')??kstMonth(now()),now());
    let result;
    if(url.pathname==='/api/budget') result=updateBudget(state,body.month,body,now());
    else if(url.pathname==='/api/assets') result=updateAssets(state,body,now());
    else if(url.pathname==='/api/close') result=closeMonth(state,body.month,body,now());
    else if(url.pathname==='/api/demo/simulate') {
      const action=body.action;
      if(['personal','subscription','unknown'].includes(action)) {
        const event={id:`demo-${uuid()}`,type:'purchase',amount:action==='subscription'?29000:action==='unknown'?18000:12000,
          occurredAt:now().toISOString(),cardId:'hana',source:'demo',category:action==='subscription'?'subscriptions':action==='unknown'?'unclassified':'personal_me'};
        state.simulation={purchase:event};result=ingest(state,event,now());
      } else {
        if(!state.simulation?.purchase) throw new Error('먼저 가상 결제 한 건을 보내 주세요.');
        if(action==='duplicate') result=ingest(state,state.simulation.purchase,now());
        else if(action==='refund') {
          state.simulation.refund??={id:`demo-${uuid()}`,type:'refund',amount:state.simulation.purchase.amount,
            occurredAt:now().toISOString(),originalId:state.simulation.purchase.id,source:'demo'};
          result=ingest(state,state.simulation.refund,now());
        } else throw new Error('지원하지 않는 시험 동작입니다.');
      }
      result={status:result.status};
    } else throw new Error('공개 미리보기에서 지원하지 않는 요청입니다.');
    try {storage.setItem(STORAGE_KEY,JSON.stringify(state));}
    catch {throw new Error('브라우저에 저장하지 못했습니다. 저장 공간·설정을 확인해 주세요. 변경은 반영되지 않았습니다.');}
    return result;
  }
  return async(path,body)=>{
    if(locks) return locks.request(STORAGE_KEY,()=>operate(path,body));
    if(body) throw new Error('이 브라우저에서는 안전한 저장을 지원하지 않습니다. 최신 브라우저에서 열어 주세요.');
    return operate(path,body);
  };
}
