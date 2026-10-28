// Fixed messages only. Never render raw notification or service error content.
export function connectionHealth(summary,owner=false,now=Date.now()){
 const result={title:'연결 상태를 새로고침해 주세요.',next:'',detail:''};
 if(!summary)return result;
 if(summary.state==='not-paired'||summary.state==='revoked'){
  return {...result,title:'연결된 폰이 없습니다.',next:owner?'본인 폰 연결 키를 만들어 앱에 저장해 주세요.':'폰 연결은 카드 소유자 계정에서 진행합니다.'};
 }
 if(summary.state==='expired')return {...result,title:'연결 키가 만료됐습니다.',next:owner?'기존 연결을 해제하고 새 키를 앱에 저장해 주세요.':'카드 소유자가 연결 키를 갱신해야 합니다.'};
 const enabled=summary.state==='pilot'||summary.state==='waiting';
 result.title=enabled?'서버 수집 허용됨':'첫 본인 카드 확인을 기다립니다.';
 result.next=enabled?'폰의 자동 집계 상태와 월 수집 합계를 확인하세요. 서버 상태만으로 폰의 현재 수집 여부는 알 수 없습니다.':
   owner?'폰에 ‘새 하나Pay 일시불 알림을 기다립니다’가 보이면 다음 평소 결제를 기다려 주세요. 새 알림 뒤 ‘본인 카드 확인하고 자동 집계 시작’을 눌러 카드·금액·시각을 확인하고 ‘맞아요 · 시작’을 누르세요. 버튼만 누르거나 진단이 도착한 것으로 집계가 시작되지는 않습니다.':'카드 소유자가 폰에서 첫 결제를 확인하면 수집을 시작합니다.';
 if(!owner)return result;
 const g=summary.diagnostic;
 if(!g){result.detail='아직 자동 진단이 도착하지 않았습니다. 앱을 한 번 열고 내용 없는 진단 자동 전송을 확인해 주세요.';return result;}
 const received=Date.parse(g.receivedAt);
 if(!Number.isFinite(received)||!Number.isInteger(g.appVersion)||typeof g.listenerConnected!=='boolean'){
  result.detail='진단 상태를 확인하지 못했습니다. 상태를 새로고침해 주세요.';return result;
 }
 const when=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(received);
 const version=g.appVersion===4?'0.4':g.appVersion===5?'0.5':g.appVersion===6?'0.6':g.appVersion===7?'0.7':g.appVersion===8?'0.8':g.appVersion===9?'0.9':g.appVersion===10?'0.91':g.appVersion===11?'0.92':g.appVersion===12?'0.93':g.appVersion===13?'0.94':'버전 확인 필요';
 result.detail=`마지막 서버 진단 ${when} (한국 시간) · 앱 ${version} · 당시 알림 ${g.listenerConnected?'연결됨':'연결 끊김'}`;
 if(Number.isInteger(g.observations)&&g.observations>=0&&g.observations<=32&&Number.isInteger(g.parsedCount)&&g.parsedCount>=0&&g.parsedCount<=g.observations)
  result.detail+=` · 관측 ${g.observations}건 / 해석 ${g.parsedCount}건. 알림 갱신·이전 버전 기록을 포함할 수 있어 결제 건수가 아닙니다.`;
 // Event-driven reports are not a heartbeat; old status is unknown, never "offline".
 if(now-received>86400000||received>now+300000){
  result.next='최근 상태를 확인하려면 앱을 한 번 열고 이 화면을 새로고침해 주세요. 진단이 오래됐다는 이유만으로 연결 끊김이나 결제 누락을 판단하지 않습니다.';
 }else if(g.appVersion<5){
  result.next='설치된 앱은 진단용입니다. 이 페이지에서 0.94로 업데이트한 뒤 한 번 열어 주세요.';
 }else if(!g.listenerConnected){
  result.next='마지막 진단에서 알림 연결이 끊겨 있었습니다. 앱에서 알림 접근 허용을 확인하고 다시 열어 주세요.';
 }
 return result;
}
