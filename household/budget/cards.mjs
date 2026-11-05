const names={hana:'하나 MOVING ONLINE',kb:'KB 쿠팡 와우',nh:'NH zgm 할인',shinhan:'신한 K-패스',shinhan_bab:'신한 밥친구',samsung:'삼성 회사카드'};
export const short={hana:'하나',kb:'KB',nh:'NH',shinhan:'신한',shinhan_bab:'밥친구',samsung:'삼성'};
const MY=['hana','kb','nh','shinhan'],SPOUSE=['shinhan_bab','samsung'];
const states={'not-paired':'연결 전','revoked':'연결 해제됨','expired':'연결 만료','profile-pending':'카드 확인 대기'};
const won=n=>Number.isSafeInteger(n)&&n>=0?new Intl.NumberFormat('ko-KR').format(n)+'원':'—';
const at=s=>{const d=new Date(s);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(d):'시각 확인 필요';};
const amountCell=n=>Number.isSafeInteger(n)&&n>=0?won(n):'<span aria-hidden="true">—</span><span class="sr-only">금액 없음</span>';
function stateText(c){
 if(c.state==='pilot')return c.net==null?'이 달 자료 없음':'일부 수집';
 return states[c.state]??'상태 확인 필요';
}
export function connectedCount(data){return (data.cards??[]).filter(c=>[...MY,...SPOUSE].includes(c.card)&&c.state==='pilot').length;}
export function orderedCards(data,slot='me'){
 const known=new Map((data.cards??[{card:'hana',state:'pilot',net:data.net,cumulative:null}]).map(c=>[c.card,c]));
 const row=key=>known.get(key)??{card:key,state:'not-paired',net:null,cumulative:null};
 const mine=slot==='partner'?SPOUSE:MY,theirs=slot==='partner'?MY:SPOUSE;
 return [...mine.map(k=>({...row(k),own:true})),...theirs.map(k=>({...row(k),own:false}))];
}
function details(c,data,slot){
 const a=c.own?data.ownAllocations?.find(x=>x.card===c.card)??(c.card==='hana'?data.ownAllocation:null):null,o=c.cumulative;
 const message=o?.status==='ambiguous'?'같은 시각에 서로 다른 누적액 · 확인 필요':o?.status==='decreased-review'?'이전 관측보다 감소 · 원인은 PUSH로 구분할 수 없어요':'연체액이 포함될 수 있는 참고값이에요';
 const tracked=MY.includes(c.card)&&c.card!=='hana';
 const manage=slot==='me'&&c.own&&MY.includes(c.card);
 const split=a?.net!=null;
 if(c.state==='not-paired'&&!manage)return '';
 if(!tracked&&!split&&!manage)return '';
 return `<dl><div><dt>이 달 수집액</dt><dd>${won(c.net)}</dd></div>${tracked?`<div><dt>카드사 표시 누적액</dt><dd>${won(o?.amount)}</dd></div>`:''}</dl>${tracked?o?`<time>누적액 관측 · ${at(o.observedAt)} KST</time><p class="tracking-note">${message}</p><p class="tracking-note">예산에 더하지 않는 참고값이고, 선택한 달과 별개인 최신 관측값이에요.</p>`:'<p class="tracking-note">누적액은 첫 수신 후 표시돼요.</p>':''}${split?`<button class="secondary" data-edit="classification" data-card="${c.card}">내 ${short[c.card]} 합계 나누기</button>`:''}${manage?`<a class="manage-link" href="../${c.card==='hana'?'connect':c.card}/">연결 관리 →</a>`:''}`;
}
export function cardPanels(data,slot='me'){
 const rows=orderedCards(data,slot).map(c=>{
  const meta=`${c.own?'내 카드':'배우자 카드'} · ${stateText(c)}`,warn=c.state==='revoked'||c.state==='expired';
  const head=`<h3 class="card-name">${names[c.card]}</h3><p class="card-amount">${amountCell(c.net)}</p><p class="card-meta${warn?' warn':''}">${meta}</p>`;
  const more=details(c,data,slot);
  return more?`<details class="card-row" data-key="card-${c.card}"><summary class="card-head">${head}</summary><div class="card-more">${more}</div></details>`:`<article class="card-row"><div class="card-head">${head}</div></article>`;
 }).join('');
 return `<section class="panel" aria-labelledby="cards-title"><h2 id="cards-title">카드 현황</h2><div class="card-list">${rows}</div><p class="tracking-note">연결 전 카드는 합계에 들어가지 않아요. 0원이라는 뜻이 아니에요.</p></section>`;
}

