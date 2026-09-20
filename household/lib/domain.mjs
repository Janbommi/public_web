export class DomainError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const check = (condition, message, status) => { if (!condition) throw new DomainError(message, status); };
export const amountOK = n => Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000_000_000;
export const CATEGORIES = [
  ['housing', '대출 원리금', 2600000, 'debt'], ['insurance', '보험', 350000, 'consumption'],
  ['bills', '관리비 · 통신', 300000, 'consumption'], ['grocery', '마트 · 생활', 500000, 'consumption'],
  ['dining', '외식 · 배달', 250000, 'consumption'], ['baby', '쇼핑 · 아기', 250000, 'consumption'],
  ['transport', '교통 · 주유', 150000, 'consumption'], ['personal_me', '내 용돈', 400000, 'consumption'],
  ['personal_partner', '배우자 용돈', 300000, 'consumption'], ['subscriptions', '구독', 100000, 'consumption'],
  ['grooming', '미용', 50000, 'consumption'], ['gifts', '경조사 · 기타', 50000, 'consumption'],
  ['savings', '저축 · 투자', 200000, 'saving'], ['unclassified', '분류 대기', 0, 'consumption']
].map(([id, label, planned, kind]) => ({ id, label, planned, kind }));
export const CARDS = [
  {id:'hana',label:'하나카드 · 예시',owner:'me',purpose:'용돈 · 구독',status:'simulation'},
  {id:'nh',label:'NH카드 · 예시',owner:'me',purpose:'가족 생활비',status:'pending'},
  {id:'kb',label:'쇼핑 카드 · 예시',owner:'me',purpose:'쿠팡 · 쿠팡이츠',status:'pending'},
  {id:'shinhan',label:'교통 카드 · 예시',owner:'me',purpose:'교통 · 주유',status:'pending'},
  {id:'samsung',label:'보조 카드 · 예시',owner:'me',purpose:'회사 연계 유지',status:'pending'},
  {id:'wife_shinhan',label:'배달 카드 · 예시',owner:'partner',purpose:'장보기 · 배달',status:'planned'},
  {id:'wife_hyundai',label:'생활 카드 · 예시',owner:'partner',purpose:'쇼핑 · 아기용품',status:'planned'},
  {id:'wife_samsung',label:'개인 카드 · 예시',owner:'partner',purpose:'개인 용돈',status:'pending'}
];
export function monthInfo(month) {
  check(typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month), '올바른 월을 선택해 주세요.');
  const [year, m] = month.split('-').map(Number);
  check(year >= 2000 && year <= 2100, '지원하는 연도는 2000~2100년입니다.');
  const days = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const next = `${m === 12 ? year + 1 : year}-${String(m === 12 ? 1 : m + 1).padStart(2,'0')}`;
  return { month, year, number:m, days, start:`${month}-01T00:00:00+09:00`, end:`${next}-01T00:00:00+09:00` };
}
export function kstMonth(date = new Date()) {
  const d = new Date(date); check(Number.isFinite(d.getTime()), '날짜 형식이 올바르지 않습니다.');
  return new Date(d.getTime() + 9 * 3600000).toISOString().slice(0,7);
}
export function shiftMonth(month, shift) {
  const { year, number } = monthInfo(month);
  return new Date(Date.UTC(year, number - 1 + shift, 1)).toISOString().slice(0,7);
}
export function defaultBudget() { return Object.fromEntries(CATEGORIES.map(c=>[c.id,c.planned])); }
export function totals(assets) {
  let totalAssets=0, liabilities=0, available=0, missing=0;
  for (const a of assets) {
    if (!a.included) continue;
    if (a.value === null) { missing++; continue; }
    if (a.kind === 'liability') liabilities += a.value;
    else { totalAssets += a.value; available += a.available ?? 0; }
  }
  return { totalAssets, liabilities, netWorth:totalAssets-liabilities, available, missing };
}
function book(state, month) {
  monthInfo(month);
  return state.months[month] ?? { budget:defaultBudget(), version:1, history:[], coverage:'empty', closure:null };
}
function ensureBook(state, month) {
  return state.months[month] ??= {...book(state,month), version:1};
}
export function monthSummary(state, month, now = new Date()) {
  const b=book(state,month), used=Object.fromEntries(CATEGORIES.map(c=>[c.id,0]));
  const byCard=Object.fromEntries(CARDS.map(c=>[c.id,0]));
  for (const e of state.events.filter(e=>e.month===month)) {
    if (e.type==='transfer' || e.type==='card_payment') continue;
    const sign=e.type==='refund' ? -1 : 1;
    used[e.category] += sign*e.amount;
    if (e.cardId) byCard[e.cardId] += sign*e.amount;
  }
  const categories=CATEGORIES.map(c=>({...c, planned:b.budget[c.id], used:used[c.id]}));
  const planned=categories.reduce((s,c)=>s+c.planned,0), spent=categories.reduce((s,c)=>s+c.used,0);
  return { ...monthInfo(month), planned, spent, remaining:planned-spent, version:b.version,
    consumption:categories.filter(c=>c.kind==='consumption').reduce((s,c)=>s+c.used,0),
    categories, cards:CARDS.map(c=>({...c,used:byCard[c.id]})),
    personal:{me:used.personal_me,partner:used.personal_partner},
    coverage:b.coverage, closure:b.closure,
    canClose:month < kstMonth(now) && b.coverage!=='empty' && used.unclassified===0,
    unclassified:used.unclassified };
}
export function dashboard(state, month, now = new Date()) {
  const closed=Object.entries(state.months).filter(([,b])=>b.closure).map(([month,b])=>({month,...b.closure}));
  return { mode:'demo', today:new Date(new Date(now).getTime()+9*3600000).toISOString().slice(0,10),
    currentMonth:kstMonth(now), selected:monthSummary(state,month,now),
    assets:state.assets, assetTotals:totals(state.assets), assetAsOf:state.assetAsOf, assetVersion:state.assetVersion,
    reserve:{total:closed.reduce((s,c)=>s+c.amount,0),needsReview:closed.some(c=>c.needsReview),months:closed.sort((a,b)=>b.month.localeCompare(a.month))},
    capture:{mode:'simulation',liveConnected:false,accepted:state.capture.accepted,duplicates:state.capture.duplicates,lastReceivedAt:state.capture.lastReceivedAt},
    // Deliberately do not serialize internal events, event identifiers, or raw notifications.
    months:Object.keys(state.months).sort().reverse() };
}
export function updateBudget(state, month, input, now=new Date()) {
  const b=ensureBook(state,month);
  check(!b.closure,'마감한 달의 예산은 변경할 수 없습니다.',409);
  check(input.version===b.version,'다른 창에서 예산이 바뀌었습니다. 새로고침 후 다시 저장해 주세요.',409);
  check(input.budget && Object.keys(input.budget).length===CATEGORIES.length,'예산 항목을 확인해 주세요.');
  for (const c of CATEGORIES) check(amountOK(input.budget[c.id]),'예산은 0 이상의 정수 금액이어야 합니다.');
  check(Object.values(input.budget).reduce((s,n)=>s+n,0)<=1_000_000_000_000,'총예산이 너무 큽니다.');
  check(input.budget.unclassified===0,'분류 대기에는 예산을 배정하지 않습니다.');
  b.history.push({version:b.version,budget:{...b.budget},changedAt:new Date(now).toISOString()});
  b.budget={...input.budget}; b.version++; return {version:b.version};
}
export function updateAssets(state, input, now=new Date()) {
  check(input.version===state.assetVersion,'다른 창에서 잔액이 바뀌었습니다. 새로고침해 주세요.',409);
  check(Array.isArray(input.assets) && input.assets.length===state.assets.length,'모든 자산 항목이 필요합니다.');
  check(new Set(input.assets.map(a=>a.id)).size===state.assets.length,'중복 자산 항목입니다.');
  for (const item of input.assets) {
    check(Object.keys(item).every(k=>['id','value','available','included'].includes(k)),'지원하지 않는 자산 필드입니다.');
    const old=state.assets.find(a=>a.id===item.id); check(old,'알 수 없는 자산입니다.');
    check(item.value===null || amountOK(item.value),'잔액은 양의 정수 또는 미확인이어야 합니다.');
    check(item.available===null || amountOK(item.available),'출금가능액을 확인해 주세요.');
    check(item.value===null ? item.available===null : item.available!==null && item.available<=item.value,'출금가능액은 총평가액 이하여야 합니다.');
    check(old.kind!=='liability' || item.available===0 || item.available===null,'부채는 출금가능액에 포함하지 않습니다.');
    check(typeof item.included==='boolean','자산 포함 여부를 확인해 주세요.');
  }
  state.assetHistory.push({at:state.assetAsOf,assets:structuredClone(state.assets)});
  state.assets=state.assets.map(a=>({...a,...input.assets.find(i=>i.id===a.id),id:a.id,kind:a.kind,label:a.label}));
  state.assetAsOf=new Date(now).toISOString(); state.assetVersion++;
  return {version:state.assetVersion};
}
const eventFields=new Set(['id','type','amount','occurredAt','cardId','category','originalId','source']);
export function ingest(state, input, now=new Date()) {
  check(input && typeof input==='object' && !Array.isArray(input),'정규화된 이벤트가 필요합니다.');
  check(Object.keys(input).every(k=>eventFields.has(k)),'지원하지 않는 필드입니다. 알림 원문·상호명은 보내지 마세요.');
  check(typeof input.id==='string' && /^[a-zA-Z0-9_-]{8,100}$/.test(input.id),'안정적인 이벤트 ID가 필요합니다.');
  check(['purchase','refund','allocation','transfer','card_payment'].includes(input.type),'지원하지 않는 이벤트 종류입니다.');
  check(amountOK(input.amount) && input.amount>0,'금액은 0보다 큰 정수여야 합니다.');
  check(typeof input.occurredAt==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(input.occurredAt),'시간대가 있는 ISO 시각이 필요합니다.');
  const time=new Date(input.occurredAt); check(Number.isFinite(time.getTime()),'유효하지 않은 날짜입니다.');
  // Date.parse normalizes February 30; reject invalid local calendar dates explicitly.
  const datePart=input.occurredAt.slice(0,10), info=monthInfo(datePart.slice(0,7));
  check(Number(datePart.slice(8))>=1 && Number(datePart.slice(8))<=info.days,'존재하지 않는 날짜입니다.');
  check(time.getTime()<=new Date(now).getTime()+60000,'미래 알림은 확정 지출로 반영할 수 없습니다.');
  check(['demo','hana-android-normalized'].includes(input.source),'지원하지 않는 수집 경로입니다.');
  const existing=state.events.find(e=>e.id===input.id && e.source===input.source);
  const fingerprint=JSON.stringify(Object.keys(input).sort().map(k=>[k,input[k]]));
  if (existing) {
    check(existing.fingerprint===fingerprint,'같은 ID의 내용이 달라졌습니다. 수집기에서 확인이 필요합니다.',409);
    state.capture.duplicates++; return {status:'duplicate'};
  }
  let category=input.category, cardId=input.cardId??null, owner='household', month=kstMonth(time);
  if (input.type==='refund') {
    const original=state.events.find(e=>e.id===input.originalId && e.source===input.source && e.type==='purchase');
    check(original,'원승인과 연결되지 않은 취소입니다. 원승인 수신 후 재시도해 주세요.',409);
    check(time>=new Date(original.occurredAt),'취소 시각은 원승인 이후여야 합니다.');
    check(!cardId || cardId===original.cardId,'취소 카드가 원승인 카드와 다릅니다.');
    const refunded=state.events.filter(e=>e.originalId===original.id && e.source===original.source && e.type==='refund').reduce((s,e)=>s+e.amount,0);
    check(refunded+input.amount<=original.amount,'누적 취소액이 원승인 금액을 넘습니다.',409);
    ({category,cardId,owner,month}=original);
  } else {
    const card=CARDS.find(c=>c.id===cardId);
    if (input.type==='purchase') {
      check(card && card.status!=='planned','사용 가능한 카드를 식별해야 합니다.'); owner=card.owner;
      category??='unclassified';
      check(input.source!=='hana-android-normalized' || card.id==='hana','하나카드 수집 경로입니다.');
    }
    if (input.type==='transfer' || input.type==='card_payment') category='unclassified';
    check(CATEGORIES.some(c=>c.id===category),'알 수 없는 예산 항목입니다.');
    check(category!=='personal_me' || owner==='me','본인 용돈은 본인 카드에만 배정할 수 있습니다.');
    check(category!=='personal_partner' || owner==='partner','배우자 용돈은 배우자 카드에만 배정할 수 있습니다.');
    check(!input.originalId,'원승인 ID는 취소 이벤트에만 사용합니다.');
  }
  const b=ensureBook(state,month); if (b.coverage==='empty') b.coverage='partial';
  state.events.push({...input,category,cardId,owner,month,fingerprint,receivedAt:new Date(now).toISOString()});
  state.capture.accepted++; state.capture.lastReceivedAt=new Date(now).toISOString();
  if (b.closure && !['transfer','card_payment'].includes(input.type)) b.closure.needsReview=true;
  return {status:'accepted',month};
}
export function closeMonth(state, month, input, now=new Date()) {
  const summary=monthSummary(state,month,now), b=ensureBook(state,month);
  if (b.closure && !b.closure.needsReview) return {created:false,adjusted:false,amount:b.closure.amount,delta:0};
  check(summary.canClose,'종료된 달이며 집계가 있고 분류 대기가 없어야 마감할 수 있습니다.',409);
  check(input.confirmReviewed===true,'누락·취소 및 전체 지출 대조 확인이 필요합니다.');
  const amount=Math.max(0,summary.remaining), previous=b.closure?.amount??0, created=!b.closure;
  b.closure={amount,closedAt:b.closure?.closedAt??new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),needsReview:false,budgetVersion:b.version};
  b.coverage='reviewed';
  state.reserveHistory.push({month,at:new Date(now).toISOString(),amount,delta:amount-previous,reason:created?'close':'correction'});
  return {created,adjusted:!created,amount,delta:amount-previous};
}
