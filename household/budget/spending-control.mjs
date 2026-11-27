import {
  COMMON, activeCards, billedCardNet, cardsFor, cardListOwner, confirmedInstallment,
  consumption, escape, hasCardPlan, limit, ownerLimit, todayKst, totals, won
} from './dashboard-domain.mjs?v=web19';
import * as original from './dashboard-views.mjs?v=web19';
import {statementCards} from './statement-page.mjs?v=web22';
import {spendingCheckState, renderSpendingCheck} from './spending-check.mjs?v=web24';
import {telecomFor, currentUse, renderTelecom} from './telecom-budget.mjs?v=web25';
export * from './dashboard-views.mjs?v=web19';

const {icon, monthBar, refreshRow} = original;
const monthName = state => Number(state.month.slice(5)) + '월';
const textAmount = amount => amount == null ? '확인 전' : won(amount);

// Calendar days are based on Korea time, independent of the device timezone.
export function monthElapsed(month, today = todayKst()) {
  if (!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(month) || !/^20\d{2}-\d{2}-\d{2}$/.test(today)) return null;
  const [year, value] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year, value, 0)).getUTCDate();
  const current = today.slice(0, 7);
  const elapsed = month < current ? days : month > current ? 0 : Math.min(Number(today.slice(8)), days);
  return {days, elapsed, remaining: days - elapsed,
    label: month > current ? value+'월 시작 전 · '+days+'일' : month < current ? value+'월 종료 · '+days+'일' :
      value+'월 '+elapsed+'일 · '+(elapsed===days?'오늘이 이번 달 마지막 날':'오늘이 지나면 '+(days-elapsed)+'일 남음')};
}

function ownRows(state, owner) {
  const available = new Map(cardsFor(state.data, owner).map(row => [row.id, row]));
  const currentMonth = state.month === todayKst().slice(0,7);
  const stopped = {expired:'연결 기간 만료',revoked:'연결 해제됨','profile-pending':'카드 연결 확인 필요','not-paired':'카드 연결 전'};
  return activeCards(state.plan).filter(card => card.owner === owner).map(card => {
    const row = available.get(card.id) ?? {...card, net: null};
    const telecom = telecomFor(row);
    return {...row, telecom, used:currentUse(billedCardNet(row),telecom), budget:limit(state.plan,card.id),
      unavailableReason: state.failed ? '최근 조회 실패' : currentMonth ? stopped[row.state] ?? null : null};
  });
}

function budgetState(used, budget) {
  if (budget == null) return {kind:'unset', label:'예산 미설정', priority:4};
  if (used == null || used < 0) return {kind:'unknown', label:'사용액 확인 필요', priority:3};
  const left = budget - used;
  if (left < 0) return {kind:'over', label:'예산 초과', amount:-left, priority:0};
  if (!budget) return {kind:'zero', label:'사용 계획 없음', amount:0, priority:6};
  if (!left) return {kind:'exhausted', label:'예산 소진', amount:0, priority:1};
  if (left <= budget * 0.1) return {kind:'low', label:'10% 이하 남음', amount:left, priority:2};
  return {kind:'remaining', label:'남은 예산', amount:left, priority:6};
}

