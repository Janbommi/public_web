/* Original canvas pixel office. No third-party art assets.
 * Source state and animation state are separate; demo never writes to the bot. */
const STATUS = {
  idle:{label:'쉬는 중',tone:'idle'}, walking:{label:'이동 중',tone:'idle'},
  working:{label:'작업 중',tone:'work'}, thinking:{label:'생각 중',tone:'think'},
  waiting:{label:'답변 대기',tone:'wait'}, meeting:{label:'작업 중',tone:'work'},
  success:{label:'완료',tone:'work'}, error:{label:'확인 필요',tone:'halt'},
  halted:{label:'비상 정지',tone:'halt'}, offline:{label:'오프라인',tone:'off'}
};
function statusMeta(s) { return STATUS[s] || {label:'상태 미지원',tone:'off'}; }
function deskMode(s) { return s==='offline'?'off':s==='working'?'work':'idle'; }
function shortDur(s) { return s==null?null:s<60?s+'초':s<3600?Math.floor(s/60)+'분':Math.floor(s/3600)+'시간'; }
function agoText(iso,now) {
  if(!iso) return null;
  const d=new Date(/[+Z]/.test(iso)?iso:iso+'Z'), m=Math.max(0,Math.floor(((now||Date.now())-d)/60000));
  return !Number.isFinite(m)?null:m<1?'방금':m<60?m+'분 전':m<1440?Math.floor(m/60)+'시간 전':Math.floor(m/1440)+'일 전';
}
function summarize(list) {
  const agents=list.filter(a=>a.kind!=='user'), n=s=>agents.filter(a=>a.status===s).length;
  const working=agents.filter(a=>['working','thinking','meeting'].includes(a.status)).length;
  const idle=agents.filter(a=>['idle','walking','success','waiting'].includes(a.status)).length;
  const halted=n('halted')+n('error'), offline=agents.length-working-idle-halted;
  return {total:agents.length,working,idle,halted,offline,online:agents.length-offline};
}

/* Pure model: grid routes, desk assignment and interruptible state transitions.
 * This part can be tested in Node without a browser or paid API calls. */
