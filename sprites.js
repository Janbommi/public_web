/* 픽셀 사무실 — 팀원을 책상에 앉혀 그린다. 현황판(public.html)이 쓴다.
 *
 * 아이디어는 zep-ia/pixel-agent-desk 에서 가져왔다 (에이전트를 사무실 책상에
 * 앉히고, 일하는 중이면 캐릭터가 움직인다). 그쪽 그림 파일은 재배포 금지
 * 라이선스라 쓰지 않았다 — 도트는 전부 여기서 직접 찍었다.
 *
 * 설계: 장면을 **층으로 겹쳐 그린다.**
 *   의자 → 사람 → 책상 → 모니터 → 화면 → 키보드 → 손 → 컵 → 김
 *   사람(머리+몸)과 가구를 따로 두니, 책상을 고쳐도 사람 그림은 건드리지 않는다.
 *   책상이 14행부터라 다리·신발은 자연히 가려진다 (앉은 것처럼 보인다).
 *
 * 장면 격자는 32x22. 사람은 16x18 이고 (9,0) 에 찍힌다.
 * 문자 하나가 픽셀 하나다.
 *   사람 — .  투명    H 머리카락  S 피부   s 감은 눈(피부 음영)  E 눈
 *          M  입      G 안경테    C 옷(밝은)  D 옷(어두운)  T 포인트
 *          P  바지    B 신발      A 모자
 *   가구 — t 상판   d 상판 두께·서랍 선   w 앞판   h 서랍 손잡이
 *          m 베젤   e 화면        n 스탠드  k 키보드  j 키보드 그늘
 *          q 컵     u 컵 테두리   l 음료    c 의자
 */

const SCENE_W = 32;
const SCENE_H = 22;
const PERSON_X = 9;         // 사람이 앉는 자리. 칸 중앙(15.5열)에 거의 맞춘다.
const DESK_Y = 14;          // 이 행부터 책상. 사람의 하반신을 가린다.

/* --- 사람 ---------------------------------------------------------------- */

// 몸통 — 전원 공통. 어깨 -> 팔 -> 다리 -> 신발. 6행부터는 책상에 가려진다.
const BODY = [
  ".....CCCCCC.....",
  "....CCCCCCCC....",
  "..SCCCCCCCCCCS..",
  "..SCCCCTTCCCCS..",
  "..SCCCCTTCCCCS..",
  "...CCCCTTCCCC...",
  "....PPP..PPP....",
  "....PPP..PPP....",
  "....BBB..BBB....",
];

