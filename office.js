/* 사무실 뷰 — 로컬 대시보드(index.html)와 컴팩트 창(compact.html)이 같이 쓴다.
 *
 * 캐릭터와 가구 도트는 sprites.js 가 그린다. 이 파일은 그 위에 **사무실**을
 * 짓는다: 구역(방)을 만들고, 팀원을 자리에 앉히고, 머리 위에 상태 점과
 * 말풍선을 올리고, 클릭을 상세 패널로 넘긴다.
 *
 * 왜 방 배경을 캔버스로 안 그리나:
 *   벽·바닥·창문은 직선과 단색 띠뿐이라 CSS 로 정수 픽셀로 그릴 수 있다.
 *   그러면 자리마다 캔버스 하나씩만 남아 클릭 판정이 DOM 으로 공짜가 된다.
 *   캔버스 한 장에 방을 다 그리면 좌표로 직접 히트 테스트를 해야 한다.
 *
 * 상태는 dashboard.py 가 정규화해 준 것만 쓴다 — working | idle | halted | offline.
 * 여기서 상태를 새로 만들지 마라 (없는 상태를 그리면 현황판이 거짓말을 한다).
 */

const STATUS = {
  working: { label: "작업 중", tone: "work" },
  idle:    { label: "대기",    tone: "idle" },
  halted:  { label: "정지",    tone: "halt" },
  offline: { label: "오프라인", tone: "off" },
};

/** 모르는 상태가 와도 화면이 깨지지 않게 한다. */
function statusMeta(s) {
  return STATUS[s] || { label: s || "알 수 없음", tone: "idle" };
}

/** 캐릭터 애니메이션에 넘길 모드. 오프라인·정지는 화면이 꺼진 자리로 그린다. */
function deskMode(s) {
  if (s === "working") return "work";
  if (s === "halted" || s === "offline") return "off";
  return "idle";
}

/** 경과 시간을 짧게. 1초 미만은 '방금'. */
function shortDur(sec) {
  if (sec === null || sec === undefined) return null;
  if (sec < 60) return sec + "초";
  const m = Math.floor(sec / 60);
  if (m < 60) return m + "분";
  const h = Math.floor(m / 60);
  return h < 24 ? h + "시간 " + (m % 60) + "분" : Math.floor(h / 24) + "일";
}

/** UTC·KST 문자열을 모두 받아 '몇 분 전' 으로. */
function agoText(iso, nowMs) {
  if (!iso) return null;
  const d = new Date(/[+Z]/.test(iso) ? iso : iso + "Z");
  if (isNaN(d)) return null;
  const min = Math.floor(((nowMs || Date.now()) - d.getTime()) / 60000);
  if (min < 1) return "방금";
  if (min < 60) return min + "분 전";
  const h = Math.floor(min / 60);
  if (h < 24) return h + "시간 전";
  return Math.floor(h / 24) + "일 전";
}

/* --- 소품 ---------------------------------------------------------------- */

// 화분 — 자리 사이를 채운다. (문자 뜻은 sprites.js 머리말 참고, 여기만 쓰는 글자다)
//   L 잎(밝은)  K 잎(어두운)  V 화분  W 화분 그늘
const PLANT = [
  "....LL....",
  "..LLKKLL..",
  ".LKKLLKKL.",
  "LKLLKKLLKL",
  ".LKKLLKKL.",
  "..LKKKKL..",
  "...LKKL...",
  "....KK....",
  "....KK....",
  "...VVVV...",
  "..VVVVVV..",
  "..VVVVVV..",
  "..WVVVVW..",
  "...WWWW...",
];
const PLANT_COLORS = {
  light: { L: "#6E9E63", K: "#4A7347", V: "#B5705A", W: "#8E5341" },
  dark:  { L: "#4E7550", K: "#35533A", V: "#7C4E40", W: "#5A382E" },
};