const OfficeModel=(()=>{
  const GRID=4, SPEED=23, snap=n=>Math.round(n/GRID)*GRID;
  const inside=(p,r,pad=0)=>p.x>=r.x-pad&&p.x<=r.x+r.w+pad&&p.y>=r.y-pad&&p.y<=r.y+r.h+pad;
  function plan(list,zones,width) {
    const compact=width<280, W=Math.max(160,Math.floor(width/4)*4), pad=4;
    const teamKeys=[...new Set([...zones.map(z=>z.key),...list.filter(a=>!a.isChief&&a.kind!=='user').map(a=>a.team)])].filter(k=>k&&k!=='office');
    const groups=teamKeys.map(key=>({key,title:(zones.find(z=>z.key===key)||{}).label||key,members:list.filter(a=>a.team===key&&!a.isChief&&a.kind!=='user')}));
    const rooms=[], desks=new Map(), obstacles=[];
    let y=pad;
    for(let i=0;i<groups.length;i+=2) {
      const pair=groups.slice(i,i+2), connector=groups.length>2?16:0, usable=W-3*pad-connector;
      const widths=pair.length===1?[W-2*pad-connector]:[snap(usable*.58),usable-snap(usable*.58)];
      let x=pad, rowHeight=0;
      const row=pair.map((g,j)=>{
        const cols=Math.max(1,Math.floor((widths[j]-12)/32));
        const rows=Math.max(1,Math.ceil(g.members.length/cols));
        const h=24+rows*32+16;
        const r={...g,x,y,w:widths[j],h,cols,rows,type:'team',accent:g.key==='invest'?'#A8C9BD':g.key==='family'?'#E1BCC8':'#BFC0DD'};
        x+=r.w+pad; rowHeight=Math.max(rowHeight,h); return r;
      });
      row.forEach(r=>{r.h=rowHeight;rooms.push(r);});
      y+=rowHeight+24;
    }
    if(!groups.length) y=28;
    const hasOffice=list.some(a=>a.isChief||a.kind==='user'||a.team==='office');
    const commonY=y, officeW=hasOffice?Math.max(72,snap((W-12)*.36)):-4;
    const commonH=64;
    if(hasOffice)rooms.push({key:'office',title:'현주 · 싸부',type:'office',x:4,y:commonY,w:officeW,h:commonH,cols:Math.max(1,Math.floor((officeW-8)/30)),accent:'#BDCBA9',members:list.filter(a=>a.isChief||a.kind==='user'||a.team==='office')});
    const lounge={key:'lounge',title:'잠깐, 커피 한 잔',type:'lounge',x:officeW+8,y:commonY,w:W-officeW-12,h:commonH,members:[],accent:'#D5B8A8'};
    rooms.push(lounge);
    const H=commonY+commonH+4;
    for(const r of rooms) {
      const mid=snap(r.x+r.w/2);
      r.door={x:mid,y:r.type==='team'?r.y+r.h:r.y};
      if(r.type==='lounge') continue;
      const cell=(r.w-12)/r.cols;
      r.members.forEach((a,i)=>{
        const point={x:snap(r.x+6+cell*(i%r.cols+.5)),y:snap(r.y+32+Math.floor(i/r.cols)*32)};
        const desk={...point,id:a.id,room:r,x0:point.x-13,y0:point.y+2,w:27,h:15};
        desks.set(a.id,desk); obstacles.push({x:desk.x0-1,y:desk.y0,w:desk.w+2,h:desk.h});
      });
    }
    const coffee={x:lounge.x+10,y:lounge.y+23,w:24,h:10};
    const sofa={x:lounge.x+lounge.w-36,y:lounge.y+23,w:26,h:12};
    obstacles.push(coffee,sofa);
    const walkable=new Set(), key=(x,y)=>x+','+y;
    for(let yy=4;yy<H-4;yy+=GRID) for(let xx=4;xx<W-4;xx+=GRID) {
      const p={x:xx,y:yy};
      // All unoccupied floor is connected through central corridors and door openings.
      let ok=false;
      for(const r of rooms) {
        if(inside(p,{x:r.x+5,y:r.y+19,w:r.w-10,h:r.h-24})) ok=true;
        const d=r.door;
        if(Math.abs(xx-d.x)<=8 && (r.type==='team'?yy>=r.y+r.h-8&&yy<=r.y+r.h+16:yy>=r.y-16&&yy<=r.y+24)) ok=true;
      }
      for(let ri=0;ri<rooms.length;ri++) {
        const r=rooms[ri];
        if(r.type==='team'&&yy>=r.y+r.h+4&&yy<=r.y+r.h+20) ok=true;
      }
      if(groups.length>2&&xx>=W-12&&yy>=rooms[0].y+rooms[0].h+4&&yy<commonY)ok=true;
      if(ok&&!obstacles.some(o=>inside(p,o))) walkable.add(key(xx,yy));
    }
    // Seats must be grid nodes; furniture begins below the standing foot point.
    for(const d of desks.values()) walkable.add(key(d.x,d.y));
    const floor=[...walkable].map(k=>{const [x,y]=k.split(',').map(Number);return {x,y};});
    const restSpots=new Map(),spawnSpots=new Map(),used=[];
    for(const a of list) {
      const own=desks.get(a.id).room;
      const spots=floor.filter(q=>q.x>own.x+8&&q.x<own.x+own.w-8&&q.y>=own.y+own.h-12&&q.y<=own.y+own.h+12);
      const cafe=floor.filter(q=>q.x>lounge.x+8&&q.x<lounge.x+lounge.w-8&&q.y>=lounge.y+44&&q.y<lounge.y+lounge.h-8);
      restSpots.set(a.id,[...spots,...cafe]);
      const candidates=[...spots,...cafe].filter(q=>used.every(o=>Math.hypot(q.x-o.x,q.y-o.y)>=12));
      const at=candidates[Math.floor(candidates.length*((list.indexOf(a)*.381966+.25)%1))]||desks.get(a.id);
      spawnSpots.set(a.id,at);used.push(at);
    }
    return {width:W,height:H,rooms,desks,lounge,coffee,sofa,restSpots,spawnSpots,walkable,compact,obstacles,key};
  }
  function route(p,from,to,blocked=new Set()) {
    const start=p.key(snap(from.x),snap(from.y)), goal=p.key(snap(to.x),snap(to.y));
    if(!p.walkable.has(start)||!p.walkable.has(goal)) return [];
    const queue=[start], parents=new Map([[start,null]]);
    for(let head=0;head<queue.length;head++) {
      const k=queue[head]; if(k===goal) break;
      const [x,y]=k.split(',').map(Number);
      for(const [dx,dy] of [[4,0],[0,4],[-4,0],[0,-4]]) {
        const next=p.key(x+dx,y+dy);
        if(!parents.has(next)&&p.walkable.has(next)&&!blocked.has(next)) {parents.set(next,k);queue.push(next);}
      }
    }
    if(!parents.has(goal)) return [];
    const out=[];
    for(let k=goal;k!==start;k=parents.get(k)) {const [x,y]=k.split(',').map(Number);out.push({x,y});}
    return out.reverse();
  }
  function state(a) { return a.kind==='user'?'idle':STATUS[a.status]?a.status:'offline'; }
  function make(a,p,t,random=Math.random) {
    const intent=state(a),rest=['idle','success'].includes(intent)&&a.kind!=='user';
    const at=rest?p.spawnSpots.get(a.id):p.desks.get(a.id);
    return {id:a.id,team:a.team,x:at.x,y:at.y,state:intent,intent,legs:[],dir:'down',dist:0,
      until:t+500+random()*6000,changedAt:t-15000,blink:0,nextBlink:t+random()*4000,
      sitting:!rest,pastime:rest?(random()<.5?'coffee':'stretch'):null};
  }
  function go(m,p,goal) {
    m.goal=goal;m.legs=route(p,m,goal);m.sitting=false;
    if(m.legs.length) {m.state='walking';m.pastime=null;}
  }
  function tick(m,a,p,dt,t,others=[],random=Math.random,reduced=false) {
    let intent=state(a); const seat=p.desks.get(a.id);
    if(intent==='success'&&m.intent==='success'&&t-m.changedAt>3500) intent='idle';
    // A sustained demo success is consumed once, until a different source state arrives.
    if(m.consumedSuccess&&state(a)==='success') intent='idle';
    if(state(a)!=='success') m.consumedSuccess=false;
    if(m.intent!==intent) {
      if(m.intent==='success'&&intent==='idle') m.consumedSuccess=true;
      m.intent=intent;m.changedAt=t;m.legs=[];m.pastime=null;m.until=t+2500+random()*4000;
      const target=['idle','success'].includes(intent)&&a.kind!=='user'?null:seat;
      if(target && (Math.abs(m.x-target.x)+Math.abs(m.y-target.y)>.1)) go(m,p,target);
      else {m.state=intent;m.sitting=a.kind==='user'||!['idle','success','walking'].includes(intent);}
      if(intent==='idle'){m.until=t;m.pastime=null;}
    }
    if(reduced) {
      const target=['idle','success'].includes(intent)&&a.kind!=='user'?null:seat;
      if(target){m.x=target.x;m.y=target.y;}
      m.legs=[];m.state=intent;m.sitting=!!target;m.dir='down';return;
    }
    if(t>m.nextBlink) {m.blink=t+130;m.nextBlink=t+2200+random()*4200;}
    // A worker who stepped aside resumes the trip to their own desk.
    if(!m.legs.length&&!['idle','success'].includes(intent)&&!m.sitting&&t>m.until)go(m,p,seat);
    if(!m.legs.length&&intent==='idle'&&t>m.until&&a.kind!=='user') {
      const peers=others.filter(o=>o!==m);
      // Reserve destinations too, so several walkers don't all pick the same cafe spot.
      let destinations=p.restSpots.get(a.id).filter(q=>peers.every(o=>Math.hypot(q.x-o.x,q.y-o.y)>=18&&(!o.legs.length||!o.goal||Math.hypot(q.x-o.goal.x,q.y-o.goal.y)>=18)));
      const friend=peers.find(o=>o.team===a.team&&o.intent==='idle'&&!o.legs.length);
      if(friend&&random()<.45) {
        const nearby=destinations.filter(q=>Math.hypot(q.x-friend.x,q.y-friend.y)<=22);
        if(nearby.length)destinations=nearby;
      }
      const target=destinations[Math.floor(random()*destinations.length)];
      if(target)go(m,p,target);
      m.until=t+4000+random()*8000;
    }
    if(m.legs.length) {
      const next=m.legs[0], dx=next.x-m.x,dy=next.y-m.y,dist=Math.hypot(dx,dy),step=Math.min(dist,SPEED*dt);
      const pos={x:m.x+(dx/(dist||1))*step,y:m.y+(dy/(dist||1))*step};
      const near=others.find(o=>o!==m&&Math.hypot(pos.x-o.x,pos.y-o.y)<6);
      if(near) {
        m.blocked=(m.blocked||0)+dt;
        if(m.blocked>1.2&&m.goal) {
          const blocked=new Set(), peers=others.filter(o=>o!==m);
          for(const k of p.walkable){const [x,y]=k.split(',').map(Number);if(peers.some(o=>Math.hypot(x-o.x,y-o.y)<7))blocked.add(k);}
          // Retreat along the current grid segment if its forward endpoint is occupied.
          const anchors=[];
          for(const x of [Math.floor(m.x/4)*4,Math.ceil(m.x/4)*4])for(const y of [Math.floor(m.y/4)*4,Math.ceil(m.y/4)*4])
            if(p.walkable.has(p.key(x,y))&&peers.every(o=>Math.hypot(x-o.x,y-o.y)>=6))anchors.push({x,y});
          anchors.sort((a,b)=>Math.hypot(a.x-m.x,a.y-m.y)-Math.hypot(b.x-m.x,b.y-m.y));
          let found=false;
          for(const anchor of anchors){const detour=route(p,anchor,m.goal,blocked);if(detour.length){m.legs=[anchor,...detour];found=true;break;}}
          // If the destination or corridor is occupied, step aside instead of
          // retrying the same impossible route forever. No teleporting through peers.
          if(!found){
            const exits=[...p.walkable].filter(k=>!blocked.has(k)).map(k=>{const [x,y]=k.split(',').map(Number);return {x,y};})
              .filter(q=>Math.hypot(q.x-m.x,q.y-m.y)>=12&&peers.every(o=>Math.hypot(q.x-o.x,q.y-o.y)>=12))
              .sort((a,b)=>Math.hypot(a.x-m.x,a.y-m.y)-Math.hypot(b.x-m.x,b.y-m.y));
            for(const exit of exits){
              for(const anchor of anchors){const detour=route(p,anchor,exit,blocked);if(detour.length){m.goal=exit;m.legs=[anchor,...detour];found=true;break;}}
              if(found)break;
            }
          }
          m.blocked=0;
        }
        return;
      }
      m.blocked=0;m.x=pos.x;m.y=pos.y;m.dist+=step;m.state='walking';
      m.dir=Math.abs(dx)>.01?(dx>0?'right':'left'):(dy>0?'down':'up');
      if(dist<=step+.001)m.legs.shift();
      if(!m.legs.length) {
        m.state=intent;m.dir='down';m.sitting=!['idle','success'].includes(intent)&&Math.hypot(m.x-seat.x,m.y-seat.y)<1;
        if(!['idle','success'].includes(intent)&&!m.sitting)m.state='walking';
        if(intent==='idle'){
          const friend=others.find(o=>o!==m&&o.team===a.team&&o.intent==='idle'&&Math.hypot(o.x-m.x,o.y-m.y)<24);
          m.pastime=friend?'chat':inside(m,p.lounge)?'coffee':random()<.5?'stretch':'coffee';
          if(friend)m.dir=friend.x>m.x?'right':'left';
        }
        m.until=t+3000+random()*7000;
      }
    }
  }
  return {plan,route,tick,make,state,inside,GRID,SPEED};
})();

