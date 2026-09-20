"use strict";
const $ = id => document.getElementById(id);
const money = value => Number.isFinite(value) ? Math.round(value).toLocaleString("ko-KR") + "원" : "—";
const clock = value => value ? new Date(value).toLocaleString("ko-KR", {timeZone:"Asia/Seoul",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}) : "—";
let token = "", endpoint = "", timer = null, busy = false, stopAction = "";
$("endpoint").value = localStorage.getItem("crypto_endpoint") || (location.protocol === "http:" ? location.origin : "");
function notice(text, error = false) { $("notice").textContent = text; $("notice").className = error ? "alert" : ""; }
async function api(path, body) {
  const response = await fetch(endpoint + path, {method:body ? "POST" : "GET", headers:{Authorization:"Bearer " + token,...(body ? {"Content-Type":"application/json"} : {})}, body:body ? JSON.stringify(body) : undefined, cache:"no-store", credentials:"omit", redirect:"error", signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(response.status === 401 ? "제어 암호를 확인해 주세요." : "서버 요청 실패 (" + response.status + ")");
  return response.json();
}
function item(left, right) {const row=document.createElement("div");row.className="list-item";const a=document.createElement("span"),b=document.createElement("small");a.textContent=left;b.textContent=right;row.append(a,b);return row;}
function render(state) {
  const paper=state.kind !== "live";
  $("mode").textContent=paper ? "모의 운용" : "실거래";
  $("connection").textContent=state.worker_healthy ? "서버 연결됨" : "프로세스 응답 지연";
  $("connection").className="badge " + (state.worker_healthy ? "good" : "bad");
  $("equity").textContent=money(state.equity);$("cash").textContent=money(state.cash);
  $("baseline").textContent="초기 현금 "+money(state.initial);
  const pnl=state.equity-state.initial;
  $("pnl").textContent=(pnl>0 ? "+" : "")+money(pnl);$("pnl").className=pnl>=0?"positive":"negative";
  $("return").textContent=Number.isFinite(pnl)?(pnl/state.initial*100).toFixed(2)+"% · 누적 수수료 "+money(state.fees):"—";
  const positions=Object.entries(state.positions||{});
  const pendingCount=(state.pending?1:0)+Object.keys(state.exit_pending||{}).length;
  $("positions").textContent=positions.length + " / " + pendingCount;
  $("pending").textContent=pendingCount?"주문 확인 중 · 해당 종목 및 신규 매수 보류":"확인 대기 주문 없음";
  $("controlState").textContent=state.control.halt_all?"전체 주문 정지 상태":state.control.pause_buys?"신규 매수 중지 · 청산 감시 유지":"규칙에 따라 운용 대기";
  $("pause").disabled=state.control.pause_buys||state.control.halt_all;$("halt").disabled=state.control.halt_all;
  $("heartbeat").textContent="최근 프로세스 응답 "+clock(state.heartbeat);
  $("valuedAt").textContent="평가 "+clock(state.valued_at);
  if (state.last_error) notice(state.last_error,true);
  else if (!state.worker_healthy) notice("프로세스 응답이 늦습니다. 연결된 화면만으로 손절 감시가 동작한다고 판단하지 마세요.",true);
  else if(state.control.halt_all) notice("전체 주문 정지 상태가 저장되었습니다. 이미 접수된 주문은 체결될 수 있습니다.",true);
  else if(state.scan_error) notice("후보 조회가 실패했습니다. 마지막 후보 목록의 시각을 확인해 주세요.",true);
  else notice(paper?"모의 계좌입니다. 실제 자금으로 주문하지 않습니다.":"실거래 모드입니다. 표시 금액은 이 봇이 관리하는 자산만 포함합니다.");
  $("holdings").replaceChildren();
  for(const [symbol,p] of positions){const tr=document.createElement("tr");const value=Number.isFinite(p.price)?p.qty*p.price:NaN;[symbol.replace("KRW-",""),Number(p.qty).toPrecision(7),money(value),money(value-p.cost),money(p.stop)].forEach(value=>{const td=document.createElement("td");td.textContent=value;tr.append(td)});$("holdings").append(tr);}
  if(!positions.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=5;td.className="empty";td.textContent="봇이 보유한 종목이 없습니다.";tr.append(td);$("holdings").append(tr);}
  const curve=(state.curve||[]).filter(p=>Number.isFinite(p.equity));
  $("chartEmpty").hidden=curve.length>1;
  if(curve.length>1){const values=curve.map(p=>p.equity),lo=Math.min(...values),hi=Math.max(...values),range=Math.max(hi-lo,state.initial*.001);$("curve").setAttribute("d",values.map((v,i)=>(i?"L":"M")+(15+i/(values.length-1)*730).toFixed(1)+","+(195-(v-lo)/range*170).toFixed(1)).join(" "));}else $("curve").setAttribute("d","");
  $("scanAt").textContent=clock(state.scan?.created_at);$("candidates").replaceChildren();
  const currentStrategy=state.scan?.strategy==="daily-eth-sol-v3";
  const candidates=currentStrategy?(state.scan?.rows||[]).filter(r=>r.candidate):[];
  candidates.slice(0,10).forEach(r=>$("candidates").append(item(r.symbol.replace("KRW-", ""),"일봉 추세 조건 통과")));
  if(!candidates.length)$("candidates").append(item(currentStrategy?"조건을 통과한 후보 없음":"최종 전략 스캔 대기 · 이전 후보는 숨김", ""));
  $("events").replaceChildren();
  const labels={fill:"체결",order_terminal:"주문 확인",dust_exit_blocked:"최소주문 미달"};
  (state.events||[]).slice(-15).reverse().forEach(e=>$("events").append(item((labels[e.type]||e.type)+" · "+(e.symbol||"")+(e.side?" · "+(e.side==="buy"?"매수":"매도"):""),clock(e.at))));
}
async function refresh(){if(busy||!token)return;busy=true;try{render(await api("/api/status"));}catch(error){$("connection").textContent="연결 실패";$("connection").className="badge bad";notice(error.message+" 최근 표시값은 현재 상태가 아닐 수 있습니다.",true);}finally{busy=false;}}
$("connectForm").addEventListener("submit",async event=>{event.preventDefault();try{const url=new URL($("endpoint").value);if(url.username||url.password||url.search||url.hash||url.pathname!=="/")throw new Error("서버 기본 주소만 입력해 주세요.");if(url.protocol!=="https:"&&!(location.protocol==="http:"&&url.protocol==="http:"&&["127.0.0.1","localhost"].includes(url.hostname)))throw new Error("외부 연결에는 HTTPS 주소가 필요합니다.");endpoint=url.origin;token=$("token").value.trim();$("token").value="";localStorage.setItem("crypto_endpoint",endpoint);clearInterval(timer);await refresh();timer=setInterval(refresh,5000);}catch(error){notice(error.message,true);}});
function confirmStop(action){stopAction=action;$("confirmTitle").textContent=action==="halt"?"모든 추가 주문을 중지할까요?":"신규 매수를 중지할까요?";$("confirmText").textContent=action==="halt"?"보유분 손절·청산 주문도 차단합니다. 이미 거래소에 접수된 주문은 체결될 수 있습니다.":"새 매수만 차단하고 보유분 손절·추세 청산은 유지합니다.";$("confirmDialog").showModal();}
$("pause").onclick=()=>confirmStop("pause");$("halt").onclick=()=>confirmStop("halt");$("cancelStop").onclick=()=>$("confirmDialog").close();
$("confirmStop").onclick=async()=>{const button=$("confirmStop");button.disabled=true;try{await api("/api/"+stopAction,{confirm:"STOP"});$("confirmDialog").close();notice("중지 요청이 서버에 저장되었습니다.");await refresh();}catch(error){notice("중지 완료를 확인하지 못했습니다. "+error.message,true);}finally{button.disabled=false;}};