/** 화분 하나를 캔버스에 찍는다. 장면 격자가 아니라 자기 크기대로 그린다. */
function paintPlant(canvas, scale, dark) {
  const pal = PLANT_COLORS[dark ? "dark" : "light"];
  const w = PLANT[0].length * scale;
  const h = PLANT.length * scale;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  for (let y = 0; y < PLANT.length; y++) {
    for (let x = 0; x < PLANT[y].length; x++) {
      const c = pal[PLANT[y][x]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
}

/* --- 사무실 짓기 ---------------------------------------------------------- */

/** 자리 하나 — 캔버스 + 머리 위 상태 점·말풍선 + 이름표. 클릭하면 상세로. */
function buildSeat(office, a, scale, onSelect, selectedId) {
  const meta = statusMeta(a.status);

  const seat = document.createElement("button");
  seat.type = "button";
  seat.className = "seat " + meta.tone + (a.id === selectedId ? " on" : "");
  seat.style.width = office.sceneW * scale + "px";
  seat.dataset.id = a.id;
  // 색 말고 글자로도 상태를 알 수 있게 (접근성)
  seat.setAttribute("aria-label", a.name + " · " + a.role + " · " + meta.label);
  seat.setAttribute("aria-pressed", a.id === selectedId ? "true" : "false");

  // 말풍선 — 일하는 중이면 무슨 일인지, 놀 때는 노는 소리
  const bubble = document.createElement("span");
  bubble.className = "bubble";
  const said = a.status === "working" ? a.currentTask
             : a.status === "halted"  ? "🛑 정지"
             : a.status === "offline" ? "자리 비움"
             : a.idleLine;
  bubble.textContent = said || meta.label;
  if (!said) bubble.classList.add("mute");

  const dot = document.createElement("span");
  dot.className = "dot";

  const cv = document.createElement("canvas");
  cv.className = "who";

  const tag = document.createElement("span");
  tag.className = "tag";
  const nm = document.createElement("b");
  nm.textContent = a.name;
  const rl = document.createElement("em");
  const dur = shortDur(a.elapsedSec);
  rl.textContent = a.status === "working" && dur ? dur : a.role;
  tag.append(nm, rl);

  seat.append(bubble, dot, cv, tag);
  seat.addEventListener("click", () => onSelect(a.id));

  office.add(cv, a.id, { scale, mode: deskMode(a.status) });
  return seat;
}

/** 구역(방) 하나 — 벽 명패 + 책상 줄. 줄 나누기는 여기서 센다.
 *
 * flex 에 접기를 맡기면 둘째 줄부터 바닥·책상 띠가 어긋난다 (public.html 에서
 * 겪었다). 그래서 한 줄에 몇 명 앉는지를 직접 세고 줄마다 요소를 만든다.
 */
function buildZone(office, title, count, members, scale, width, onSelect, selectedId) {
  const z = document.createElement("section");
  z.className = "zone";

  const head = document.createElement("header");
  head.className = "zone-head";
  const plate = document.createElement("span");
  plate.className = "plate";
  plate.textContent = title;
  const n = document.createElement("span");
  n.className = "plate-n";
  n.textContent = count;
  plate.append(n);
  head.append(plate);
  // 벽에 창문 둘. 벽이 완전히 비면 사무실이 아니라 그냥 띠로 보인다.
  for (let i = 0; i < 2; i++) {
    const win = document.createElement("span");
    win.className = "win";
    win.setAttribute("aria-hidden", "true");
    head.append(win);
  }
  z.append(head);

  if (!members.length) {
    const empty = document.createElement("p");
    empty.className = "zone-empty";
    empty.textContent = "이 구역에 배치된 팀원이 없습니다.";
    z.append(empty);
    return z;
  }

  const tile = office.sceneW * scale;
  const per = Math.max(1, Math.floor(width / tile));
  const deck = deckBackground(office, scale);
  for (let i = 0; i < members.length; i += per) {
    const row = document.createElement("div");
    row.className = "row";
    row.style.backgroundImage = deck;
    for (const a of members.slice(i, i + per)) {
      row.append(buildSeat(office, a, scale, onSelect, selectedId));
    }
    z.append(row);
  }
  return z;
}

/** 책상 띠를 캔버스 좌우로 이어 그리는 배경.
 *
 * 캔버스 한 칸은 32칸 폭이라, 이게 없으면 한두 명인 줄에서 책상이 공중에 뜬
 * 섬처럼 보인다. 색은 sprites.js 팔레트에서 가져와 캔버스와 어긋나지 않게 한다.
 */
function deckBackground(office, scale) {
  const pal = office.palette();
  const deck = office.sceneH * scale;
  const top = deck - office.deskRows * scale;
  const u = scale;
  return "linear-gradient(180deg," +
    ["var(--wall) 0", "var(--wall) " + top + "px",
     pal.t + " " + top + "px", pal.t + " " + (top + u) + "px",
     pal.d + " " + (top + u) + "px", pal.d + " " + (top + 2 * u) + "px",
     pal.w + " " + (top + 2 * u) + "px", pal.w + " " + deck + "px",
     "var(--floor) " + deck + "px", "var(--floor) 100%"].join(",") + ")";
}

/** 팀원을 구역으로 나눈다. 팀장은 어느 팀에도 속하지 않으므로 자기 방을 받는다. */
function groupByZone(list, zones) {
  const lead = list.filter((a) => a.isLead);
  const out = [];
  if (lead.length) out.push({ title: "👔 팀장실", members: lead });
  for (const z of zones) {
    const members = list.filter((a) => !a.isLead && a.team === z.key);
    out.push({ title: z.emoji + " " + z.label, members });
  }
  // TEAMS 에 없는 팀 키를 가진 사람이 있으면 빠뜨리지 않고 마지막에 모은다.
  const known = new Set(zones.map((z) => z.key));
  const rest = list.filter((a) => !a.isLead && !known.has(a.team));
  if (rest.length) out.push({ title: "🗂 기타", members: rest });
  return out;
}

/** 사무실 전체를 다시 그린다. root 안을 비우고 구역들을 넣는다. */
function renderOffice(root, office, list, zones, opts) {
  const o = opts || {};
  const scale = o.scale || 4;
  const width = root.clientWidth || 640;
  root.textContent = "";
  office.clear();

  for (const g of groupByZone(list, zones)) {
    root.append(buildZone(office, g.title, g.members.length, g.members,
                          scale, width, o.onSelect || (() => {}), o.selectedId));
  }
}

/** 상단 요약 숫자. 실제로 존재하는 상태만 센다. */
function summarize(list) {
  const n = (s) => list.filter((a) => a.status === s).length;
  return {
    total: list.length,
    working: n("working"),
    idle: n("idle"),
    halted: n("halted"),
    offline: n("offline"),
    online: list.length - n("offline"),
  };
}