function bubbleText(a) {
  if(a.kind==='user') return '싸부의 자리예요';
  if(a.isChief&&a.status==='idle') return '필요하면 불러주세요';
  if(a.status==='working'&&a.currentTask){
    if(/답변/.test(a.currentTask))return '답변을 작성하고 있어요';
    if(/시장|시황|감시/.test(a.currentTask))return '시장을 살펴보고 있어요';
    if(/테스트|검증/.test(a.currentTask))return '테스트 중이에요';
    if(/뉴스|자료|확인/.test(a.currentTask))return '자료를 확인하고 있어요';
    if(/브리핑|보고|작성/.test(a.currentTask))return '보고서를 정리하고 있어요';
  }
  return {idle:'잠깐 쉬고 있어요',walking:'자리로 가고 있어요',working:'작업하고 있어요',thinking:'자료를 살펴보고 있어요',waiting:'답변을 기다리고 있어요',meeting:'회의 중이에요',success:'완료했어요',error:'확인이 필요해요',halted:'비상 정지 상태예요',offline:'연결을 기다리고 있어요'}[a.status]||'상태를 확인해주세요';
}

function motionText(a,m) {
  if(m.state==='walking')return ['idle','success'].includes(m.intent)?'쉬러 가는 중이에요':'자리로 가고 있어요';
  if(m.state==='idle'&&a.kind!=='user')return {coffee:'커피 한 모금 ☕',chat:'도란도란 · 쉬는 시간',stretch:'잠깐 기지개'}[m.pastime]||bubbleText({...a,status:'idle'});
  return bubbleText({...a,status:m.state});
}