// 머리 — 캐릭터를 구분하는 부분. 눈·입이 여기 들어 있다.
const HEADS = {
  // 단정하게 넘긴 머리 (팀장)
  neat: [
    "....HHHHHHHH....",
    "..HHHHHHHHHHHH..",
    ".HHHHHHHHHHHHHH.",
    ".HHSSSSSSSSSSHH.",
    ".HSSEESSSSEESSH.",
    "..SSSSSSSSSSSS..",
    "..SSSSSMMSSSSS..",
    "...SSSSSSSSSS...",
    ".....SSSSSS.....",
  ],
  // 안경
  glasses: [
    "....HHHHHHHH....",
    "..HHHHHHHHHHHH..",
    ".HHHHHHHHHHHHHH.",
    ".HHSSSSSSSSSSHH.",
    ".HSGGGSSSSGGGSH.",
    "..SGEGSSSSGEGS..",
    "..SSSSSMMSSSSS..",
    "...SSSSSSSSSS...",
    ".....SSSSSS.....",
  ],
  // 한쪽으로 묶은 머리
  pony: [
    "....HHHHHHHH....",
    "..HHHHHHHHHHHH..",
    ".HHHHHHHHHHHHHHH",
    ".HHSSSSSSSSSSHHH",
    ".HSSEESSSSEESSHH",
    "..SSSSSSSSSSSSHH",
    "..SSSSSMMSSSSS.H",
    "...SSSSSSSSSS...",
    ".....SSSSSS.....",
  ],
  // 캡 모자
  cap: [
    "..AAAAAAAAAAAA..",
    ".AAAAAAAAAAAAAA.",
    "AAAAAAAAAAAAAAAA",
    ".HHSSSSSSSSSSHH.",
    ".HSSEESSSSEESSH.",
    "..SSSSSSSSSSSS..",
    "..SSSSSMMSSSSS..",
    "...SSSSSSSSSS...",
    ".....SSSSSS.....",
  ],
  // 후드를 쓴 머리
  hood: [
    "...HHHHHHHHHH...",
    "..HHHHHHHHHHHH..",
    ".HHHHHHHHHHHHHH.",
    ".HHSSSSSSSSSSHH.",
    ".HSSEESSSSEESSH.",
    ".HSSSSSSSSSSSSH.",
    ".HSSSSSMMSSSSSH.",
    "..HSSSSSSSSSSH..",
    ".....SSSSSS.....",
  ],
  // 단발
  bob: [
    "....HHHHHHHH....",
    "..HHHHHHHHHHHH..",
    ".HHHHHHHHHHHHHH.",
    ".HHSSSSSSSSSSHH.",
    ".HHSEESSSSEESHH.",
    ".HHSSSSSSSSSSHH.",
    ".HHSSSSMMSSSSHH.",
    ".HHSSSSSSSSSSHH.",
    ".....SSSSSS.....",
  ],
  // 정수리에 묶은 머리
  bun: [
    "......HHHH......",
    "...HHHHHHHHHH...",
    "..HHHHHHHHHHHH..",
    ".HHSSSSSSSSSSHH.",
    ".HSSEESSSSEESSH.",
    "..SSSSSSSSSSSS..",
    "..SSSSSMMSSSSS..",
    "...SSSSSSSSSS...",
    ".....SSSSSS.....",
  ],
  // 곱슬 — 정수리가 가장 크다
  curly: [
    "...HHHHHHHHHH...",
    ".HHHHHHHHHHHHHH.",
    "HHHHHHHHHHHHHHHH",
    "HHHSSSSSSSSSSHHH",
    ".HSSEESSSSEESSH.",
    "..SSSSSSSSSSSS..",
    "..SSSSSMMSSSSS..",
    "...SSSSSSSSSS...",
    ".....SSSSSS.....",
  ],
  // 짧은 머리 — 이마가 넓게 보인다
  short: [
    ".....HHHHHH.....",
    "...HHHHHHHHHH...",
    "..HHHHHHHHHHHH..",
    "..HSSSSSSSSSSH..",
    "..SSEESSSSEESS..",
    "..SSSSSSSSSSSS..",
    "..SSSSSMMSSSSS..",
    "...SSSSSSSSSS...",
    ".....SSSSSS.....",
  ],
  // 부드러운 웨이브
  soft: [
    "....HHHHHHHH....",
    "..HHHHHHHHHHHH..",
    ".HHHHHHHHHHHHHH.",
    "HHHSSSSSSSSSSHHH",
    "HHSSEESSSSEESSHH",
    "HHSSSSSSSSSSSSHH",
    ".HSSSSSMMSSSSSH.",
    "..SSSSSSSSSSSS..",
    ".....SSSSSS.....",
  ],
};

/* 겉모습은 **키에서 자동으로 만든다.**
 *
 * 처음엔 팀원별로 손으로 지정했는데, 팀이 늘고 이름이 바뀌면서 (도담 -> 째미1,
 * 째미2 추가 · 09-18) 지정해 둔 것이 바로 어긋났다. 페르소나는 데이터라
 * 언제든 늘어나므로, 키를 해시해서 머리 스타일과 색을 고른다.
 *   - 같은 키는 언제나 같은 모습이다 (해시가 결정적이라 새로고침해도 안 바뀐다)
 *   - 새 팀원은 아무 작업 없이 자기 모습을 갖는다
 * 특정 팀원에게 정해진 모습을 주고 싶으면 PINNED 에만 한 줄 추가한다.
 */

const HEAD_ORDER = ["neat", "glasses", "pony", "cap", "hood", "bob", "bun", "curly", "short", "soft"];
// 처음엔 여덟 색이 전부 검정~짙은 갈색이어서, 머리 모양이 달라도 화면에서는
// 다섯 명이 같은 사람처럼 보였다 (09-18 실측). 밝은 쪽과 색조를 섞어 넓혔다.
const HAIRS  = [
  "#38303A", "#5A4134", "#8C5A3C", "#B08442", "#6B3A2E",
  "#7A3B4E", "#3A4F6B", "#5B4A7A", "#2B2B33", "#9A8F98",
];
const CLOTHS = [
  ["#4E7C9B", "#3C6280"], ["#C45B6B", "#A3475A"], ["#6E8C5A", "#57713F"],
  ["#D2764A", "#B25C36"], ["#5C6B8A", "#47536E"], ["#D9A0AE", "#BE8694"],
  ["#7C6A9C", "#63527F"], ["#4C8C82", "#3A6E66"],
];
const POINTS = ["#B5446E", "#F2D06B", "#E8E3DC", "#7FD4C1", "#F2C45B", "#F5E6D8", "#9BD4E8", "#D9C27A"];

