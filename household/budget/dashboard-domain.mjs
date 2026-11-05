export const CARDS=[
 {id:'hana',owner:'me',name:'하나 MOVING ONLINE',purpose:'구독료 · 개인 용돈',icon:'coffee'},
 {id:'nh',owner:'me',name:'NH zgm 할인',purpose:'가족 외식 · 카페 · 마트 · 통신비 · 관리비 · 생활비 · 쇼핑비',icon:'house'},
 {id:'kb',owner:'me',name:'KB 쿠팡 와우',purpose:'쿠팡 · 쿠팡이츠',icon:'bag'},
 {id:'shinhan',owner:'me',name:'신한 K-패스',purpose:'대중교통 · 주유 · 택시',icon:'bus'},
 {id:'shinhan_bab',owner:'partner',name:'신한 밥친구',purpose:'배민 장보기 · 배달음식',icon:'food'},
 {id:'samsung',owner:'partner',name:'삼성 회사카드',purpose:'개인 소비',icon:'heart'}
];
export const CATEGORIES=[
 {key:'grocery',name:'마트·생활',icon:'bag',group:'함께 쓰는 생활비'},
 {key:'dining',name:'외식·배달',icon:'food',group:'함께 쓰는 생활비'},
 {key:'baby',name:'쇼핑·아기',icon:'heart',group:'함께 쓰는 생활비'},
 {key:'transport',name:'교통·주유',icon:'bus',group:'함께 쓰는 생활비'},
 {key:'gifts',name:'경조사·기타',icon:'gift',group:'함께 쓰는 생활비'},
 {key:'personal_me',name:'본인 용돈',icon:'user',group:'우리 각자의 예산'},
 {key:'personal_partner',name:'배우자 용돈',icon:'user',group:'우리 각자의 예산'},
 {key:'insurance',name:'보험',icon:'shield',group:'정기·기타 지출'},
 {key:'bills',name:'관리비·통신',icon:'house',group:'정기·기타 지출'},
 {key:'subscriptions',name:'구독',icon:'calendar',group:'정기·기타 지출'},
 {key:'grooming',name:'미용',icon:'scissors',group:'정기·기타 지출'}
];
export const FUNDING=[{key:'loan',name:'대출 원리금'},{key:'saving',name:'저축·투자'}];
export const COMMON=[{key:'loan',name:'대출 원리금'},{key:'overdraft_interest',name:'마이너스통장 이자'}];
// Existing allocations remain round-trippable, but retired cards are not offered in the UI.
const RETIRED_PAYS={shinhan_line:'partner',samsung_me:'me'};
export const hasCardPlan=plan=>!!plan?.cardBudgets&&typeof plan.cardBudgets==='object';
export const legacyAllocation=alloc=>Object.entries(alloc??{}).filter(([key])=>Object.hasOwn(RETIRED_PAYS,key)).reduce((sum,[,value])=>sum+(Number.isFinite(number(value))?number(value):0),0);
export const PAYS=[...CARDS.map(c=>({key:c.id,owner:c.owner,name:c.name})),{key:'cash_me',owner:'me',name:'현금'},{key:'cash_partner',owner:'partner',name:'현금'}];
export const digits=n=>new Intl.NumberFormat('ko-KR').format(n);
export const won=n=>n===null||n===undefined?'—':digits(n)+'원';
export const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const clone=value=>JSON.parse(JSON.stringify(value));
export const label=(c,slot)=>c.key==='personal_'+slot?'내 용돈':c.key.startsWith('personal_')?'배우자 용돈':c.name;
export const allowedPays=c=>PAYS.filter(p=>c.key==='personal_me'?p.owner==='me':c.key==='personal_partner'?p.owner==='partner':true);
export function number(value){if(value===null||value==='')return null;const s=String(value);if(!/^(?:[0-9]{1,10}|[0-9]{1,3}(?:,[0-9]{3}){1,3})$/.test(s))return NaN;const n=Number(s.replaceAll(',',''));return n<=1000000000?n:NaN;}
export function emptyPlan(month){return {month,version:0,planState:'unset',budgets:Object.fromEntries([...CATEGORIES,...FUNDING].map(c=>[c.key,null])),allocations:{}};}
export function limit(plan,key){if(hasCardPlan(plan))return CARDS.some(c=>c.id===key)?number(plan.cardBudgets[key]??null):null;let found=false,sum=0;for(const a of Object.values(plan.allocations??{}))if(Object.hasOwn(a,key)&&a[key]!==null){found=true;sum+=a[key];}return found?sum:null;}
export function ownerLimit(plan,slot){const values=PAYS.filter(p=>p.owner===slot).map(p=>limit(plan,p.key)).filter(n=>n!==null);return values.length?values.reduce((a,b)=>a+b,0):null;}
export function totals(plan){
 if(hasCardPlan(plan)){
  const values=CARDS.map(c=>number(plan.cardBudgets[c.id]??null)),commonValues=COMMON.map(c=>number(plan.commonBudgets?.[c.key]??null));
  const sumKnown=rows=>rows.reduce((sum,n)=>sum+(Number.isFinite(n)?n:0),0),missing=values.filter(n=>n===null).length;
  const sum=missing===CARDS.length?null:sumKnown(values),common=commonValues.every(n=>n===null)?null:sumKnown(commonValues);
  return {sum,allocated:sum??0,remaining:0,missing,common,overall:sum===null&&common===null?null:(sum??0)+(common??0)};
 }
 const values=CATEGORIES.map(c=>number(plan.budgets[c.key]));let sum=0,allocated=0,missing=0;
 for(const n of values){if(n===null)missing++;else if(Number.isFinite(n))sum+=n;}
 for(const alloc of Object.values(plan.allocations??{}))for(const v of Object.values(alloc)){const n=number(v);if(Number.isFinite(n))allocated+=n;}
 return {sum:missing===CATEGORIES.length?null:sum,allocated,remaining:sum-allocated,missing};
}
export function validatePlan(plan){const errors={};let grand=0;if(hasCardPlan(plan)){for(const [group,items] of [['cardBudgets',CARDS.map(c=>({key:c.id}))],['commonBudgets',COMMON]])for(const c of items){const n=number(plan[group]?.[c.key]??null);if(n!==null&&!Number.isFinite(n))errors[c.key]='금액은 0원 이상 정수로 입력해 주세요.';else if(n!==null)grand+=n;}if(grand>1000000000)errors.total='전체 계획 합계는 10억 원 이하여야 해요.';return errors;}for(const c of [...CATEGORIES,...FUNDING]){const n=number(plan.budgets[c.key]);if(Number.isNaN(n))errors[c.key]='금액은 0원 이상 정수로 입력해 주세요.';if(n!==null&&Number.isFinite(n))grand+=n;let sum=0,has=false;for(const [key,value] of Object.entries(plan.allocations?.[c.key]??{})){const a=number(value);if(a===null)continue;has=true;const retiredOwner=RETIRED_PAYS[key],permitted=allowedPays(c).some(p=>p.key===key)||(retiredOwner&&(!c.key.startsWith('personal_')||c.key==='personal_'+retiredOwner));if(!permitted||!Number.isFinite(a)||FUNDING.some(f=>f.key===c.key))errors[c.key]='배분 수단과 금액을 확인해 주세요.';else sum+=a;}
 if(n===null&&has)errors[c.key]='먼저 이 항목의 예산을 입력해 주세요.';else if(Number.isFinite(n)&&sum>n)errors[c.key]='이 항목의 예산보다 '+won(sum-n)+' 더 나눴어요.';
 }if(grand>1000000000)errors.total='전체 계획 합계는 10억 원 이하여야 해요.';return errors;}