// Public bot usernames verified with getMe. Only example text is copied; nothing is sent.
const BOT_LINKS={invest:'https://t.me/TEAM_SSABU_bot',family:'https://t.me/TEAM_JJAEMEE_BOT',office:'https://t.me/PA_ssabu_bot'};
const REQUESTS={
  hyeonju:['오늘 할 일 정리해줘','승초한테 삼성전자 현황 물어봐'],
  kevin:['투자정보팀 최근 보고 정리해줘','승초한테 오늘 장 상황 물어봐'],
  suji:['수지야 삼성전자 타점 분석해줘','수지야 내 관심종목 보여줘'],
  seungcho:['승초야 삼성전자 분석해줘','승초야 미국장 주요 이슈 알려줘'],
  hyeoncheol:['현철아 최근 부동산 정책 쉽게 설명해줘'],
  buljang:['불장아 비트코인 분석해줘'],
  jiyoung:['지영아 이번 주 AI 산업 주요 이슈 알려줘'],
  jjaemi:['째미야 가족팀 최근 보고 정리해줘'],
  jjaemi1:['째미1아 최근 출산·육아 지원 소식 알려줘'],
  jjaemi2:['째미2야 이번 주 준비할 일정 정리해줘']
};
function requestCard(a) {
  const card=document.createElement('div');card.className='office-requests';
  const title=document.createElement('strong');title.textContent=a.name+'에게 이렇게 부탁해 보세요';
  const notice=document.createElement('span');notice.className='request-notice';notice.setAttribute('role','status');
  card.append(title);
  const samples=REQUESTS[a.id]||[a.name+'님, 담당 업무를 알려줘'];
  for(const text of samples) {
    const row=document.createElement('div');row.className='request-row';
    const line=document.createElement('span');line.textContent=text;
    const copy=document.createElement('button');copy.type='button';copy.textContent='복사';copy.setAttribute('aria-label',text+' 복사');
    copy.addEventListener('click',async()=>{
      try{await navigator.clipboard.writeText(text);notice.textContent='복사했어요. 봇 대화방에 붙여 넣어 주세요.';}
      catch{notice.textContent='자동 복사가 안 되면 예시 문장을 선택해 복사해 주세요.';}
    });row.append(line,copy);card.append(row);
  }
  const actions=document.createElement('div');actions.className='request-actions';
  const link=document.createElement('a');link.href=BOT_LINKS[a.team]||BOT_LINKS.office;link.target='_blank';link.rel='noopener';link.textContent='텔레그램에서 부탁하기 ↗';
  const schedule=document.createElement('button');schedule.type='button';schedule.textContent='정기 일정 확인';
  schedule.addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText('/schedule');notice.textContent='/schedule 복사 완료 · 봇 대화방에서 보내면 정기 일정을 볼 수 있어요.';}
    catch{notice.textContent='봇 대화방에 /schedule 을 보내면 정기 일정을 볼 수 있어요.';}
  });actions.append(link,schedule);card.append(actions,notice);return card;
}

/* Shared DOM styles are installed here so existing /office.js route still works
 * before the running bot is restarted. Existing page frames and detail panels stay. */
function installOfficeStyle() {
  if(document.getElementById('pixel-office-style'))return;
  const style=document.createElement('style');style.id='pixel-office-style';
  style.textContent=`
  .office-shell{width:100%;padding:6px 0;color:#e8e3d5;font-family:'Malgun Gothic',sans-serif;position:relative}
  .office-heading{display:flex;gap:8px;align-items:center;justify-content:space-between;max-width:900px;margin:0 auto 6px;padding:0 12px;font-size:11px;color:#a9b6a0}
  .office-heading strong{font-size:12px;color:#e4dfcf;font-weight:600}
  .office-source{font-size:10px;color:#cbc0a6}.office-source.demo{color:#f6c87c}
  .office-shell .stage{position:relative;margin:0 auto;overflow:hidden;border-radius:3px;background:#374139;isolation:isolate}
  .office-shell canvas.scene{position:absolute;left:0;top:0;display:block;image-rendering:pixelated}
  .office-shell .overlay{position:absolute;inset:0;pointer-events:none}
  .office-shell .plate{position:absolute;left:0;top:0;padding:2px 5px;border:1px solid #626450;background:#ece6d2;color:#424a3d;border-radius:2px;font-size:11px;line-height:15px;font-weight:700;white-space:nowrap;max-width:none;pointer-events:none}
  .office-shell .who{position:absolute;left:0;top:0;margin:0;padding:0;border:0;background:none;cursor:pointer;pointer-events:auto;overflow:visible;outline-offset:2px}
  .office-shell .who .nm{position:absolute;left:50%;top:100%;transform:translateX(-50%);width:max-content;max-width:180px;padding:1px 4px;border:1px solid #d7cbb1;border-radius:3px;background:#f4efdfed;color:#393d30;font-size:10px;font-weight:600;line-height:15px;white-space:nowrap;overflow:visible}
  .office-shell .who.chief .nm{background:#e9edce;color:#33452e;border-color:#71835a;font-weight:700}
  .office-shell .who.owner .nm{background:#f6ddaa;border-color:#99763d}
  .office-shell .who.on .nm{outline:2px solid #557b56}
  .office-shell .who:focus-visible{outline:2px solid #557b56}
  .office-shell .speech{position:absolute;width:max-content;max-width:158px;padding:5px 7px;background:#fffaf0;color:#3d4637;border:1px solid #6f775e;border-radius:5px;font-size:11px;line-height:16px;white-space:normal;overflow-wrap:anywhere;box-shadow:0 2px #594b3330;pointer-events:none}
  .office-shell .speech.chief{border:2px solid #7a8c58;background:#f4f5dc}
  .office-shell .speech.alert{border-color:#a2694d;background:#fff1db}
  .office-detail{max-width:900px;margin:6px auto 0;padding:6px 10px;background:#23302c;color:#ecebda;font-size:12px;line-height:1.6;border-radius:4px;min-height:26px}
  .office-detail:empty{display:none}.office-demo{display:flex;gap:6px;justify-content:center;align-items:center;flex-wrap:wrap;font-size:11px;margin:6px 0;color:#e6d7b8}
  .office-demo select{background:#f0ead9;color:#3d493c;border:1px solid #6c775d;padding:3px;border-radius:3px;font-size:11px;max-width:160px}
  .office-shell.compact .office-heading{font-size:10px;padding:0 8px;margin-bottom:4px}.office-shell.compact .office-heading strong{font-size:11px}
  .office-shell.compact .plate{font-size:10px;line-height:13px;padding:1px 3px}
  .office-shell.compact .who .nm{font-size:10px;line-height:13px;padding:0 2px}
  .office-shell.compact .who.chief .nm{font-size:10px;max-width:none}
  .office-shell.compact .speech{font-size:11px;padding:3px 5px;max-width:148px}
  .office-shell.compact .office-detail{font-size:11px;padding:4px 8px}
  .office-shell.compact .office-demo{position:absolute;right:10px;bottom:9px;z-index:1001;margin:0;padding:3px;background:#f0ead9de;border:1px solid #827d66;border-radius:3px}
  .office-tools{display:flex;gap:6px;flex-wrap:wrap;max-width:900px;margin:5px auto 9px;padding:0 8px}
  .office-tools button,.office-requests button,.request-actions a{border:1px solid #536555;border-radius:8px;background:#26392f;color:#eee9da;padding:7px 10px;font:inherit;cursor:pointer;text-decoration:none;min-height:36px}
  .office-tools button[aria-pressed=true]{background:#D9E3C1;color:#304638;border-color:#D9E3C1}
  .office-requests{max-width:900px;margin:8px auto;padding:12px;border:1px solid #52664e;border-radius:10px;background:#1c2925;color:#e5e9d9;font-size:12px;line-height:1.6}
  .request-row{display:flex;gap:10px;align-items:center;justify-content:space-between;margin:8px 0}
  .request-row span{user-select:text;overflow-wrap:anywhere}.request-row button{flex-shrink:0}
  .request-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.request-notice{display:block;min-height:20px;margin-top:6px;color:#bfcda8}
  .office-caption{max-width:900px;margin:7px auto 0;padding:0 8px;font-size:10px;color:#a9b6a0;line-height:1.5}
  .office-shell.compact .office-tools{margin-bottom:5px}
  .office-shell.compact .office-tools button{min-height:28px;padding:3px 8px}
  .office-shell.widget .office-caption{display:none}
  @media(max-width:520px){.bar{padding:5px 8px}.note{padding:4px 8px;font-size:10px}.office{padding:0}.office-shell{padding:3px 0}}
  `;
  document.head.append(style);
}

