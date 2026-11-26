import {statementRequest} from './statement-api.mjs?v=web22';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const monthPattern=/^20\d{2}-(?:0[1-9]|1[0-2])$/;
const cardKeys=new Set(['hana','kb','nh','shinhan','shinhan_bab','shinhan_line','samsung','samsung_happiness']);
const failure=status=>Object.assign(Error('명세서 접수를 확인하지 못했어요.'),{status});
const amount=value=>value===null||Number.isSafeInteger(value)&&value>=0&&value<=1e12;

function receipt(value){
  const confirmedAmount=value?.confirmedAmount??null;
  if(!value||!uuid.test(value.id??'')||!['pending','confirmed','needs_review'].includes(value.status)||
    !['web','gmail'].includes(value.source)||!Number.isSafeInteger(value.attempt)||value.attempt<1||
    !(value.card===null||cardKeys.has(value.card))||!(value.month===null||monthPattern.test(value.month))||
    ![null,true,false].includes(value.testOnly)||!amount(value.readAmount)||!amount(confirmedAmount)||
    !(value.uploadId===null||uuid.test(value.uploadId??''))||
    !(value.revision===null||Number.isSafeInteger(value.revision)&&value.revision>=0)||typeof value.budgetApplied!=='boolean')throw failure(503);
  if(value.month!==null&&value.testOnly!==(value.month<'2026-12'))throw failure(503);
  if(value.budgetApplied&&(value.testOnly!==false||!value.card||!value.month||confirmedAmount===null))throw failure(503);
  return {id:value.id,attempt:value.attempt,status:value.status,source:value.source,card:value.card,month:value.month,
    testOnly:value.testOnly,readAmount:value.readAmount,reason:typeof value.reason==='string'?value.reason:null,
    readAt:typeof value.readAt==='string'?value.readAt:null,createdAt:typeof value.createdAt==='string'?value.createdAt:null,
    uploadId:value.uploadId,revision:value.revision,duplicate:value.duplicate===true,budgetApplied:value.budgetApplied,confirmedAmount};
}

export async function getStatementInbox({token,signal}){
  const data=await statementRequest(token,'household_statement_inbox_list',{},signal);
  if(!Array.isArray(data.receipts))throw failure(503);
  return {available:Boolean(data.encryptionKey),items:data.receipts.map(receipt)};
}

function mediaType(bytes){
  if([37,80,68,70,45].every((value,index)=>bytes[index]===value))return 'application/pdf';
  if([137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value))return 'image/png';
  if([255,216,255].every((value,index)=>bytes[index]===value))return 'image/jpeg';
  throw failure(415);
}
function base64(buffer){
  const bytes=new Uint8Array(buffer),chunks=[];
  for(let offset=0;offset<bytes.length;offset+=16384)chunks.push(String.fromCharCode(...bytes.subarray(offset,offset+16384)));
  return btoa(chunks.join(''));
}

export async function uploadStatementInbox({token,file,retryOf=null,signal}){
  if(!file||!file.size||file.size>5*1024*1024)throw failure(413);
  if(retryOf!==null&&!uuid.test(retryOf))throw failure(422);
  const listing=await statementRequest(token,'household_statement_inbox_list',{},signal);
  const key=listing.encryptionKey;
  if(!key||!globalThis.crypto?.subtle)throw failure(503);
  const wrapKey=await crypto.subtle.importKey('jwk',key.jwk,{name:'RSA-OAEP',hash:'SHA-256'},false,['wrapKey']);
  if(wrapKey.algorithm.modulusLength!==3072)throw failure(503);
  const bytes=new Uint8Array(await file.arrayBuffer());let args;
  try{
    const mime=mediaType(bytes);
    if(file.type&&file.type!==mime&&file.type!=='application/octet-stream')throw failure(415);
    const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
    const fingerprint=Array.from(hash,byte=>byte.toString(16).padStart(2,'0')).join('');
    const additionalData=new TextEncoder().encode(JSON.stringify(['statement-auto-v1',key.kid,mime,bytes.length,fingerprint]));
    const dek=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']);
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData},dek,bytes);
    const wrapped=await crypto.subtle.wrapKey('raw',dek,wrapKey,{name:'RSA-OAEP'});
    args={p_mime:mime,p_bytes:bytes.length,p_fingerprint:fingerprint,p_kid:key.kid,
      p_wrapped_key:base64(wrapped),p_iv:base64(iv),p_ciphertext:base64(encrypted),p_retry_of:retryOf};
  }finally{bytes.fill(0);}
  return receipt(await statementRequest(token,'household_statement_inbox_upload',args,signal));
}
