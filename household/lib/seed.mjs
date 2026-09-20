import { CATEGORIES, defaultBudget, kstMonth, shiftMonth } from './domain.mjs';
// All balances and usage below are invented fixtures, never imported from the workbook.
export function seed(now=new Date()) {
  const current=kstMonth(now), previous=shiftMonth(current,-1), older=shiftMonth(current,-2);
  const state={schemaVersion:1,mode:'demo',months:{},events:[],assetVersion:1,assetHistory:[],reserveHistory:[],
    assetAsOf:new Date(now).toISOString(),capture:{accepted:0,duplicates:0,lastReceivedAt:null},assets:[
      {id:'home',label:'주택 평가액',kind:'property',value:620000000,available:0,included:true},
      {id:'cash',label:'은행 잔액',kind:'bank',value:18400000,available:18400000,included:true},
      {id:'broker',label:'증권 총평가액',kind:'brokerage',value:46700000,available:6200000,included:true},
      {id:'pension',label:'연금 · IRP · DC',kind:'pension',value:32600000,available:0,included:true},
      {id:'subscription',label:'주택청약',kind:'savings',value:8900000,available:0,included:true},
      {id:'club',label:'공동체 자금 (제외 예시)',kind:'brokerage',value:2400000,available:2400000,included:false},
      {id:'mortgage',label:'주택담보대출',kind:'liability',value:338000000,available:0,included:true},
      {id:'overdraft',label:'마이너스통장 사용잔액',kind:'liability',value:12500000,available:0,included:true},
      {id:'car',label:'자동차 할부 잔액',kind:'liability',value:7800000,available:0,included:true}
    ]};
  const cardFor={personal_me:'hana',subscriptions:'hana',personal_partner:'wife_samsung',grocery:'nh',bills:'nh',dining:'nh',baby:'kb',transport:'shinhan',grooming:'hana',gifts:'nh'};
  const currentUsage=[2600000,350000,284000,346000,183000,168000,82000,184000,126000,62900,25000,0,200000];
  const previousUsage=[2600000,350000,292000,453000,218000,182000,134000,326000,248000,82900,40000,30000,200000];
  for(const [month,usage] of [[older,previousUsage.map(n=>Math.floor(n*.96))],[previous,previousUsage],[current,currentUsage]]) {
    state.months[month]={budget:defaultBudget(),version:1,history:[],coverage:'sample',closure:null};
    CATEGORIES.slice(0,-1).forEach((c,i)=>{
      if (!usage[i]) return;
      state.events.push({id:`seed-${month}-${c.id}`,type:c.kind==='consumption'?'purchase':'allocation',amount:usage[i],
        occurredAt:`${month}-01T09:00:00+09:00`,receivedAt:new Date(now).toISOString(),month,category:c.id,
        cardId:cardFor[c.id]??null,owner:c.id==='personal_partner'?'partner':cardFor[c.id]?'me':'household',source:'demo',fingerprint:'seed'});
    });
  }
  const spent=state.events.filter(e=>e.month===older).reduce((s,e)=>s+e.amount,0);
  state.months[older].closure={amount:5500000-spent,closedAt:`${previous}-01T00:00:00+09:00`,updatedAt:`${previous}-01T00:00:00+09:00`,needsReview:false,budgetVersion:1};
  state.months[older].coverage='reviewed';
  return state;
}