function hero(state, rows) {
  const unplanned = rows.filter(card => card.budget == null).length;
  const unknown = rows.filter(card => card.net == null || card.used == null || card.used < 0).length;
  const pending = rows.filter(card => card.installmentPending).length;
  const mismatch = rows.filter(card => spendingCheckState(card) === 'mismatch').length;
  const unavailable = rows.filter(card => card.unavailableReason).length;
  const telecom = rows.find(card => card.telecom)?.telecom;
  const reserved = telecom?.reserved ?? 0;
  const available = rows.length > 0 && !unknown && !unplanned && !mismatch && !unavailable && !telecom?.needsReview;
  const budget = rows.reduce((sum, row) => sum + (row.budget ?? 0), 0);
  const used = rows.reduce((sum, row) => sum + (row.used ?? 0), 0);
  const status = mismatch ? {kind:'mismatch'} : unavailable || telecom?.needsReview ? {kind:'unknown'} :
    budgetState(unknown ? null : used+reserved, unplanned || !rows.length ? null : budget);
  const historical = state.month < todayKst().slice(0,7);
  const label = status.kind === 'over' ? '내 카드 예산 초과액' : historical ? '내 카드 남은 예산' : '내 카드에서 지금 쓸 수 있는 금액';
  const period = monthElapsed(state.month);
  const notice = [];
  if (mismatch) notice.push('카드사 대조 차이 '+mismatch+'장');
  if (telecom?.needsReview) notice.push('농협 KT 청구액 확인 필요');
  if (state.failed) notice.push('최근 조회 실패 · 저장된 수집액 표시');
  else if (unavailable) notice.push('연결 상태 확인 필요 '+unavailable+'장');
  if (unplanned) notice.push('예산 미설정 '+unplanned+'장');
  if (unknown) notice.push('사용액 확인 필요 '+unknown+'장');
  if (pending) notice.push('확인 중인 할부 '+pending+'장 제외');
  if (status.kind === 'zero') notice.push('이번 달 카드 사용 계획이 없어요.');
  if (status.kind === 'exhausted') notice.push('카드 예산을 모두 사용했어요.');
  const usedLabel = unknown ? '확인된 사용액' : '현재 사용액';
  const planLabel = unplanned ? '설정된 예산' : '카드 예산';
  const rate = available && budget > 0 ? Math.round(Math.min(used/budget,1)*1000)/10 : null;
  const holdRate = rate == null ? 0 : Math.min(100-rate,Math.round(reserved/budget*1000)/10);
  return '<section class="spend-hero is-'+status.kind+'" aria-labelledby="my-spending-title">'+
    '<h1 class="spend-eyebrow" id="my-spending-title">'+label+'</h1>'+
    (period?'<p class="spend-period">'+period.label+'</p>':'')+
    '<div class="spend-amount">'+(available ? won(status.amount) : '확인 필요')+'</div>'+
    (rate == null ? '' : '<div class="spend-track" aria-hidden="true"><i style="width:'+rate+'%"></i>'+
      (holdRate ? '<i class="spend-hold-track" style="width:'+holdRate+'%"></i>':'')+'</div>')+
    '<dl class="spend-equation"><div><dt>'+planLabel+'</dt><dd>'+(rows.some(r=>r.budget!=null) ? won(budget) : '미설정')+'</dd></div>'+
    '<div><dt>'+usedLabel+'</dt><dd>'+textAmount(rows.some(r=>r.used!=null) ? used : null)+'</dd></div>'+
    (telecom ? '<div class="spend-hold-field"><dt>KT 납부 예정</dt><dd>'+textAmount(telecom.reserved)+'</dd></div>':'')+'</dl>'+
    '<p class="spend-note">'+(telecom && reserved>0 ? 'KT 예정액은 쓸 수 있는 금액에서 미리 뺐어요. ' : '')+'일시불·직접 보완·반영 할부 포함 · 현금 별도'+
    (notice.length ? '<br>'+notice.join(' · ') : !rows.length ? '<br>등록된 내 카드가 없어요.' : '')+
    '</p></section>';
}

function cardState(card) {
  if (spendingCheckState(card) === 'mismatch') return {kind:'mismatch', label:'카드사 금액과 차이', priority:-1};
  if (card.unavailableReason) return {kind:'unknown', label:card.unavailableReason, priority:-.5};
  if (card.telecom?.needsReview) return {kind:'unknown', label:'KT 청구액 확인 필요', priority:-.5};
  return budgetState(card.net == null || card.used == null || card.used < 0 ? null : card.used+(card.telecom?.reserved ?? 0), card.budget);
}

function watch(rows) {
  const attention = rows.map(card => ({card, state:cardState(card)}))
    .filter(item => item.state.priority < 6)
    .sort((a,b) => a.state.priority - b.state.priority ||
      (a.state.kind === 'over' ? b.state.amount-a.state.amount : (a.state.amount??0)-(b.state.amount??0)))
    .slice(0,2);
  if (!attention.length) return '';
  return '<section class="spend-watch"><h2>먼저 확인할 내 카드</h2>'+attention.map(({card,state}) =>
    '<a class="spend-watch-row is-'+state.kind+'" href="#spend-card-'+card.id+'" data-review-card="'+card.id+'">'+
    '<span><strong>'+escape(card.name)+'</strong><small>'+state.label+'</small></span>'+
    '<b>'+(state.amount == null ? '확인하기' : won(state.amount)+(state.kind==='over'?' 초과':' 남음'))+
    '</b>'+icon('right')+'</a>').join('')+'</section>';
}

function actions(state) {
  return '<div class="spend-home-actions"><button type="button" data-go="cash">'+icon('plus')+'현금 지출 입력</button>'+
    (statementCards(state).length ? '<button type="button" data-statement-open>'+icon('card')+'명세서 · 할부 입력</button>' : '')+'</div>';
}

