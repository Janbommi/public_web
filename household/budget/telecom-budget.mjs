import {won} from './dashboard-domain.mjs?v=web19';

const types = {mobile:'KT 휴대폰', internet:'KT 인터넷'};
const labels = {scheduled:'예정', captured:'카드 수집', confirmed:'명세서 확인', review:'확인 필요'};
const amount = value => Number.isSafeInteger(value) && value >= 0;
const invalid = {reserved:null, adjustment:null, items:[], needsReview:true};

export function telecomFor(row) {
  if ((row?.id ?? row?.card) !== 'nh' || row.telecom == null) return null;
  const t = row.telecom;
  if (!amount(t.reserved) || !Number.isSafeInteger(t.adjustment) || typeof t.needsReview !== 'boolean' ||
      !Array.isArray(t.items) || t.items.length > 2) return invalid;
  const seen = new Set();
  for (const item of t.items) {
    if (!item || !Object.hasOwn(types,item.kind) || seen.has(item.kind) || !Object.hasOwn(labels,item.status) ||
        !amount(item.estimate) || !amount(item.captured) || (item.actual !== null && !amount(item.actual)) ||
        (item.status === 'confirmed' && item.actual === null)) return invalid;
    seen.add(item.kind);
  }
  return {...t, needsReview:t.needsReview || t.items.some(item => item.status === 'review')};
}

export function currentUse(base, telecom) {
  if (base == null || (telecom && telecom.adjustment == null)) return null;
  return base + (telecom?.adjustment ?? 0);
}

export function renderTelecom(telecom) {
  if (!telecom) return '';
  const items = telecom.items.map(item => {
    const value = item.status === 'scheduled' ? item.estimate :
      item.status === 'captured' ? item.captured : item.actual;
    return '<div><dt>'+types[item.kind]+'<small>'+labels[item.status]+'</small></dt><dd>'+
      (value == null ? '확인 필요' : won(value))+'</dd></div>';
  }).join('');
  return '<section class="spend-telecom"><h3>KT 통신비</h3>'+
    (items ? '<dl>'+items+'</dl>' : '')+
    (telecom.needsReview ? '<p>수집액과 청구액을 확인해야 해서 농협 가용액 표시를 보류했어요.</p>' : '')+
    '</section>';
}