// 손으로 정해 두는 예외. 팀장은 팀 밖이라 정장 느낌을 고정한다.
const PINNED = {
  kevin: { head: "neat", H: "#38303A", C: "#39465E", D: "#2A3448", T: "#B5446E" },
};

/** FNV-1a. 짧은 키에도 잘 흩어지고, 어느 브라우저에서나 같은 값이 나온다. */
function hashKey(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function lookFor(key) {
  if (PINNED[key]) return PINNED[key];
  if (ASSIGNED[key]) return ASSIGNED[key];
  const k = key || "?";
  // 속성마다 다른 접미사로 다시 해시한다. 한 해시의 비트를 쪼개 쓰면 팔레트가
  // 작아서(7~8개) 값이 몇 군데로 몰린다 — 실제로 포인트색이 8명 중 5명 겹쳤다.
  const cloth = CLOTHS[hashKey(k + "~cloth") % CLOTHS.length];
  return {
    head: HEAD_ORDER[hashKey(k + "~head") % HEAD_ORDER.length],
    H: HAIRS[hashKey(k + "~hair") % HAIRS.length],
    C: cloth[0],
    D: cloth[1],
    T: POINTS[hashKey(k + "~point") % POINTS.length],
    A: HAIRS[hashKey(k + "~cap") % HAIRS.length],   // 모자 색 (cap 일 때만 쓰인다)
  };
}

/* 해시만 쓰면 팔레트가 작아서 겹친다 — 실제로 8명 중 3명이 같은 안경 머리가
 * 나왔다. 그래서 명단 전체를 한 번에 받아 **겹치는 것만 옆으로 밀어** 준다.
 * 해시가 고른 값이 비어 있으면 그대로 쓰니, 명단이 그대로면 모습도 그대로다.
 * 팔레트를 다 쓰면(머리 10종, 포인트 8색) 사용 표를 비워 다음 바퀴를 돈다.
 */
const ASSIGNED = {};

function assignLooks(keys) {
  for (const k of Object.keys(ASSIGNED)) delete ASSIGNED[k];

  const used = { head: new Set(), hair: new Set(), cloth: new Set(), point: new Set() };
  // 고정된 모습도 자리를 차지한다 — 팀장의 단정한 머리를 남이 또 쓰면 안 된다.
  for (const k of keys) {
    const p = PINNED[k];
    if (!p) continue;
    used.head.add(p.head);
    used.hair.add(p.H);
    used.cloth.add(p.C);
    used.point.add(p.T);
  }

  /** want 가 이미 쓰였으면 목록을 한 칸씩 밀며 빈 것을 찾는다. */
  const pick = (list, want, seen) => {
    if (seen.size >= list.length) seen.clear();
    const start = Math.max(0, list.indexOf(want));
    for (let i = 0; i < list.length; i++) {
      const v = list[(start + i) % list.length];
      if (!seen.has(v)) { seen.add(v); return v; }
    }
    return want;
  };

  const clothHeads = CLOTHS.map((c) => c[0]);   // 옷은 밝은 색으로 구분한다

  for (const key of keys) {
    if (PINNED[key]) continue;
    const base = lookFor(key);        // 해시가 고른 원래 모습
    const cloth = CLOTHS[clothHeads.indexOf(pick(clothHeads, base.C, used.cloth))];
    ASSIGNED[key] = Object.assign({}, base, {
      head: pick(HEAD_ORDER, base.head, used.head),
      H: pick(HAIRS, base.H, used.hair),
      C: cloth[0],
      D: cloth[1],
      T: pick(POINTS, base.T, used.point),
    });
  }
  return ASSIGNED;
}

const SKIN = "#F2C6A0";
const SKIN_SHADE = "#DCA983";
const EYE = "#2A2230";
const MOUTH = "#B5697A";
const GLASS = "#4A4450";

/** 사람 한 명의 16x18 문자 격자. blink 면 눈을 감는다. */
function personGrid(key, blink) {
  const look = lookFor(key);
  const head = HEADS[look.head] || HEADS.neat;
  const rows = head.concat(BODY);
  // 눈 감기: E 를 피부 음영(s)으로 바꾼다.
  return { rows: blink ? rows.map((r) => r.replace(/E/g, "s")) : rows, look };
}

/* --- 가구 ---------------------------------------------------------------- */

// 의자 등받이. 사람보다 먼저 그려서 어깨 뒤로 삐죽 보이게 한다. (PERSON_X, 9)
const CHAIR = [
  "..cccccccccccc..",
  ".cccccccccccccc.",
  "cc............cc",
  "cc............cc",
  "cc............cc",
];

// 책상. 장면 전체 폭이라 책상끼리 붙으면 한 줄로 이어진 카운터처럼 보인다. (0, 14)
const DESK = [
  "tttttttttttttttttttttttttttttttt",
  "dddddddddddddddddddddddddddddddd",
  "wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww",
  "wwwdddddddddddddwwwwwwwwwwwwwwww",
  "wwwd...........dwwwwwwwwwwwwwwww",
  "wwwd...hhhhh...dwwwwwwwwwwwwwwww",
  "wwwdddddddddddddwwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww",
];

// 모니터. 스탠드 밑면이 상판(14행)에 닿는다. 사람과 겹치지 않게 9칸이다. (0, 6)
const MONITOR = [
  "mmmmmmmmm",
  "meeeeeeem",
  "meeeeeeem",
  "meeeeeeem",
  "meeeeeeem",
  "meeeeeeem",
  "mmmmmmmmm",
  "....n....",
  "..nnnnn..",
];
// 화면 안쪽 (장면 기준 절대 좌표). 여기에 '코드 줄'이 흐른다.
const SCREEN_X = 1;
const SCREEN_Y = 7;
const SCREEN_W = 7;
const SCREEN_H = 5;

// 키보드. 상판 앞줄을 덮어 책상 위에 얹힌 것처럼 보이게 한다. (12, 13)
const KEYBOARD = ["kkkkkkkkkk", "jjjjjjjjjj"];
const HAND_Y = 12;                  // 손은 키보드 바로 위. 누를 때 한 행 내려간다.
const HAND_X = [13, 19];

// 머그컵. 밑면이 상판에 닿는다. (26, 11)
const MUG = [
  ".lll.",
  "uqqqu",
  "uqqqu",
  ".uuu.",
];
const MUG_X = 26;
const STEAM_X = 27;                 // 김이 오르는 열

/* 가구 색은 테마를 따라간다. 캔버스는 CSS 변수를 모르니 여기에 두 벌을 둔다.
 * (사람 색은 팔레트가 고정이다 — 피부·머리색이 테마를 따라 바뀌면 사람이 달라 보인다.) */
const ROOM_LIGHT = {
  t: "#E3BC92", d: "#A97B50", w: "#C99A6B", h: "#8A6340",
  m: "#5C5566", n: "#7A6E7C",
  k: "#DAD4DC", j: "#A79BA5",
  q: "#F7F1EA", u: "#A79399", l: "#B5446E",
  c: "#7A6E7C",
  screenOff: "#3A3446", screenOn: "#1C2B33",
  code: "#6FD3B8", codeDim: "#3E6C63", cursor: "#6FD3B8",
  steam: "rgba(122,110,124,.38)",
  shadow: "rgba(36, 30, 43, .14)",
};
const ROOM_DARK = {
  t: "#8A6A4C", d: "#4E3A2A", w: "#6E5340", h: "#38291D",
  m: "#241E29", n: "#4A4350",
  k: "#58505E", j: "#3A3440",
  q: "#D6CEDA", u: "#6E6478", l: "#E8869F",
  c: "#4A4350",
  screenOff: "#14121A", screenOn: "#10201F",
  code: "#7FD4C1", codeDim: "#35625A", cursor: "#7FD4C1",
  steam: "rgba(200,190,205,.30)",
  shadow: "rgba(0, 0, 0, .35)",
};

function isDark() {
  const t = document.documentElement.getAttribute("data-theme");
  if (t === "dark") return true;
  if (t === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function roomPalette() { return isDark() ? ROOM_DARK : ROOM_LIGHT; }

/* --- 화면에 흐르는 코드 줄 ------------------------------------------------ */

/** 키마다 다른 무늬가 나오는 줄 길이 목록. 화면이 사람마다 달라 보인다. */
function codeLines(key) {
  let h = hashKey((key || "?") + "~code");
  const out = [];
  for (let i = 0; i < 24; i++) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    out.push(2 + ((h >>> 9) % (SCREEN_W - 1)));   // 2 ~ 8칸
  }
  return out;
}

/* --- 그리기 -------------------------------------------------------------- */

function personColor(ch, look) {
  switch (ch) {
    case "H": return look.H;
    case "S": return SKIN;
    case "s": return SKIN_SHADE;
    case "E": return EYE;
    case "M": return MOUTH;
    case "G": return GLASS;
    case "C": return look.C;
    case "D": return look.D;
    case "T": return look.T;
    case "P": return look.D;
    case "B": return "#2E2833";
    case "A": return look.A || look.C;
    default:  return null;
  }
}

/** 문자 격자 하나를 (ox, oy) 에 찍는다. 장면 밖으로 나가는 픽셀은 버린다. */
function stamp(ctx, rows, ox, oy, scale, colorOf) {
  for (let y = 0; y < rows.length; y++) {
    const gy = oy + y;
    if (gy < 0 || gy >= SCENE_H) continue;
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const gx = ox + x;
      if (gx < 0 || gx >= SCENE_W) continue;
      const c = colorOf(row[x]);
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(gx * scale, gy * scale, scale, scale);
    }
  }
}

/** 책상 한 자리를 캔버스에 그린다.
 *
 *  opts: scale, mode('work'|'idle'|'off'), lift, blink, press[2], code, steam, cursor
 */
function paintDesk(canvas, key, opts) {
  const o = opts || {};
  const scale = o.scale || 4;
  const mode = o.mode || "idle";
  const pal = o.palette || roomPalette();
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = SCENE_W * scale;
  const h = SCENE_H * scale;

  if (canvas.width !== Math.round(w * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);

  const room = (ch) => pal[ch] || null;

  // 1. 의자 — 사람 뒤
  stamp(ctx, CHAIR, PERSON_X, 9, scale, room);

  // 2. 사람 — 숨쉬기로 한 픽셀 떴다 가라앉는다
  const { rows, look } = personGrid(key, o.blink);
  stamp(ctx, rows, PERSON_X, -(o.lift || 0), scale, (ch) => personColor(ch, look));

  // 3. 책상 — 하반신을 가린다
  stamp(ctx, DESK, 0, DESK_Y, scale, room);

  // 4. 모니터와 화면
  stamp(ctx, MONITOR, 0, 6, scale, room);
  ctx.fillStyle = mode === "work" ? pal.screenOn : pal.screenOff;
  ctx.fillRect(SCREEN_X * scale, SCREEN_Y * scale, SCREEN_W * scale, SCREEN_H * scale);

  if (mode === "work" && o.code >= 0) {
    // 코드 줄이 위로 흐른다. 맨 아래 줄은 '지금 쓰는 줄' 이라 밝게 둔다.
    const lines = codeLines(key);
    for (let r = 0; r < SCREEN_H; r++) {
      const len = lines[(o.code + r) % lines.length];
      ctx.fillStyle = r === SCREEN_H - 1 ? pal.code : pal.codeDim;
      ctx.fillRect(SCREEN_X * scale, (SCREEN_Y + r) * scale, len * scale, scale);
    }
  } else if (mode === "idle" && o.cursor) {
    // 절전 화면에 커서만 깜빡인다
    ctx.fillStyle = pal.codeDim;
    ctx.fillRect(SCREEN_X * scale, SCREEN_Y * scale, scale, scale);
  }

  // 5. 키보드와 손
  stamp(ctx, KEYBOARD, 12, 13, scale, room);
  const press = o.press || [0, 0];
  for (let i = 0; i < 2; i++) {
    ctx.fillStyle = SKIN;
    ctx.fillRect(HAND_X[i] * scale, (HAND_Y + press[i]) * scale, 2 * scale, scale);
  }

  // 6. 컵과 김
  stamp(ctx, MUG, MUG_X, 11, scale, room);
  if (mode !== "off" && o.steam >= 0) {
    ctx.fillStyle = pal.steam;
    // 세 칸을 돌며 한 픽셀씩 올라간다. 오른쪽으로 살짝 흔들린다.
    const y = 10 - o.steam;
    const x = STEAM_X + (o.steam === 1 ? 1 : 0);
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }
}

/* --- 사무실 전체를 한 루프로 움직인다 ------------------------------------- */

const TICK_MS = 125;        // 초당 8칸. 타이핑·화면·김이 이 박자로 움직인다.

/** 사무실. 책상을 등록하면 한 개의 requestAnimationFrame 루프가 전부 돌린다.
 *
 *  등록: office.add(canvas, key, { scale, mode })
 *    mode 'work' 일하는 중 — 타이핑, 화면에 코드, 숨이 빠르다
 *         'idle' 조용함     — 화면 절전, 손은 키보드에 올려둠
 *         'off'  정지       — 화면 꺼짐, 김도 안 난다
 *  prefers-reduced-motion 이면 한 번만 그리고 멈춘다.
 */
function createOffice(opts) {
  const conf = opts || {};
  // room: "light" | "dark" 를 주면 테마를 따라가지 않고 그 팔레트로 고정한다.
  // 로컬 대시보드는 앱 프레임이 어두워도 사무실 안은 밝은 원목이다 (콘셉트 참고).
  const fixed = conf.room === "light" ? ROOM_LIGHT : conf.room === "dark" ? ROOM_DARK : null;
  const items = [];
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let running = false;
  let pal = fixed || roomPalette();

  function repaintAll() {
    for (const it of items) {
      it.sig = null;
      if (still) paintDesk(it.canvas, it.key, { scale: it.scale, mode: it.mode, palette: pal, code: 0, steam: -1 });
    }
  }

  // 테마가 바뀌면 가구 색을 다시 읽는다 (OS 설정, 그리고 data-theme 토글 둘 다).
  if (!fixed) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      pal = roomPalette();
      repaintAll();
    });
    new MutationObserver(() => {
      pal = roomPalette();
      repaintAll();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }

  function add(canvas, key, opts) {
    const o = opts || {};
    const item = {
      canvas, key,
      scale: o.scale || 4,
      mode: o.mode || "idle",
      phase: Math.random() * Math.PI * 2,       // 서로 다른 박자로 숨쉬게
      offset: Math.floor(Math.random() * 8),    // 타이핑·화면도 서로 엇나가게
      nextBlink: 1200 + Math.random() * 4000,
      blinkUntil: 0,
      sig: null,
    };
    items.push(item);
    if (still) {
      paintDesk(canvas, key, { scale: item.scale, mode: item.mode, palette: pal, code: 0, steam: -1 });
    } else if (!running) {
      running = true;
      requestAnimationFrame(tick);
    }
    return item;
  }

  function tick(now) {
    const step = Math.floor(now / TICK_MS);
    for (const it of items) {
      const work = it.mode === "work";
      const off = it.mode === "off";

      // 숨쉬기 — 일하는 중이면 빠르다
      const period = off ? 2600 : work ? 560 : 1500;
      const lift = Math.sin(now / period + it.phase) > 0.55 ? 1 : 0;

      if (now > it.nextBlink) {
        it.blinkUntil = now + 110;
        it.nextBlink = now + 2200 + Math.random() * 4800;
      }
      const blink = now < it.blinkUntil;

      // 타이핑 — 두 손이 번갈아 내려간다
      const s = step + it.offset;
      const press = work ? [s % 2, (s + 1) % 2] : [1, 1];
      const code = work ? Math.floor(s / 2) : -1;          // 250ms 마다 한 줄
      const steam = off ? -1 : Math.floor(s / 5) % 3;      // 625ms 마다 한 칸
      const cursor = work ? 0 : Math.floor(s / 6) % 2;

      const sig = lift + "|" + (blink ? 1 : 0) + "|" + press[0] + "|" + code + "|" + steam + "|" + cursor;
      if (sig !== it.sig) {
        it.sig = sig;
        paintDesk(it.canvas, it.key, {
          scale: it.scale, mode: it.mode, palette: pal,
          lift, blink, press, code, steam, cursor,
        });
      }
    }
    requestAnimationFrame(tick);
  }

  function clear() { items.length = 0; }

  // palette() 를 내주는 이유: 페이지가 캔버스 밖 좌우로 책상 띠를 CSS 로 이어
  // 그린다. 색을 두 곳에 적어 두면 어긋나므로 여기 한 벌만 둔다.
  return { add, clear, sceneW: SCENE_W, sceneH: SCENE_H, deskRows: 8, palette: () => pal };
}