export function cleanPlan(draft){const plan=clone(draft);if(hasCardPlan(plan)){plan.cardBudgets=Object.fromEntries(CARDS.map(c=>[c.id,number(plan.cardBudgets[c.id]??null)]));plan.commonBudgets=Object.fromEntries(COMMON.map(c=>[c.key,number(plan.commonBudgets?.[c.key]??null)]));return plan;}for(const k of Object.keys(plan.budgets))plan.budgets[k]=number(plan.budgets[k]);for(const [c,a] of Object.entries(plan.allocations)){for(const [k,v] of Object.entries(a)){const n=number(v);if(n===null)delete a[k];else a[k]=n;}if(!Object.keys(a).length)delete plan.allocations[c];}return plan;}
export function status(amount,budget){if(amount==null||budget==null)return {rate:null,remaining:null,tone:'none',color:'var(--j-sage)'};const rate=budget>0?amount/budget:null,remaining=budget-amount,tone=remaining<0||rate>=.9?'danger':rate>=.6?'care':rate>=.3?'steady':'calm';return {rate,remaining,tone,color:{danger:'var(--j-red)',care:'var(--j-orange)',steady:'var(--j-yellow)',calm:'var(--j-sage)'}[tone]};}
export function cardsFor(data,slot){const byKey=new Map((data.cards??[]).map(c=>[c.card,c]));return CARDS.filter(c=>!slot||c.owner===slot).map(c=>({...c,...(byKey.get(c.id)??{net:null,state:'not-paired'})}));}
export function consumption(data,slot){const rows=cardsFor(data,slot),known=rows.filter(c=>c.net!==null&&c.net!==undefined),card=known.length?known.reduce((s,c)=>s+c.net,0):null,cash=slot?(data.ownCashNet??0):(data.cashNet??0);return {card,cash,net:slot?(card===null&&cash===0?null:(card??0)+cash):data.net,known:known.length,count:rows.length};}
export const todayKst=(date=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export function validCash(value,slot,today=todayKst()){
 const amount=number(value.amount),date=value.date,category=value.category;
 if(!Number.isSafeInteger(amount)||amount<1)return '금액은 1원 이상의 정수로 입력해 주세요.';
 if(!/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||date>today)return '실제로 쓴 날짜를 확인해 주세요. 미래 날짜는 입력할 수 없어요.';
 if(!CATEGORIES.some(c=>c.key===category)||category==='personal_'+(slot==='me'?'partner':'me'))return '내가 쓴 소비 항목을 선택해 주세요.';return '';
}


export function importPreviousPlan(current,previous){
 const draft=clone(current);
 if(hasCardPlan(current)){
  if(!hasCardPlan(previous))throw new Error('previous-card-plan-missing');
  draft.cardBudgets=clone(previous.cardBudgets);draft.commonBudgets=clone(previous.commonBudgets??{});
 }else{draft.budgets=clone(previous.budgets);draft.allocations=clone(previous.allocations??{});}
 return draft;
}
export function planSaveRequest(draft){
 const plan=cleanPlan(draft);
 return hasCardPlan(plan)?{name:'household_save_card_budget_plan',args:{p_month:plan.month,p_expected_version:plan.cardBudgetVersion,p_card_budgets:plan.cardBudgets,p_common_budgets:plan.commonBudgets}}:{name:'household_save_budget_plan',args:{p_month:plan.month,p_expected_version:plan.version,p_budgets:plan.budgets,p_allocations:plan.allocations}};
}
export const classifiableRows=(data,slot)=>(data.ownAllocations??[]).filter(a=>a.net!==null&&CARDS.some(c=>c.id===a.card&&c.owner===slot));
