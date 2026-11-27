import {escape, won} from './dashboard-domain.mjs?v=web19';

export function spendingCheckState(card) {
  const saved = card.spendingCheck;
  if (card.spendingDifference || (saved && saved.issuerAmount !== saved.collectedAmount)) return 'mismatch';
  if (!saved) return 'unchecked';
  return saved.revision === card.checkRevision ? 'match' : 'changed';
}

function difference(issuer, collected) {
  const delta = issuer - collected;
  return delta === 0 ? '대조 당시 금액이 같아요.' :
    (delta > 0 ? '카드사 승인액이 ' : '째미즈 수집액이 ') + won(Math.abs(delta)) + ' 더 커요.';
}

export function renderSpendingCheck(card, month) {
  if (!Number.isSafeInteger(card.checkRevision)) return '';
  const saved = card.spendingCheck;
  const label = '카드사 승인액 대조';
  const when = saved && new Intl.DateTimeFormat('ko-KR', {
    timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'
  }).format(new Date(saved.checkedAt));
  const since = saved && saved.revision !== card.checkRevision ? '<br>지난 대조 후 수집 기록이 바뀌었어요.' : '';
  const last = saved ? '<p>지난 대조 · '+escape(when)+' 기준<br>'+difference(saved.issuerAmount,saved.collectedAmount)+since+'</p>' : '<p>아직 카드사와 대조하지 않았어요.</p>';
  if (card.net == null) return '<p>일시불 수집액이 확인되면 카드사와 대조할 수 있어요.</p>';
  const historical = month < '2026-12';
  return '<section class="spend-check">'+last+
    '<button type="button" data-check-open aria-expanded="false">'+label+'</button>'+
    '<form hidden data-check-form data-card="'+escape(card.id ?? card.card)+'" data-month="'+escape(month)+
    '" data-revision="'+card.checkRevision+'" data-version="'+(saved?.version ?? 0)+'" data-collected="'+card.net+'">'+
    '<label>카드사 일시불 승인 누계 (원)<input type="text" name="issuer" inputmode="numeric" autocomplete="off" required maxlength="17"></label>'+
    '<p>선택한 달 1일부터 조회 시점까지 국내 일시불 승인액에서 취소를 뺀 본인 부담액을 입력해요. 청구할인 전 금액이며 할부·바우처는 제외해요.</p>'+
    '<p>째미즈 수집액 '+won(card.net)+'</p><p role="status" data-check-result></p>'+
    '<button type="submit">'+(historical?'차이만 보기':'대조 결과 저장')+'</button> '+
    '<button type="button" data-check-close>닫기</button></form></section>';
}

export function installSpendingCheck(main,{getState,call,reload}) {
  let active = null, generation = 0;
  function reset() {
    generation++;
    if (active?.isConnected) {
      active.hidden = true;
      active.reset();
      active.querySelector('[data-check-result]').textContent = '';
      active.closest('section').querySelector('[data-check-open]').setAttribute('aria-expanded','false');
    }
    active = null;
  }
  main.addEventListener('click',event => {
    const open = event.target.closest('[data-check-open]');
    if (open) {
      const form = open.closest('section').querySelector('form');
      const closing = form === active;
      reset();
      if (!closing) {
        active = form;
        form.hidden = false;
        open.setAttribute('aria-expanded','true');
        form.elements.issuer.focus();
      }
    } else if (event.target.closest('[data-check-close]')) {
      const button = active?.closest('section').querySelector('[data-check-open]');
      reset();
      button?.focus();
    }
  });
  main.addEventListener('submit',async event => {
    const form = event.target;
    if (!form.matches('[data-check-form]')) return;
    event.preventDefault();
    const state = getState();
    if (form !== active || state.month !== form.dataset.month) return;
    const card = state.data?.cards?.find(row => row.card === form.dataset.card);
    if (!card || !Number.isSafeInteger(card.checkRevision)) return;
    const input = form.elements.issuer.value.trim();
    const amount = Number(input.replaceAll(',',''));
    const result = form.querySelector('[data-check-result]');
    if (!/^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/.test(input) || !Number.isSafeInteger(amount) || amount > 1e12) {
      result.textContent = '0원 이상의 금액을 원 단위로 입력해 주세요.';
      return;
    }
    const month = form.dataset.month, collected = Number(form.dataset.collected);
    if (month < '2026-12') {
      result.textContent = difference(amount,collected)+' 이 달은 화면에서만 비교해요.';
      return;
    }
    const submit = form.querySelector('[type="submit"]');
    if (submit.disabled) return;
    const attempt = generation;
    submit.disabled = true;
    try {
      await call('household_spending_check',{p_card:card.card,p_month:month,p_amount:amount,
        p_expected_revision:Number(form.dataset.revision),p_expected_version:Number(form.dataset.version)});
      if (attempt !== generation || !form.isConnected) return;
      reset();
      await reload();
    } catch (err) {
      if (attempt !== generation || !form.isConnected) return;
      result.textContent = err.status===409 ? '수집액이나 대조 기록이 바뀌었어요. 닫고 새로고침한 뒤 다시 확인해 주세요.' :
        '저장을 확인하지 못했어요. 같은 금액으로 다시 시도할 수 있어요.';
    } finally { submit.disabled = false; }
  });
  return {reset,editing:()=>!!active?.isConnected && !active.hidden && !!active.closest('details[open]')};
}