function details(state) {
  const mine = consumption(state.data,state.slot), all = consumption(state.data);
  const telecom = telecomFor(state.data.cards?.find(row=>row.card==='nh'));
  const own = currentUse(mine.net,state.slot==='me'?telecom:null), household = currentUse(all.net,telecom);
  return '<section class="spend-details" aria-label="현금 포함 소비">'+
    '<div><span>내 소비 · 반영 기준</span><strong>'+textAmount(own)+'</strong><small>현금 '+won(mine.cash)+' 포함'+(mine.known<mine.count?' · 일부 카드 미집계':'')+'</small></div>'+
    '<div><span>우리 집 소비 · 반영 기준</span><strong>'+textAmount(household)+'</strong><small>현금 포함 · 카드 집계 '+all.known+'/'+all.count+'장</small></div></section>';
}

function cardDetail(card, dashboardState) {
  const state = cardState(card), due = confirmedInstallment(card);
  const warning = state.kind === 'over' || state.kind === 'exhausted';
  let summary = state.amount == null ? state.label : won(state.amount)+(state.kind==='over'?' 초과':' 남음');
  if (state.kind === 'zero') summary = '사용 계획 없음';
  if (state.kind === 'exhausted') summary = '예산 소진 · 0원';
  const lines = [['카드 예산',card.budget==null?'미설정':won(card.budget)],
    [card.id==='samsung_happiness'?'본인 부담 사용액':'현재 사용액',textAmount(card.used)]];
  if (card.telecom) lines.push(['아직 사용액에 포함되지 않은 KT 예정액',textAmount(card.telecom.reserved)]);
  if (due!=null) lines.push(['사용액에 포함된 반영 할부',won(due)]);
  if (card.id==='samsung_happiness') lines.push(['별도 바우처 사용',textAmount(card.voucherNet)]);
  return '<details class="spend-card is-'+state.kind+'" id="spend-card-'+card.id+'" data-card="'+card.id+'">'+
    '<summary><span class="spend-card-label"><strong>'+escape(card.name)+'</strong><small>'+escape(card.purpose)+'</small></span>'+
    '<span class="spend-card-status">'+summary+'<small>'+(card.telecom?.reserved>0?'KT 예정 반영':'반영 기준')+'</small></span></summary>'+
    '<div class="spend-card-body" data-spend-card="'+card.id+'"><dl>'+lines.map(([key,value])=>'<div><dt>'+key+'</dt><dd>'+value+'</dd></div>').join('')+'</dl>'+
    (card.unavailableReason?'<p class="j-budget-note">'+card.unavailableReason+' · 저장된 수집액만 표시해요.</p>':'')+
    (card.net==null?'<p class="j-budget-note">일시불 사용액 확인 전</p>':'')+(card.installmentPending?'<p class="j-budget-note">명세서 확인 중인 할부는 별도로 확인해 주세요.</p>':'')+
    renderTelecom(card.telecom)+(card.owner === dashboardState.slot ? renderSpendingCheck(card, dashboardState.month) : '')+
    (warning||state.kind==='unset'?'<button type="button" data-go="budget">예산 보기</button>':'')+'</div></details>';
}

function cardList(state, rows, viewingPartner) {
  const scope = viewingPartner?'partner':'mine';
  const tabs = state.canViewPartnerCards ? '<div class="j-card-tabs" role="tablist" aria-label="카드 소유자">'+
    [['mine','내 카드'],['partner','배우자 카드']].map(([key,title])=>
      '<button type="button" role="tab" id="cards-tab-'+key+'" aria-controls="card-panel" aria-selected="'+(key===scope)+
      '" tabindex="'+(key===scope?'0':'-1')+'" data-card-scope="'+key+'">'+title+'</button>').join('')+'</div>' : '';
  return '<div class="j-heading"><h2>카드별 남은 예산</h2><p>'+monthName(state)+' 기준</p></div>'+tabs+
    '<div id="card-panel" class="spend-card-list"'+(state.canViewPartnerCards?' role="tabpanel" aria-labelledby="cards-tab-'+scope+'"':'')+'>'+
    rows.map(card => cardDetail(card, state)).join('')+'</div>';
}

export function home(state) {
  const mine = ownRows(state,state.slot), selected = cardListOwner(state);
  const other = selected !== state.slot;
  return monthBar(state)+refreshRow(state)+'<div class="spend-home-top">'+hero(state,mine)+watch(mine)+'</div>'+actions(state)+details(state)+
    cardList(state,other?ownRows(state,selected):mine,other);
}

// An earlier in-flight refresh may finish after the check form opens.
// Refresh only the summary so that stale amounts are marked without losing input.
export function refreshSpendingSummary(main, state) {
  const top = main.querySelector('.spend-home-top');
  if (top) { const mine = ownRows(state,state.slot); top.innerHTML = hero(state,mine)+watch(mine); }
  const status = main.querySelector('.j-status-row');
  if (status) status.outerHTML = refreshRow(state);
}

