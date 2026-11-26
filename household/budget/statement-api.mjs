const MAX_BYTES = 5 * 1024 * 1024;
let endpoint;

export function configureStatementEndpoint(value) {
  endpoint = new URL(value);
}

function failure(status) {
  return Object.assign(new Error('명세서 요청을 처리하지 못했습니다.'), {status});
}

async function rpc(token, name, args, signal) {
  if (!endpoint || !token) throw failure(401);
  const url = new URL(endpoint);
  if (name === 'household_statement_upload') url.searchParams.set('statement', 'upload');
  if (name === 'household_statement_inbox_upload') url.searchParams.set('statement', 'inbox');
  const response = await fetch(url, {
    method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', signal,
    headers: {'Content-Type':'application/json', Authorization:'Bearer ' + token},
    body: JSON.stringify({action:'rpc', name, args})
  });
  if (!response.ok) throw failure(response.status);
  const result = await response.json();
  if (result.error || !result.data) throw failure(result.status || 503);
  return result.data;
}

function testMonth(month) {
  if (!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(month)) throw failure(422);
  return month < '2026-12';
}

function assertScope(value, testOnly) {
  if (testOnly ? value?.testOnly !== true : value?.testOnly === true) throw failure(503);
}

function readResult(row) {
  const amount = row?.readAmount ?? null;
  if (amount !== null && (!Number.isSafeInteger(amount) || amount < 0 || amount > 1e12)) throw failure(503);
  return {readAmount:amount, readAt:typeof row?.readAt === 'string' ? row.readAt : null};
}

function statusOf(data, card, month) {
  const testOnly = testMonth(month);
  assertScope(data, testOnly);
  if (!Array.isArray(data.uploads) || !Array.isArray(data.totals) || (testOnly && data.totals.length)) throw failure(503);
  const row = data.uploads.find(entry => entry.card === card);
  const total = data.totals.find(entry => entry.card === card);
  if (row) assertScope(row, testOnly);
  let status = 'empty';
  if (row) status = row.status === 'needs_review' ? 'review' : row.status;
  return {
    status, version:row?.id ?? null, amount:total?.amount ?? null, suggestedAmount:row?.suggestedAmount ?? null,
    revision:total?.revision ?? 0, suspended:total?.needsReview === true, available:Boolean(data.encryptionKey),
    testOnly, ...readResult(row)
  };
}

export async function getStatementStatus({token, card, month, signal}) {
  const data = await rpc(token, 'household_statement_list', {p_month:month}, signal);
  return statusOf(data, card, month);
}

function mediaType(bytes) {
  if ([37,80,68,70,45].every((value, index) => bytes[index] === value)) return 'application/pdf';
  if ([137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) return 'image/png';
  if ([255,216,255].every((value, index) => bytes[index] === value)) return 'image/jpeg';
  throw failure(415);
}

function base64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 16384) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 16384)));
  }
  return btoa(chunks.join(''));
}

export async function uploadStatement({token, card, month, file, expectedVersion, signal}) {
  if (!file || !file.size || file.size > MAX_BYTES) throw failure(413);
  const listing = await rpc(token, 'household_statement_list', {p_month:month}, signal);
  const testOnly = statusOf(listing, card, month).testOnly;
  const key = listing.encryptionKey;
  if (!key || !globalThis.crypto?.subtle) throw failure(503);
  const wrapKey = await crypto.subtle.importKey('jwk', key.jwk, {name:'RSA-OAEP', hash:'SHA-256'}, false, ['wrapKey']);
  if (wrapKey.algorithm.modulusLength !== 3072) throw failure(503);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let args;
  try {
    const mime = mediaType(bytes);
    if (file.type && file.type !== mime && file.type !== 'application/octet-stream') throw failure(415);
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const fingerprint = Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('');
    const additionalData = new TextEncoder().encode(JSON.stringify(
      ['statement-v1', key.kid, card, month, mime, bytes.length, fingerprint]
    ));
    const dek = await crypto.subtle.generateKey({name:'AES-GCM', length:256}, true, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData}, dek, bytes);
    const wrapped = await crypto.subtle.wrapKey('raw', dek, wrapKey, {name:'RSA-OAEP'});
    args = {p_card:card, p_month:month, p_mime:mime, p_bytes:bytes.length, p_fingerprint:fingerprint,
      p_kid:key.kid, p_wrapped_key:base64(wrapped), p_iv:base64(iv), p_ciphertext:base64(ciphertext),
      p_expected_id:expectedVersion ?? null};
  } finally {
    bytes.fill(0);
  }
  const saved = await rpc(token, 'household_statement_upload', args, signal);
  assertScope(saved, testOnly);
  return {status:saved.status === 'needs_review' ? 'review' : saved.status, version:saved.id, duplicate:saved.duplicate === true,
    testOnly, ...readResult(saved)};
}

export async function confirmStatementAmount({token, card, month, expectedVersion, revision, amount, signal}) {
  if (testMonth(month)) throw failure(403);
  if (!Number.isSafeInteger(amount) || amount < 0) throw failure(422);
  await rpc(token, 'household_statement_confirm', {
    p_card:card, p_month:month, p_expected_id:expectedVersion, p_expected_revision:revision, p_amount:amount
  }, signal);
  return getStatementStatus({token, card, month, signal});
}

export {rpc as statementRequest};
