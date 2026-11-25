import {cardsFor, escape, won} from './dashboard-domain.mjs?v=web19';

const firstMonth = '2026-12';
const monthPattern = /^20\d{2}-(?:0[1-9]|1[0-2])$/;
const types = {pdf:'application/pdf', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg'};

export function statementCards(state) {
  if (!['me', 'partner'].includes(state.slot) || state.cardScope === 'partner' || !state.data || state.failed) return [];
  return cardsFor(state.data, state.slot).filter(card =>
    card.owner === state.slot && !state.plan?.excludedCards?.includes(card.id));
}

export function statementFileError(file) {
  if (!file || !Number.isSafeInteger(file.size) || file.size <= 0) return '내용이 있는 파일 한 개를 선택해 주세요.';
  if (file.size > 5 * 1024 * 1024) return '5MiB 이하의 명세서를 선택해 주세요.';
  const extension = (file.name ?? '').split('.').pop().toLowerCase();
  const type = !file.type || file.type === 'application/octet-stream' ? types[extension] : file.type;
  if (!Object.values(types).includes(type) || (Object.hasOwn(types, extension) && types[extension] !== type))
    return 'PDF, PNG 또는 JPEG 파일을 선택해 주세요.';
  return '';
}

export function receiptText(receipt) {
  if (!receipt) return '';
  const known = Number.isSafeInteger(receipt.amount) && receipt.amount >= 0;
  if (receipt.suspended === true) return '중복 반영 여부 확인 필요 · 현재 예산 반영 보류' + (known ? ' · 종전 확인액 ' + won(receipt.amount) : '');
  const confirmed = known ? '예산에 반영된 할부금 ' + won(receipt.amount) : '';
  if (receipt.status === 'pending') return '명세서 접수 · 할부금 확인 중' + (known ? ' · 기존 반영액 ' + won(receipt.amount) : '');
  if (receipt.status === 'review') return '명세서 확인 필요' + (known ? ' · 기존 반영액 ' + won(receipt.amount) : ' · 예산 반영 전');
  if (receipt.status === 'confirmed') return confirmed || '명세서 확인 완료 · 반영액 확인 전';
  return confirmed || '아직 접수된 명세서가 없어요.';
}

export function monthlyAmount(value) {
  if (!/^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/.test(value)) return null;
  const amount = Number(value.replaceAll(',', ''));
  return Number.isSafeInteger(amount) && amount <= 1_000_000_000_000 ? amount : null;
}

export function uploadOutcome(previous, result) {
  if (!result?.version) throw Error('receipt');
  if (result.duplicate && (result.status === 'superseded' || (previous.version && result.version !== previous.version)))
    return {receipt:previous, message:'이전에 접수한 파일이에요. 최근 명세서를 유지했어요.'};
  if (!['pending','confirmed','review'].includes(result.status)) throw Error('receipt');
  return {receipt:{...previous, version:result.version, status:result.status},
    message:result.duplicate ? '이미 접수한 파일이에요. 같은 파일은 한 번만 처리해요.' : '명세서를 접수했어요.'};
}

export function mountStatementPage(host, {cards, month, getToken, getStatus, upload, confirmAmount, onExpired}) {
  const initialMonth = monthPattern.test(month) && month >= firstMonth ? month : firstMonth;
  host.innerHTML = `<button class="j-back" data-go="home" type="button">← 내 카드</button>
    <h1 class="j-title">할부 명세서 올리기</h1>
    <p class="j-subtitle">이번 달에 낼 할부금이 있는 내 카드의 명세서를 올려 주세요.</p>
    <form class="j-form j-statement" id="statement-form">
      <label for="statement-card">내 카드<select id="statement-card">${cards.map(c =>
        '<option value="' + escape(c.id) + '">' + escape(c.name) + '</option>').join('')}</select></label>
      <label for="statement-month">납부월<input type="month" id="statement-month" min="${firstMonth}" max="2099-12" value="${initialMonth}" required>
        <small>카드대금이 빠져나가는 달을 선택해 주세요.</small></label>
      <section class="j-statement-state" aria-label="명세서 처리 상태">
        <p role="status" data-statement-state></p><button type="button" data-statement-refresh>상태 새로고침</button>
      </section>
      <label for="statement-file">명세서 파일<span class="j-file-picker"><span data-file-label>파일 선택</span><input id="statement-file" type="file"
        accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" aria-label="명세서 파일 선택"></span><small>PDF, PNG, JPEG · 파일 1개, 최대 5MiB</small></label>
      <label class="j-statement-replace" hidden><input type="checkbox" id="statement-replace">이 카드·납부월의 명세서를 새 파일로 다시 제출할게요.</label>
      <p class="j-error" data-statement-error role="alert" hidden></p>
      <p class="j-budget-note" role="status" data-statement-message></p>
      <button type="submit" class="j-primary" data-statement-submit disabled>명세서 보내기</button>
    </form><section class="j-form j-statement" data-review-zone hidden>
      <button class="j-edit" type="button" data-statement-manual aria-expanded="false" aria-controls="statement-manual-fields">명세서 금액 확인</button>
      <div id="statement-manual-fields" class="j-manual-fields" hidden></div>
    </section>`;
  const form = host.querySelector('#statement-form');
  const card = form.querySelector('#statement-card'), payMonth = form.querySelector('#statement-month');
  const chooser = form.querySelector('#statement-file'), replace = form.querySelector('#statement-replace');
  const statusText = form.querySelector('[data-statement-state]'), refresh = form.querySelector('[data-statement-refresh]');
  const error = form.querySelector('[data-statement-error]'), message = form.querySelector('[data-statement-message]');
  const submit = form.querySelector('[data-statement-submit]');
  const review = host.querySelector('[data-review-zone]'), manual = review.querySelector('[data-statement-manual]');
  const fields = review.querySelector('#statement-manual-fields');
  let request, receipt = null, receiptScope = '', fresh = false, file = null, loading = false, sending = false, closed = false;
  const selected = () => cards.some(c => c.id === card.value) && monthPattern.test(payMonth.value) && payMonth.value >= firstMonth;
  const current = action => !closed && request === action && !action.signal.aborted;
  function begin() {
    request?.abort();
    request = new AbortController();
    return request;
  }
  function warn(text = '') { error.textContent = text; error.hidden = !text; }
  function clearFile() { file = null; chooser.value = ''; replace.checked = false; }
  function closeManual() { fields.replaceChildren(); fields.hidden = true; manual.setAttribute('aria-expanded','false'); }
  function update() {
    const mayUpload = selected() && fresh && receipt?.available === true && !loading && !sending;
    const replacing = Boolean(file && receipt?.version);
    replace.parentElement.hidden = !replacing;
    chooser.disabled = !mayUpload;
    replace.disabled = !mayUpload;
    submit.disabled = !mayUpload || !file || (replacing && !replace.checked);
    submit.textContent = sending ? '보내는 중…' : replacing ? '새 명세서 보내기' : '명세서 보내기';
    form.querySelector('[data-file-label]').textContent = file ? '파일 선택됨 · 다시 선택' : '파일 선택';
    refresh.disabled = !selected() || loading || sending;
    statusText.textContent = loading ? '접수 상태를 확인하고 있어요.' : receiptText(receipt) || '접수 상태 확인 전';
    if (receipt?.available === false) statusText.textContent += ' · 업로드 준비 중';
    review.hidden = receipt?.status !== 'review' || !receipt.version || !Number.isSafeInteger(receipt.revision);
    if (review.hidden) closeManual();
    manual.disabled = sending || !fresh;
    for (const control of fields.querySelectorAll('input,button')) control.disabled = sending || !fresh;
  }
  async function loadStatus({keepMessage = false, keepFile = false} = {}) {
    const action = begin(), target = {card:card.value, month:payMonth.value};
    const scope = target.card + '/' + target.month;
    if (scope !== receiptScope) receipt = null;
    receiptScope = scope;
    if (!keepFile) clearFile();
    if (!keepMessage) message.textContent = '';
    fresh = false; sending = false; loading = selected(); warn(); closeManual(); update();
    if (!loading) { warn('2026년 12월 이후의 납부월과 내 카드를 선택해 주세요.'); return; }
    try {
      const token = await getToken();
      if (!current(action)) return;
      const result = await getStatus({...target, token, signal:action.signal});
      if (!current(action)) return;
      if (!['empty','pending','confirmed','review'].includes(result?.status)) throw Error('status');
      receipt = result; fresh = true;
    } catch (err) {
      if (!current(action)) return;
      if (err.status === 401) { onExpired(); return; }
      if (err.status === 403) { receipt = null; clearFile(); warn('이 계정의 카드인지 확인해 주세요.'); }
      else warn(receipt ? '최근 상태를 갱신하지 못해 마지막으로 확인한 내용을 표시해요. 상태 새로고침을 눌러 주세요.'
        : '접수 상태를 확인하지 못했어요. 상태 새로고침을 눌러 주세요.');
    } finally { if (current(action)) { loading = false; update(); } }
  }
  manual.addEventListener('click', () => {
    if (review.hidden || sending) return;
    if (!fields.hidden) { closeManual(); return; }
    clearFile(); update();
    fields.innerHTML = `<label for="statement-amount">이번 달에 추가로 반영할 할부 본인부담액(원)
      <input id="statement-amount" inputmode="numeric" type="text" autocomplete="off" maxlength="17">
      <small>이 카드의 이번 회차 원금과 수수료에서 직접 보정이나 취소로 이미 반영한 금액을 빼 주세요.</small></label>
      <label class="j-statement-replace"><input type="checkbox" id="statement-manual-check">일시불·바우처와 직접 보정이나 취소로 이미 반영한 금액을 제외했어요.</label>
      <p class="j-error" role="alert" data-manual-error></p><button type="button" class="j-primary" data-statement-confirm>이 금액으로 예산 반영</button>`;
    fields.hidden = false; manual.setAttribute('aria-expanded','true');
    const input = fields.querySelector('#statement-amount');
    if (Number.isSafeInteger(receipt.suggestedAmount) && receipt.suggestedAmount >= 0) {
      input.value = String(receipt.suggestedAmount);
      input.parentElement.querySelector('small').textContent = '명세서에서 읽은 후보 금액이에요. 이번 회차 원금과 수수료를 확인하고, 직접 보정이나 취소로 이미 반영한 금액을 빼 주세요.';
    }
    input.focus();
    fields.querySelector('[data-statement-confirm]').addEventListener('click', async () => {
      if (sending || !selected() || receipt?.status !== 'review') return;
      const amount = monthlyAmount(input.value.trim()), check = fields.querySelector('#statement-manual-check');
      if (amount === null || !check.checked) {
        fields.querySelector('[data-manual-error]').textContent = amount === null
          ? '명세서의 할부 합계를 0원 이상의 정수로 입력해 주세요.' : '제외할 금액을 확인하고 체크해 주세요.';
        (amount === null ? input : check).focus(); return;
      }
      const action = begin(), target = {card:card.value, month:payMonth.value, expectedVersion:receipt.version, revision:receipt.revision, amount};
      sending = true; warn(); message.textContent = ''; update();
      try {
        const token = await getToken();
        if (!current(action)) return;
        const result = await confirmAmount({...target, token, signal:action.signal});
        if (!current(action)) return;
        if (result?.status !== 'confirmed') throw Error('confirm');
        receipt = result; fresh = true;
        message.textContent = '확인한 할부금 ' + won(amount) + '을 반영했어요.';
        clearFile(); closeManual();
      } catch (err) {
        if (!current(action)) return;
        if (err.status === 401) { onExpired(); return; }
        if (err.status === 409) {
          message.textContent = '명세서가 바뀌었어요. 최신 자료를 확인하고 금액을 다시 입력해 주세요.';
          await loadStatus({keepMessage:true}); return;
        }
        warn('반영을 확인하지 못했어요. 상태를 새로고침하거나 같은 금액으로 다시 시도해 주세요.');
      } finally { if (current(action)) { sending = false; update(); } }
    });
  });
  async function send(event) {
    event.preventDefault();
    if (submit.disabled || !selected() || !file || !receipt) return;
    const action = begin(), target = {card:card.value, month:payMonth.value, file, expectedVersion:receipt.version};
    sending = true; warn(); message.textContent = ''; update();
    try {
      const token = await getToken();
      if (!current(action)) return;
      const result = await upload({...target, token, signal:action.signal});
      if (!current(action)) return;
      const outcome = uploadOutcome(receipt, result);
      receipt = outcome.receipt;
      clearFile();
      message.textContent = outcome.message;
      sending = false; update();
      await loadStatus({keepMessage:true});
    } catch (err) {
      if (!current(action)) return;
      if (err.status === 401) { onExpired(); return; }
      if (err.status === 409) {
        replace.checked = false;
        message.textContent = '다른 명세서가 먼저 접수됐어요. 최신 상태를 확인하고 다시 제출해 주세요.';
        await loadStatus({keepMessage:true,keepFile:true}); return;
      }
      if (err.status === 403) { clearFile(); receipt = null; warn('이 계정의 카드인지 확인해 주세요.'); }
      else if (err.status === 503) { warn('업로드를 준비 중이에요. 잠시 뒤 상태를 확인해 주세요.'); }
      else if ([400,413,415,422].includes(err.status)) { clearFile(); warn('파일 형식과 크기를 확인하고 다시 선택해 주세요.'); }
      else { warn('접수 여부를 확인하지 못했어요. 같은 파일로 다시 시도할 수 있어요.'); }
    } finally { if (current(action)) { sending = false; update(); } }
  }
  card.addEventListener('change', () => loadStatus());
  payMonth.addEventListener('change', () => loadStatus());
  refresh.addEventListener('click', () => loadStatus());
  chooser.addEventListener('change', () => {
    const picked = chooser.files?.[0];
    file = null; replace.checked = false; message.textContent = ''; warn();
    if (picked) {
      const reason = statementFileError(picked);
      if (reason) { chooser.value = ''; warn(reason); } else file = picked;
    }
    update();
  });
  replace.addEventListener('change', update);
  form.addEventListener('submit', send);
  void loadStatus();
  return {
    refreshPending() {
      if (!closed && !sending && !loading && !file && receipt?.status === 'pending') void loadStatus({keepMessage:true});
    },
    dispose() { closed = true; request?.abort(); clearFile(); closeManual(); receipt = null; }
  };
}