export function budget(state) {
  if (!hasCardPlan(state.plan)) return original.budget(state);
  const plan = state.plan, summary = totals(plan);
  const ownerGroups = [state.slot,state.slot==='me'?'partner':'me'];
  const groups = ownerGroups.map((owner,index) => {
    const permitted = owner===state.slot || state.canViewPartnerCards;
    const rows = permitted ? ownRows(state,owner) : activeCards(plan).filter(card=>card.owner===owner);
    const missing = rows.filter(card=>limit(plan,card.id)==null).length;
    const heading = '<div class="j-heading"><h2>'+(index?'배우자 카드':'내 카드')+'</h2><p>'+
      (missing?'미설정 '+missing+'장 · ':'')+textAmount(ownerLimit(plan,owner))+'</p></div>'+
      '<div class="j-budget-list">';
    return heading + rows.map(row => {
      const budget = limit(plan,row.id);
      if (!permitted) return '<div class="j-budget-item"><span>'+escape(row.name)+'<small>'+escape(row.purpose)+'</small></span>'+
        '<strong>'+(budget==null?'미설정':won(budget))+'</strong></div>';
      const balance = cardState(row);
      const result = balance.amount==null || balance.kind==='zero' ? balance.label : won(balance.amount)+(balance.kind==='over'?' 초과':' 남음');
      return '<div class="spend-budget-line is-'+balance.kind+'" data-budget-card="'+row.id+'"><div><strong>'+escape(row.name)+
        '</strong><b>'+result+'</b></div><dl><div><dt>예산</dt><dd>'+(budget==null?'미설정':won(budget))+'</dd></div>'+
        '<div><dt>현재 사용</dt><dd>'+textAmount(row.used)+'</dd></div>'+
        (row.telecom?'<div><dt>KT 납부 예정</dt><dd>'+textAmount(row.telecom.reserved)+'</dd></div>':'')+'</dl></div>';
    }).join('')+'</div>';
  });
  return monthBar(state)+refreshRow(state)+'<section class="spend-plan"><div class="j-budget-head"><h1>'+monthName(state)+
    ' 카드 소비 예산</h1><button class="j-edit" data-go="settings">예산 설정</button></div>'+
    '<div class="spend-amount">'+(summary.sum==null?'미설정':won(summary.sum))+'</div><p class="spend-note">'+
    (summary.missing?'설정된 카드 합계 · 미설정 '+summary.missing+'장':'두 사람의 카드 예산 합계')+'</p></section>'+
    groups.join('')+'<details class="j-funding"><summary>공통 대출·이자 계획</summary>'+
    COMMON.map(c=>'<div class="j-budget-item"><span>'+c.name+'</span><strong>'+textAmount(plan.commonBudgets?.[c.key])+'</strong></div>').join('')+'</details>';
}

export function navigation(state) {
  const section = ['budget','settings'].includes(state.view)?'budget':
    ['manage','connections','classification'].includes(state.view)?'manage':'home';
  return [['home','house','홈'],['budget','wallet','예산'],['manage','settings','관리']].map(([key,glyph,title])=>
    '<button data-go="'+key+'"'+(section===key?' aria-current="page"':'')+'>'+icon(glyph)+'<span>'+title+'</span></button>').join('');
}

export function manage(state) {
  return original.manage(state).replace('째미즈 web19', '째미즈 web25');
}

export function installCardReview(root) {
  root.addEventListener('click', event => {
    const review = event.target.closest('[data-review-card]');
    if (!review) return;
    event.preventDefault();
    const mine = root.querySelector('[data-card-scope="mine"]');
    if (mine && mine.getAttribute('aria-selected') !== 'true') mine.click();
    const card = document.getElementById('spend-card-'+review.dataset.reviewCard);
    if (!card) return;
    card.open = true;
    card.querySelector('summary').focus({preventScroll:true});
    card.scrollIntoView({block:'center'});
  });
}

// Preserve the expanded card while refreshing the same owner's month.
export function restoreCardDetailsAfterRender(main, state) {
  const key = [state.month,state.slot,cardListOwner(state)].join('/');
  const panel = main.querySelector('#card-panel');
  const open = panel?.dataset.scopeKey===key ? [...panel.querySelectorAll('details[open]')].map(card=>card.id) : [];
  const focused = panel?.dataset.scopeKey===key && document.activeElement?.matches('summary')
    ? document.activeElement.parentElement.id : null;
  return () => {
    const nextPanel = main.querySelector('#card-panel');
    if (!nextPanel) return;
    nextPanel.dataset.scopeKey = key;
    for (const id of open) {
      const card = document.getElementById(id);
      if (card) card.open = true;
    }
    if (focused) document.getElementById(focused)?.querySelector('summary')?.focus({preventScroll:true});
  };
}
