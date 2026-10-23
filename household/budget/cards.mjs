const names={hana:'하나 MOVING ONLINE',kb:'KB 쿠팡 와우',nh:'NH zgm 할인',shinhan:'신한 K-패스'};
const states={'not-paired':'연결 전','revoked':'연결 해제됨','expired':'연결 만료','profile-pending':'폰에서 카드 확인 대기','pilot':'국내 일시불 일부 수집'};
const won=n=>Number.isSafeInteger(n)&&n>=0?new Intl.NumberFormat('ko-KR').format(n)+'원':'—';
const at=s=>{const d=new Date(s);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(d):'시각 확인 필요';};
export function cardPanels(data){
 const cards=data.cards??[{card:'hana',state:'pilot',net:data.net,cumulative:null}];
 return `<section class="panel"><h2>카드별 사용 현황</h2>${cards.filter(c=>names[c.card]).map(c=>{
  const a=data.ownAllocations?.find(x=>x.card===c.card)??(c.card==='hana'?data.ownAllocation:null),o=c.cumulative;
  const message=o?.status==='ambiguous'?'같은 시각에 서로 다른 누적액 · 확인 필요':o?.status==='decreased-review'?'이전 관측보다 감소 · 원인은 PUSH로 구분할 수 없어요':'연체액이 포함될 수 있는 참고값이에요';
  return `<article class="card-stat"><h3>${names[c.card]}</h3><p class="card-state">${states[c.state]??'상태 확인 필요'}</p><dl><div><dt>이 달 수집액</dt><dd>${won(c.net)}</dd></div>${c.card!=='hana'?`<div><dt>카드사 표시 누적액</dt><dd>${won(o?.amount)}</dd></div>`:''}</dl>${c.card!=='hana'?o?`<time>누적액 관측 · ${at(o.observedAt)} KST</time><p class="tracking-note">${message}</p><p class="tracking-note">예산에 더하지 않는 참고값<br>선택한 달과 별개인 최신 관측값이에요.</p>`:'<p class="tracking-note">누적액은 첫 수신 후 표시돼요.</p>':''}${a?.net!=null?`<button class="secondary" data-edit="classification" data-card="${c.card}">내 ${({hana:'하나',kb:'KB',nh:'NH',shinhan:'신한'})[c.card]}카드 합계 나누기</button>`:''}<a href="../${c.card==='hana'?'connect':c.card}/">${({hana:'하나',kb:'KB',nh:'NH',shinhan:'신한'})[c.card]} 연결 관리 →</a></article>`;
 }).join('')}<p class="tracking-note">미수집은 0원이라는 뜻이 아니에요.</p></section><section class="panel"><h2>배우자 카드</h2><p>신한 밥친구 · 네이버 현대 Edition3<br>발급 완료 · 주말에 연결 예정</p></section>`;
}