function createOffice(opts={}) {
  const pal={...ROOM_LIGHT,wallTop:'#4A5044',wallBase:'#757860',floor:'#D9BD92',floorAlt:'#D2B489',seam:'#C09C70',rug:'#BBC8A2',rugEdge:'#829171',rugLine:'#CAD4B8'};
  const motion=new Map(), query=new URLSearchParams(location.search), demo=query.get('demo')==='1', first=query.get('stage')==='first';
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let sc=null,raf=0,last=0,drawAt=0,observer=null,visibilityObserver=null,onScreen=true,rootRef=null,selected=null,simStatus='idle',simTarget='kevin';
  let sourceList=[],sourceZones=[],sourceOpts={},teamView='all',savedAt=0;
  const storageKey='ssabu-office-motion-v2:'+location.pathname;
  function saveMotion(t) {
    if(!sc||demo)return;
    try{sessionStorage.setItem(storageKey,JSON.stringify({at:Date.now(),sig:sc.sig,rows:[...motion].map(([id,m])=>({id,x:m.x,y:m.y,intent:m.intent,state:m.state,dir:m.dir,pastime:m.pastime,sitting:m.sitting,dist:m.dist,legs:m.legs,goal:m.goal?{x:m.goal.x,y:m.goal.y}:null,wait:Math.max(0,m.until-t)}))}));}catch{}
  }
  function restoreMotion(t) {
    if(demo)return;
    try{
      const saved=JSON.parse(sessionStorage.getItem(storageKey));
      if(!saved||saved.sig!==sc.sig||Date.now()-saved.at>1800000)return;
      for(const row of saved.rows){
        const m=motion.get(row.id),p=sc.plan;
        if(!m||m.intent!==row.intent||!Number.isFinite(row.x)||!Number.isFinite(row.y)||!p.walkable.has(p.key(Math.round(row.x/4)*4,Math.round(row.y/4)*4)))continue;
        if(!Array.isArray(row.legs)||row.legs.some(q=>!p.walkable.has(p.key(q.x,q.y))))continue;
        Object.assign(m,row,{until:t+Math.min(row.wait||0,7000),changedAt:t-15000});
      }
    }catch{}
  }
  const onPageHide=()=>saveMotion(performance.now());
  window.addEventListener('pagehide',onPageHide);
  function agentsForScene(list) {
    return list.filter(a=>!first||['hyeonju','kevin','ssabu'].includes(a.id)).map(a=>demo&&a.kind!=='user'?{...a,status:a.id===simTarget?simStatus:'idle',stateSource:'demo'}:a);
  }
  function drawRoom(ctx,s,r) {
    const rp={...pal,rug:r.accent};
    if(r.type==='lounge'){drawRug(ctx,s,r.x+6,r.y+39,r.w-12,30,rp);return;}
    drawFloor(ctx,s,r.x,r.y+16,r.w,r.h-16,pal);
    drawWall(ctx,s,r.x,r.y,r.w,14,{...pal,wall:r.key==='family'?'#EED8D9':pal.wall});
    rect(ctx,s,r.x+3,r.y+14,r.w-6,2,r.accent);
    drawWindow(ctx,s,r.x+r.w-27,r.y+4,20,10,pal);
    rect(ctx,s,r.x,r.y,3,r.h,pal.wallTop);rect(ctx,s,r.x+r.w-3,r.y,3,r.h,pal.wallTop);
    const door=r.door.x;
    if(r.type==='team') {
      rect(ctx,s,r.x,r.y+r.h-3,door-r.x-10,3,pal.wallTop);
      rect(ctx,s,door+10,r.y+r.h-3,r.x+r.w-door-10,3,pal.wallTop);
    } else {
      // Top door cuts through the wall; no invisible wall in the navigation graph.
      drawFloor(ctx,s,door-10,r.y,20,20,pal);
      rect(ctx,s,r.x,r.y+r.h-3,r.w,3,pal.wallTop);
    }
    drawRug(ctx,s,r.x+7,r.y+r.h-16,r.w-14,10,rp);
    if(r.key==='invest'&&r.w>95){
      rect(ctx,s,r.x+35,r.y+3,24,10,'#3C625B');
      [3,5,4,7,6].forEach((h,i)=>rect(ctx,s,r.x+38+i*4,r.y+12-h,2,h,'#B8D8AD'));
    }
    if(r.key==='family'){
      rect(ctx,s,r.x+r.w-40,r.y+5,5,5,'#D38E9B');
      rect(ctx,s,r.x+r.w-41,r.y+3,2,3,'#D38E9B');rect(ctx,s,r.x+r.w-36,r.y+3,2,3,'#D38E9B');
    }
    // Small wall shelf with individually drawn books.
    if(r.w>95) {
      rect(ctx,s,r.x+9,r.y+12,20,3,'#8B7150');
      ['#7E9977','#B5795C','#E4C67E','#829BA1'].forEach((c,i)=>rect(ctx,s,r.x+10+i*4,r.y+6,3,6,c));
    }
  }
  function background() {
    const {bg,plan:p,scale:s}=sc,ctx=bg.getContext('2d');
    bg.width=p.width*s;bg.height=p.height*s;ctx.imageSmoothingEnabled=false;
    rect(ctx,s,0,0,p.width,p.height,'#495346');
    drawFloor(ctx,s,4,4,p.width-8,p.height-8,{...pal,floor:'#B6AA8A',floorAlt:'#B1A583',seam:'#A99C7B'});
    p.rooms.forEach(r=>drawRoom(ctx,s,r));
    // A tiny plant and corridor runner give the common space a lived-in feeling.
    drawPlant(ctx,s,12,p.lounge.y-6,pal,false);
    drawPlant(ctx,s,p.width-12,p.lounge.y-6,pal,false);

  }
  function draw(t) {
    if(!sc)return;
    const {ctx,plan:p,scale:s}=sc;
    ctx.clearRect(0,0,p.width*s,p.height*s);ctx.drawImage(sc.bg,0,0);
    const layers=[],tick=Math.floor(t/150);
    const c=p.coffee,so=p.sofa;
    layers.push({y:c.y+c.h,paint:()=>{
      drawDesk(ctx,s,c.x,c.y,c.w,{...pal,deskTop:'#EDD4AF',deskFace:'#B58969'});
      rect(ctx,s,c.x+3,c.y-8,10,10,'#526963');rect(ctx,s,c.x+5,c.y-6,5,3,'#D4E3C3');
      rect(ctx,s,c.x+7,c.y,3,3,'#FFF2DD');rect(ctx,s,c.x+17,c.y+3,4,3,'#F5EBDD');
    }});
    layers.push({y:so.y+so.h,paint:()=>{
      rect(ctx,s,so.x,so.y-5,so.w,15,'#9BAF92');rect(ctx,s,so.x+2,so.y,so.w-4,10,'#C4D2AD');
      rect(ctx,s,so.x+3,so.y+3,8,5,'#E6B7A7');rect(ctx,s,so.x+15,so.y+3,8,5,'#EBD69C');
      rect(ctx,s,so.x+2,so.y+10,3,3,'#7C6951');rect(ctx,s,so.x+so.w-5,so.y+10,3,3,'#7C6951');
    }});
    for(const a of sc.list) {
      const d=p.desks.get(a.id),m=motion.get(a.id); if(!m||!d)continue;
      const lit=['working','thinking'].includes(m.intent)&&m.sitting;
      layers.push({y:d.y+17,paint:()=>{
        drawDesk(ctx,s,d.x0,d.y0,d.w,a.isChief?{...pal,deskTop:'#BCA66F',deskFace:'#7F754C'}:pal);
        if(a.kind!=='user')drawMonitor(ctx,s,d.x-3,d.y0,pal,lit);
        drawDeskProps(ctx,s,d.x-11,d.y0,pal,a.id);
        if(a.kind!=='user')drawKeyboard(ctx,s,d.x-8,d.y0,pal,lit&&tick%2===0);
      }});
      layers.push({y:d.y-1,paint:()=>drawChairSeat(ctx,s,d.x,d.y,pal,!m.sitting)});
      const bounce=m.state==='success'&&!reduced?Math.abs(Math.sin((t-m.changedAt)/160))*3:0;
      layers.push({y:m.y,paint:()=>{
        drawFootShadow(ctx,s,m.x,m.y+1,pal,false);
        drawChar(ctx,a.id,m.dir,m.legs.length&&!reduced?Math.floor(m.dist/4)%4:0,t<m.blink,m.sitting,(Math.round(m.x)-8)*s,(Math.round(m.y)-FOOT_Y-bounce)*s,s,a.status==='offline'?.6:1);
        if(a.kind!=='user') {
          if(m.state==='idle'&&m.pastime==='coffee'){
            rect(ctx,s,m.x+5,m.y-10,4,4,'#FFF0D2');rect(ctx,s,m.x+9,m.y-9,1,2,'#C7A87E');
            if(!reduced)rect(ctx,s,m.x+6,m.y-14-tick%2,1,2,'#EEE3C8');
          }
          if(m.state==='idle'&&m.pastime==='chat')for(let i=0;i<3;i++)rect(ctx,s,m.x-3+i*3,m.y-29,1,1,'#EEE3C8');
          const color={working:'#4D996F',thinking:'#9183AC',waiting:'#D59B3E',meeting:'#598E99',success:'#66A96E',error:'#BD5C4F',halted:'#BD5C4F',offline:'#85877F',idle:'#899D73',walking:'#899D73'}[m.state]||'#899D73';
          rect(ctx,s,m.x-2,m.y-25,4,3,color);
          if(['waiting','error','halted'].includes(m.intent)){rect(ctx,s,m.x+5,m.y-27,1,4,color);rect(ctx,s,m.x+5,m.y-22,1,1,color);}
          if(m.intent==='thinking')for(let i=0;i<3;i++)rect(ctx,s,m.x-4+i*3,m.y-29,1,1,'#766384');
        }
      }});
    }
    layers.sort((a,b)=>a.y-b.y).forEach(l=>l.paint());
    tags(t);
  }
  function tags(t) {
    const {plan:p,scale:s}=sc,candidates=[],names=[],bodies=[];
    const rects=[...sc.plates].map(el=>({x:el.offsetLeft+Number(el.dataset.x),y:Number(el.dataset.y),w:el.offsetWidth,h:el.offsetHeight}));
    const intersects=(q,r)=>q.x<r.x+r.w+2&&q.x+q.w+2>r.x&&q.y<r.y+r.h+2&&q.y+q.h+2>r.y;
    for(const a of sc.list) {
      const m=motion.get(a.id),el=sc.tags.get(a.id);if(!m||!el)continue;
      const x=Math.round((m.x-8)*s),y=Math.round((m.y-FOOT_Y)*s);
      el.style.transform=`translate(${x}px,${y}px)`;
      el.style.zIndex=String(a.isChief?700:100+Math.round(m.y));
      el.classList.toggle('on',a.id===selected);
      const description=`${a.name} · ${a.role} · ${a.kind==='user'?'사용자 캐릭터':statusMeta(m.state).label}${['snapshot','activity'].includes(a.stateSource)?' · 실시간 상태 미연결':''}`;
      if(el.getAttribute('aria-label')!==description)el.setAttribute('aria-label',description);
      el.title=description+' · '+motionText(a,m);
      bodies.push({id:a.id,x,y,w:16*s,h:22*s});
      const nm=el.firstChild,w=nm.offsetWidth;
      const nameLeft=Math.max(2,Math.min(p.width*s-w-2,x+8*s-w/2));
      nm.style.left=(nameLeft-x)+'px';nm.style.transform='none';
      names.push({nm,a,x:nameLeft,y:y+22*s,w,h:16,baseY:y,priority:(a.isChief?1000:0)+(a.id===selected?200:0)+(a.kind==='user'?100:0)});
      const urgent=['waiting','error','halted'].includes(m.intent),hovered=el.matches(':hover,:focus-visible');
      const restBubble=m.state==='idle'&&m.pastime&&Math.floor(t/4000)%Math.max(1,sc.list.length)===sc.list.indexOf(a);
      if(hovered||a.id===selected||urgent||restBubble||t-m.changedAt<6000||a.isChief&&t-m.changedAt<12000)
        candidates.push({a,m,x,y,priority:(hovered||a.id===selected?200:0)+(a.isChief?100:0)+(urgent?80:0)});
    }
    names.sort((a,b)=>b.priority-a.priority);
    for(const n of names){
      const place=[0,17,34].map(d=>({...n,y:n.y+d})).find(q=>q.y>0&&q.y+q.h<p.height*s&&!rects.some(r=>intersects(q,r))&&!bodies.some(r=>r.id!==n.a.id&&intersects(q,r)));
      n.nm.style.visibility=place?'visible':'hidden';
      if(place){n.nm.style.top=(place.y-n.baseY)+'px';rects.push(place);}
    }
    const countState=k=>sc.list.filter(a=>a.status===k).length;
    const summary=[['working','작업'],['waiting','답변 대기'],['error','오류'],['thinking','생각 중']].filter(([k])=>countState(k)).map(([k,name])=>name+' '+countState(k)).join(' · ');
    const heading=summary||(first?'첫 버전 · 현주와 투자정보팀':'우리들의 작은 사무실');
    if(sc.title.textContent!==heading)sc.title.textContent=heading;
    rects.push(...bodies);
    candidates.sort((a,b)=>b.priority-a.priority);
    sc.bubbles.textContent='';let count=0;
    for(const c of candidates) {
      if(count>=(p.compact?2:3))break;
      const bubble=document.createElement('span');bubble.className='speech'+(c.a.isChief?' chief':'')+(['waiting','error','halted'].includes(c.m.intent)?' alert':'');
      bubble.textContent=c.a.name+' · '+motionText(c.a,c.m);sc.bubbles.append(bubble);
      const w=bubble.offsetWidth,h=bubble.offsetHeight,cx=c.m.x*s;
      const places=[{x:cx-w/2,y:c.y-h-7},{x:cx-w/2,y:c.y-h-30},{x:cx+18,y:c.y+8},{x:cx-w-18,y:c.y+8}];
      // Search nearby clear floor as a fallback; a balloon must never cover a face.
      const clearFloor=[];
      for(let y=30;y<p.height*s-h-4;y+=12)for(let x=4;x<p.width*s-w-3;x+=20)clearFloor.push({x,y});
      clearFloor.sort((a,b)=>Math.hypot(a.x+w/2-cx,a.y-c.y)-Math.hypot(b.x+w/2-cx,b.y-c.y));
      places.push(...clearFloor);
      const place=places.map(q=>({...q,x:Math.max(3,Math.min(p.width*s-w-3,q.x)),w,h})).find(q=>q.y>20&&q.y+h<p.height*s-2&&!rects.some(r=>q.x<r.x+r.w+3&&q.x+q.w+3>r.x&&q.y<r.y+r.h+3&&q.y+q.h+3>r.y));
      if(place){bubble.style.left=place.x+'px';bubble.style.top=place.y+'px';rects.push(place);count++;}else bubble.remove();
    }
    const focus=sc.list.find(a=>a.id===selected);
    const detail=focus?`${focus.name} · ${focus.role} · ${focus.kind==='user'?'사용자 아바타 (접속 상태와 무관)':statusMeta(motion.get(focus.id).state).label} · ${motionText(focus,motion.get(focus.id))}`:'';
    if(sc.detail.textContent!==detail)sc.detail.textContent=detail;
    if(sc.requestId!==selected){
      sc.requestId=selected;sc.requests.replaceChildren();
      if(focus&&focus.kind!=='user')sc.requests.append(requestCard(focus));
    }
  }
  function frame(t) {
    raf=0;if(!sc)return;
    const dt=Math.min(.08,(t-last)/1000||.016);last=t;
    if(!document.hidden&&onScreen) {
      const all=[...motion.values()];
      sc.list.forEach(a=>OfficeModel.tick(motion.get(a.id),a,sc.plan,dt,t,all,Math.random,reduced));
      if(t-drawAt>65){draw(t);drawAt=t;}
      if(t-savedAt>2000){saveMotion(t);savedAt=t;}
    }
    if(!document.hidden&&onScreen)raf=requestAnimationFrame(frame);
  }
  function wake(){if(sc&&!raf&&!document.hidden&&onScreen){last=performance.now();raf=requestAnimationFrame(frame);}}
  document.addEventListener('visibilitychange',wake);
  function build(root,list,zones,o={}) {
    installOfficeStyle(); sourceList=list;sourceZones=zones;sourceOpts=o;
    if(o.selectedId!==undefined)selected=o.selectedId;
    const all=agentsForScene(list);
    const actual=teamView==='all'?all:all.filter(a=>a.team===teamView);
    const zs=(first?zones.filter(z=>z.key==='invest'):zones).filter(z=>teamView==='all'||z.key===teamView);
    const available=Math.min(root.clientWidth||420,document.documentElement.clientWidth),compact=available<600;
    const scale=available>=1080?3:available>=328?2:1;
    const width=Math.min(360,Math.floor((available-8)/scale/4)*4);
    const plan=OfficeModel.plan(actual,zs,width);
    const sig=actual.map(a=>a.id+':'+a.team).join('|')+';'+width+';'+scale;
    if(sc&&sc.sig===sig){sc.list=actual;if(o.selectedId!==undefined)selected=o.selectedId;wake();return;}
    if(raf)cancelAnimationFrame(raf);
    assignLooks(actual.map(a=>a.id));
    const shell=document.createElement('section');shell.className='office-shell'+(compact?' compact':'')+(opts.smallWindow?' widget':'');
    const heading=document.createElement('div');heading.className='office-heading';
    const title=document.createElement('strong');title.textContent=first?'첫 버전 · 현주와 투자정보팀':'우리들의 작은 사무실';
    const source=document.createElement('span');source.className='office-source'+(demo?' demo':'');
    source.textContent=demo?'동작 미리보기 · 실제 작업 아님':actual.some(a=>a.stateSource==='snapshot')?'미리보기 · 실시간 상태 미연결':actual.some(a=>a.stateSource==='published')?'마지막 수신 상태 기준':actual.some(a=>a.stateSource==='activity')?'활동 이력 · 실시간 상태 미연결':'실제 상태';
    heading.append(title,source);shell.append(heading);
    const tools=document.createElement('nav');tools.className='office-tools';tools.setAttribute('aria-label','사무실 팀 선택');
    for(const [key,label] of [['all','전체'],...zones.map(z=>[z.key,z.label]),['office','현주 · 싸부']]){
      const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-pressed',String(teamView===key));
      b.addEventListener('click',()=>{saveMotion(performance.now());teamView=key;selected=null;build(root,sourceList,sourceZones,{...sourceOpts,selectedId:null});});tools.append(b);
    }shell.append(tools);
    if(demo){
      const control=document.createElement('div');control.className='office-demo';
      const who=document.createElement('select');who.setAttribute('aria-label','미리보기 캐릭터');
      actual.filter(a=>a.kind!=='user').forEach(a=>{const op=document.createElement('option');op.value=a.id;op.textContent=a.name;who.append(op);});who.value=simTarget;
      const state=document.createElement('select');state.setAttribute('aria-label','미리보기 상태');
      ['idle','working','thinking','waiting','success','error','offline'].forEach(k=>{const op=document.createElement('option');op.value=k;op.textContent=statusMeta(k).label;state.append(op);});state.value=simStatus;
      who.addEventListener('change',()=>{simTarget=who.value;sc.list=agentsForScene(sourceList);});
      state.addEventListener('change',()=>{simStatus=state.value;sc.list=agentsForScene(sourceList);});
      control.append(who,state);shell.append(control);
    }
    const stage=document.createElement('div');stage.className='stage';stage.style.width=plan.width*scale+'px';stage.style.height=plan.height*scale+'px';
    const canvas=document.createElement('canvas');canvas.className='scene';canvas.width=plan.width*scale;canvas.height=plan.height*scale;canvas.style.width=canvas.width+'px';canvas.style.height=canvas.height+'px';canvas.setAttribute('aria-hidden','true');
    const over=document.createElement('div');over.className='overlay';const tags=new Map(),plates=[];
    for(const r of plan.rooms){const plate=document.createElement('span');plate.className='plate';plate.textContent=r.title;plate.dataset.x=(r.x+5)*scale;plate.dataset.y=(r.y+3)*scale;plate.style.transform=`translate(${plate.dataset.x}px,${plate.dataset.y}px)`;over.append(plate);plates.push(plate);}
    for(const a of actual){
      const el=document.createElement('button');el.type='button';el.className='who'+(a.isChief?' chief':'')+(a.kind==='user'?' owner':'');el.dataset.id=a.id;el.style.width=16*scale+'px';el.style.height=22*scale+'px';
      const nm=document.createElement('span');nm.className='nm';nm.textContent=a.isChief?'현주 · 총괄 비서':a.name;
      el.append(nm);el.addEventListener('click',()=>{selected=selected===a.id?null:a.id;if(a.kind!=='user'&&o.onSelect&&!opts.smallWindow)o.onSelect(a.id);draw(performance.now());});over.append(el);tags.set(a.id,el);
    }
    const bubbles=document.createElement('div');bubbles.style.cssText='position:absolute;inset:0;z-index:900;pointer-events:none';over.append(bubbles);
    const detail=document.createElement('div');detail.className='office-detail';detail.setAttribute('aria-live','polite');
    const requests=document.createElement('div');
    const caption=document.createElement('p');caption.className='office-caption';caption.textContent='캐릭터를 눌러 부탁할 일을 골라보세요. 산책·커피·수다는 휴식 연출이에요.';
    stage.append(canvas,over);shell.append(stage,detail,requests,caption);root.replaceChildren(shell);
    sc={sig,plan,scale,canvas,ctx:canvas.getContext('2d'),bg:document.createElement('canvas'),tags,bubbles,detail,requests,requestId:null,plates,title,list:actual};sc.ctx.imageSmoothingEnabled=false;
    const old=new Map(motion);motion.clear();
    actual.forEach(a=>{const fresh=OfficeModel.make(a,plan,performance.now());const previous=old.get(a.id);if(previous&&plan.walkable.has(plan.key(Math.round(previous.x/4)*4,Math.round(previous.y/4)*4)))Object.assign(fresh,{...previous,legs:[],goal:null,intent:null,until:performance.now()+1000,sitting:false});motion.set(a.id,fresh);});
    if(!old.size)restoreMotion(performance.now());
    background();draw(performance.now());last=performance.now();raf=requestAnimationFrame(frame);
    if(visibilityObserver)visibilityObserver.disconnect();
    visibilityObserver=new IntersectionObserver(entries=>{const r=stage.getBoundingClientRect();onScreen=entries.at(-1).isIntersecting||(r.bottom>0&&r.top<innerHeight&&r.width>0);wake();});
    visibilityObserver.observe(stage);
    if(rootRef!==root){if(observer)observer.disconnect();let lastW=root.clientWidth;observer=new ResizeObserver(()=>{if(Math.abs(root.clientWidth-lastW)<4)return;lastW=root.clientWidth;build(root,sourceList,sourceZones,sourceOpts);});observer.observe(root);rootRef=root;}
  }
  return {build,motion,palette:()=>pal,redraw:()=>draw(performance.now()),wake,clear:()=>{if(raf)cancelAnimationFrame(raf);if(observer)observer.disconnect();if(visibilityObserver)visibilityObserver.disconnect();document.removeEventListener('visibilitychange',wake);window.removeEventListener('pagehide',onPageHide);sc=null;}};
}
function renderOffice(root,office,list,zones,opts){office.build(root,list,zones,opts||{});}
if(typeof module!=='undefined')module.exports={OfficeModel,STATUS,bubbleText,motionText,summarize};
