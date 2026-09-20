/* 픽셀 사무실 — 3/4 로 내려다보는 시점의 캐릭터와 가구. 현황판이 쓴다.
 *
 * 아이디어는 zep-ia/pixel-agent-desk 에서 가져왔다. 그쪽 그림 파일은 재배포 금지
 * 라이선스라 쓰지 않았다 — 도트는 전부 여기서 직접 찍는다.
 *
 * 왜 3/4 시점인가:
 *   정면·측면 한 면만 그리면 종이처럼 납작해 보인다. 가구마다 **윗면과 앞면을
 *   같이** 그리고 바닥에 그림자를 깔면, 같은 도트인데 방 안에 놓인 물건이 된다.
 *   벽도 앞면(보이는 벽지) 위에 윗면(벽 두께)을 얹는다.
 *
 * 왜 캐릭터를 문자 격자로 안 찍고 코드로 그리나:
 *   방향이 넷(앞·뒤·옆)에 걸음 4 컷이라, 머리 모양 10 종을 손으로 찍으면
 *   격자만 120 장이 된다. 그래서 **두개골 윤곽은 공통**으로 두고 머리카락을
 *   속성(윗머리 높이·옆머리 길이·앞머리·장식)으로 씌운다. 팀원이 늘어도
 *   그림 파일을 늘리지 않는다.
 *
 * 좌표: 캐릭터 한 장은 16x22. 발바닥이 21행이다 (바닥에 닿는 줄).
 *   0~1   머리 장식이 삐져나오는 자리 (만두머리, 곱슬 정수리, 모자)
 *   2~12  머리 (11줄) — 전체의 절반. 치비 비율이다
 *   13~18 상체
 *   19~21 다리와 신발
 */

const CW = 16, CH = 22;
const FOOT_Y = 21;              // 발이 바닥에 닿는 줄. 깊이 정렬의 기준이다.

/* 두개골 가로 범위. 이 윤곽 위에 피부를 채우고 머리카락을 덮는다. */
const SKULL = {
  2: [4, 11], 3: [3, 12], 4: [2, 13], 5: [2, 13], 6: [2, 13], 7: [2, 13],
  8: [2, 13], 9: [2, 13], 10: [2, 13], 11: [3, 12], 12: [4, 11],
};
const EYE_Y = 7, MOUTH_Y = 10, BANG_Y = 5;

/* --- 픽셀 버퍼 ------------------------------------------------------------ */

function newBuf() { return new Array(CW * CH).fill(null); }

/* 걸음 중간 컷에서 **머리만** 한 칸 들린다. 다리만 바꿔서는 16px 짜리 그림에서
 * 걷는지 서 있는지 구별이 안 됐다. 머리(12행 이하)에만 적용하고, 빈 목은
 * drawBody 가 따로 채운다. */
let HEAD_LIFT = 0;

function setPx(b, x, y, c) {
  const yy = y <= 12 ? y - HEAD_LIFT : y;
  if (c && x >= 0 && x < CW && yy >= 0 && yy < CH) b[yy * CW + x] = c;
}
/** 들림을 무시하고 그 자리에 찍는다. 목처럼 몸에 붙어 있어야 하는 것에 쓴다. */
function setPxRaw(b, x, y, c) {
  if (c && x >= 0 && x < CW && y >= 0 && y < CH) b[y * CW + x] = c;
}
function hLine(b, x0, x1, y, c) { for (let x = x0; x <= x1; x++) setPx(b, x, y, c); }
function vLine(b, x, y0, y1, c) { for (let y = y0; y <= y1; y++) setPx(b, x, y, c); }
function boxFill(b, x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) hLine(b, x0, x1, y, c); }

/* --- 겉모습 --------------------------------------------------------------- */

/* 머리 모양은 격자가 아니라 속성이다.
 *   top   정수리가 두개골 위로 몇 줄 솟는가
 *   side  옆머리가 어디까지 내려오는가 (턱 아래로 내려가면 단발·장발이 된다)
 *   bang  앞머리 — full 일자 / split 가운데 가르마 / swept 한쪽으로 넘김
 *   extra 장식 — glasses bun pony cap hood curl
 */
const STYLES = {
  neat:    { top: 0, side: 2,  bang: "swept", extra: null },
  glasses: { top: 0, side: 3,  bang: "full",  extra: "glasses" },
  pony:    { top: 0, side: 4,  bang: "split", extra: "pony" },
  cap:     { top: 1, side: 2,  bang: "full",  extra: "cap" },
  hood:    { top: 1, side: 6,  bang: "full",  extra: "hood" },
  bob:     { top: 0, side: 9,  bang: "full",  extra: null },
  bun:     { top: 0, side: 2,  bang: "split", extra: "bun" },
  curly:   { top: 2, side: 5,  bang: "full",  extra: "curl" },
  short:   { top: 0, side: 1,  bang: "swept", extra: null },
  longer:  { top: 0, side: 12, bang: "split", extra: null },
};
const HEAD_ORDER = Object.keys(STYLES);

/* 머리색. 처음에 여덟 색이 전부 검정~짙은 갈색이라 머리 모양이 달라도 다섯 명이
 * 같은 사람처럼 보였다 (09-18 실측). 밝은 쪽과 색조를 섞어 넓혀 둔다. */
const HAIRS = [
  "#3A3038", "#5C4234", "#8E5C3E", "#B48646", "#6D3C30",
  "#7C3D50", "#3C516D", "#5D4C7C", "#2C2C34", "#9C919A",
];
const CLOTHS = [
  ["#5182A2", "#3E6A88"], ["#C9606F", "#A64B5E"], ["#72915E", "#5A7543"],
  ["#D67C4E", "#B5603A"], ["#606F8E", "#4A5672"], ["#DDA4B2", "#C18A98"],
  ["#806EA0", "#665583"], ["#4F9086", "#3D726A"],
];
const POINTS = ["#F2D06B", "#E8E3DC", "#7FD4C1", "#F5E6D8", "#9BD4E8", "#D9C27A", "#F0A9B8", "#C7E39B"];
// 피부는 세 톤. 사람이 다 같은 색이면 도시 하나에 한 가족만 사는 그림이 된다.
const SKINS = [
  ["#F7D3B2", "#E0B08C"],
  ["#EBB88C", "#CF9469"],
  ["#C98E63", "#A97049"],
];

const EYE_DARK = "#2B2432";
const EYE_LIGHT = "#FFFFFF";
const MOUTH_C = "#B9616C";
const BLUSH = "#EFA79E";
const GLASS_C = "#4C4654";
const SHOE = "#2A2430";

// 손으로 정해 두는 예외. 팀장은 팀 밖이라 정장 느낌을 고정한다.
const PINNED = {
  kevin: { head: "neat", H: "#3A3038", C: "#3B4860", D: "#2C3649", T: "#D9C27A", skin: 0 },
  hyeonju: { head: "bob", H: "#50382E", C: "#92A482", D: "#667C60", T: "#F7ECDC", skin: 0, brooch: true },
  ssabu: { head: "short", H: "#443534", C: "#D7AF73", D: "#AF8255", T: "#FFF0D4", skin: 0 },
};

/** #rrggbb 를 한 단계 어둡게. 같은 머리색의 그늘을 따로 적어 두지 않으려고 쓴다. */
function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.round(v * 0.72));
  return "#" + [f(n >> 16 & 255), f(n >> 8 & 255), f(n & 255)]
    .map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** FNV-1a. 짧은 키에도 잘 흩어지고, 어느 브라우저에서나 같은 값이 나온다. */
function hashKey(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* 겉모습은 키에서 자동으로 만든다. 팀이 늘고 이름이 바뀌면 (도담 -> 째미1·째미2,
 * 09-18) 손으로 지정해 둔 것이 바로 어긋나기 때문이다. 같은 키는 언제나 같은
 * 모습이고, 새 팀원은 아무 작업 없이 자기 모습을 갖는다. */
const ASSIGNED = {};

function lookFor(key) {
  const raw = PINNED[key] || ASSIGNED[key] || null;
  const k = key || "?";
  const cloth = CLOTHS[hashKey(k + "~cloth") % CLOTHS.length];
  const base = {
    head: HEAD_ORDER[hashKey(k + "~head") % HEAD_ORDER.length],
    H: HAIRS[hashKey(k + "~hair") % HAIRS.length],
    C: cloth[0],
    D: cloth[1],
    T: POINTS[hashKey(k + "~point") % POINTS.length],
    skin: hashKey(k + "~skin") % SKINS.length,
  };
  const look = raw ? Object.assign({}, base, raw) : base;
  const sk = SKINS[look.skin % SKINS.length];
  look.S = sk[0];
  look.s = sk[1];
  look.P = look.D;
  look.A = look.A || HAIRS[hashKey(k + "~cap") % HAIRS.length];
  look.style = STYLES[look.head] || STYLES.neat;
  return look;
}

/* 해시만 쓰면 팔레트가 작아서 겹친다 — 실제로 8명 중 3명이 같은 안경 머리가
 * 나왔다. 그래서 명단 전체를 한 번에 받아 **겹치는 것만 옆으로 밀어** 준다.
 * 해시가 고른 값이 비어 있으면 그대로 쓰니, 명단이 그대로면 모습도 그대로다. */
function assignLooks(keys) {
  for (const k of Object.keys(ASSIGNED)) delete ASSIGNED[k];
  charCache.clear();

  const used = { head: new Set(), hair: new Set(), cloth: new Set(), point: new Set() };
  for (const k of keys) {                 // 고정된 모습도 자리를 차지한다
    const p = PINNED[k];
    if (!p) continue;
    used.head.add(p.head); used.hair.add(p.H); used.cloth.add(p.C); used.point.add(p.T);
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
  const clothHeads = CLOTHS.map((c) => c[0]);

  for (const key of keys) {
    if (PINNED[key]) continue;
    const base = lookFor(key);
    const cloth = CLOTHS[clothHeads.indexOf(pick(clothHeads, base.C, used.cloth))];
    ASSIGNED[key] = {
      head: pick(HEAD_ORDER, base.head, used.head),
      H: pick(HAIRS, base.H, used.hair),
      C: cloth[0], D: cloth[1],
      T: pick(POINTS, base.T, used.point),
      skin: base.skin,
    };
  }
  return ASSIGNED;
}

/* --- 얼굴 ----------------------------------------------------------------- */

/** 두개골을 피부로 채운다. 옆모습은 한 칸 앞으로 밀어 코가 붙을 자리를 만든다. */
function fillSkull(b, L, dir) {
  const shift = dir === "side" ? 1 : 0;
  for (let x = 6; x <= 9; x++) { setPxRaw(b, x, 11, L.s); setPxRaw(b, x, 12, L.s); }
  for (const y in SKULL) {
    const s = SKULL[y];
    hLine(b, s[0] + shift, s[1] + shift, +y, dir === "up" ? L.H : L.S);
  }
  if (dir !== "up") hLine(b, 6, 9, 12, L.s);    // 턱 그늘
}

/** 앞얼굴 — 큰 눈 둘, 작은 입, 볼. 치비는 눈이 커야 산다. */
function faceFront(b, L, blink) {
  if (blink) {
    hLine(b, 4, 5, EYE_Y + 1, L.s);
    hLine(b, 10, 11, EYE_Y + 1, L.s);
  } else {
    boxFill(b, 4, EYE_Y, 5, EYE_Y + 1, EYE_DARK);
    boxFill(b, 10, EYE_Y, 11, EYE_Y + 1, EYE_DARK);
    setPx(b, 4, EYE_Y, EYE_LIGHT);              // 눈동자 반사. 이 한 점이 살아 있게 만든다
    setPx(b, 10, EYE_Y, EYE_LIGHT);
  }
  hLine(b, 7, 8, MOUTH_Y, MOUTH_C);
  setPx(b, 3, 9, BLUSH);
  setPx(b, 12, 9, BLUSH);
}

/** 옆얼굴 — 눈 하나, 코 한 점. 오른쪽을 본다 (왼쪽은 그릴 때 뒤집는다). */
function faceSide(b, L, blink) {
  if (blink) hLine(b, 9, 10, EYE_Y + 1, L.s);
  else {
    boxFill(b, 9, EYE_Y, 10, EYE_Y + 1, EYE_DARK);
    setPx(b, 9, EYE_Y, EYE_LIGHT);
  }
  setPx(b, 14, 8, L.S);                          // 코
  setPx(b, 14, 9, L.s);
  setPx(b, 11, MOUTH_Y, MOUTH_C);
  setPx(b, 12, 9, BLUSH);
  setPx(b, 6, 8, L.s);                           // 귀
  setPx(b, 6, 9, L.s);
}

/* --- 머리카락 ------------------------------------------------------------- */

/** 두개골 위에 머리카락을 씌운다. 방향마다 덮는 범위가 다르다. */
function drawHair(b, L, dir) {
  const st = L.style;
  const H = L.H;
  const shift = dir === "side" ? 1 : 0;
  const span = (y) => {
    const s = SKULL[y] || SKULL[12];
    return [s[0] + shift, s[1] + shift];
  };

  // 정수리가 솟는 만큼 두개골 위로 줄을 더 얹는다 (곱슬·모자)
  for (let i = 0; i < st.top; i++) hLine(b, 5, 10 + shift, 1 - i, H);

  // 머리 윗부분은 무조건 머리카락
  for (let y = 2; y <= 4; y++) { const sp = span(y); hLine(b, sp[0], sp[1], y, H); }

  // 앞머리
  const bg = span(BANG_Y);
  if (dir === "up" || st.bang === "full") hLine(b, bg[0], bg[1], BANG_Y, H);
  else if (st.bang === "split") { hLine(b, bg[0], bg[0] + 3, BANG_Y, H); hLine(b, bg[1] - 3, bg[1], BANG_Y, H); }
  else { hLine(b, bg[0], bg[0] + 6, BANG_Y, H); setPx(b, bg[1], BANG_Y, H); }

  // 옆머리 — 턱 아래로 내려가면 단발·장발이 된다
  const bottom = Math.min(CH - 4, 4 + st.side);
  for (let y = 5; y <= bottom; y++) {
    const sp = span(y);
    if (dir === "side") { setPx(b, sp[0], y, H); setPx(b, sp[0] + 1, y, H); }   // 옆모습은 뒤통수만
    else { setPx(b, sp[0], y, H); setPx(b, sp[1], y, H); }
  }
  if (dir === "up") {                              // 뒷모습은 얼굴이 없다
    for (let y = 5; y <= Math.max(bottom, 11); y++) { const sp = span(y); hLine(b, sp[0], sp[1], y, H); }
    // 통짜 덩어리로 보이지 않게 목덜미 쪽만 그늘을 준다
    const sh = shade(H);
    for (let y = Math.max(bottom, 11) - 1; y <= Math.max(bottom, 11); y++) {
      const sp = span(Math.min(y, 12));
      hLine(b, sp[0], sp[1], y, sh);
    }
    hLine(b, 6, 9, 12, L.s);                       // 목덜미
  }

  drawExtra(b, L, dir, H, span);
}

/** 장식 — 안경·묶은 머리·만두머리·모자·후드·곱슬. */
function drawExtra(b, L, dir, H, span) {
  const st = L.style;
  const shift = dir === "side" ? 1 : 0;
  if (st.extra === "glasses") {
    if (dir === "up") return;
    if (dir === "side") {
      hLine(b, 8, 12, EYE_Y - 1, GLASS_C);
      hLine(b, 8, 12, EYE_Y + 2, GLASS_C);
      vLine(b, 8, EYE_Y - 1, EYE_Y + 2, GLASS_C);
      vLine(b, 12, EYE_Y - 1, EYE_Y + 2, GLASS_C);
    } else {
      for (const x of [3, 9]) {
        hLine(b, x, x + 3, EYE_Y - 1, GLASS_C);
        hLine(b, x, x + 3, EYE_Y + 2, GLASS_C);
        vLine(b, x, EYE_Y - 1, EYE_Y + 2, GLASS_C);
        vLine(b, x + 3, EYE_Y - 1, EYE_Y + 2, GLASS_C);
      }
      hLine(b, 7, 8, EYE_Y, GLASS_C);              // 콧대
    }
  } else if (st.extra === "pony") {
    const x = dir === "side" ? 2 : 14;
    const inward = dir === "side" ? -1 : 1;
    vLine(b, x, 5, 13, H);
    vLine(b, x + inward, 7, 12, H);
    setPx(b, x, 14, L.T);                          // 머리끈이 포인트 색이다
  } else if (st.extra === "bun") {
    boxFill(b, 6 + shift, 0, 9 + shift, 1, H);
    hLine(b, 7 + shift, 8 + shift, 2, L.T);
  } else if (st.extra === "cap") {
    for (let y = 1; y <= 4; y++) { const sp = span(Math.max(y, 2)); hLine(b, sp[0], sp[1], y, L.A); }
    const sp = span(5);
    if (dir !== "up") hLine(b, sp[0] - 1, sp[1] + 1, 5, L.A);   // 챙
  } else if (st.extra === "hood") {
    for (let y = 5; y <= 14; y++) {
      const sp = span(Math.min(y, 12));
      setPx(b, sp[0] - 1, y, L.D);
      setPx(b, sp[1] + 1, y, L.D);
    }
    for (let y = 1; y <= 3; y++) { const sp = span(Math.max(y, 2)); hLine(b, sp[0] - 1, sp[1] + 1, y, L.D); }
  } else if (st.extra === "curl") {
    for (const y of [3, 6, 9]) {                   // 옆으로 한 점씩 삐져나온다
      const sp = span(y);
      setPx(b, sp[0] - 1, y, H);
      if (dir !== "side") setPx(b, sp[1] + 1, y, H);
    }
  }
}

/* --- 몸 ------------------------------------------------------------------- */

/** 상체와 다리. frame 0~3 이 걸음 네 컷이다 (0·2 는 두 발을 모은 자세). */
function drawBody(b, L, dir, frame, sitting) {
  const C = L.C, D = L.D;
  const back = dir === "up";

  hLine(b, 4, 11, 13, C);                          // 어깨
  boxFill(b, 4, 14, 11, 17, C);
  hLine(b, 5, 10, 18, D);
  if (!back) {
    hLine(b, 6, 9, 13, L.T);                       // 옷깃
    vLine(b, 7, 14, 16, D);                        // 앞섶
  }
  vLine(b, 4, 14, 17, D);                          // 소매 그늘
  vLine(b, 11, 14, 17, D);

  // 팔 — 걸을 때 앞뒤로 흔들린다
  const swing = frame === 1 ? 1 : frame === 3 ? -1 : 0;
  if (dir === "side") {
    const ax = 9 + (frame === 1 ? 2 : frame === 3 ? -2 : 0);
    boxFill(b, ax, 14, ax + 1, 16, D);
    boxFill(b, ax, 17, ax + 1, 17, L.S);           // 손
  } else if (sitting) {
    boxFill(b, 3, 15, 3, 18, D);                   // 앉으면 팔이 책상 쪽으로 간다
    boxFill(b, 12, 15, 12, 18, D);
  } else {
    boxFill(b, 3, 14 + swing, 3, 16 + swing, D);
    setPx(b, 3, 17 + swing, L.S);
    boxFill(b, 12, 14 - swing, 12, 16 - swing, D);
    setPx(b, 12, 17 - swing, L.S);
  }

  if (sitting) return;                             // 다리는 책상이 가린다

  if (dir === "side") {
    if (frame === 1) {
      boxFill(b, 9, 19, 11, 20, L.P); hLine(b, 9, 11, 21, SHOE);
      boxFill(b, 4, 19, 6, 20, L.P);  hLine(b, 4, 6, 21, SHOE);
    } else if (frame === 3) {
      boxFill(b, 5, 19, 7, 20, L.P);  hLine(b, 5, 7, 21, SHOE);
      boxFill(b, 8, 19, 10, 20, L.P); hLine(b, 8, 10, 21, SHOE);
    } else {
      boxFill(b, 5, 19, 6, 20, L.P);  hLine(b, 5, 6, 21, SHOE);
      boxFill(b, 8, 19, 9, 20, L.P);  hLine(b, 8, 9, 21, SHOE);
    }
  } else if (frame === 1) {
    boxFill(b, 4, 19, 6, 20, L.P);  hLine(b, 4, 6, 21, SHOE);        // 내디딘 발
    hLine(b, 9, 10, 19, L.P);       hLine(b, 9, 10, 20, SHOE);       // 든 발
  } else if (frame === 3) {
    boxFill(b, 9, 19, 11, 20, L.P); hLine(b, 9, 11, 21, SHOE);
    hLine(b, 5, 6, 19, L.P);        hLine(b, 5, 6, 20, SHOE);
  } else {
    boxFill(b, 5, 19, 6, 20, L.P);  hLine(b, 5, 6, 21, SHOE);
    boxFill(b, 9, 19, 10, 20, L.P); hLine(b, 9, 10, 21, SHOE);
  }
}

/* --- 캐릭터 한 장 --------------------------------------------------------- */

/* 프레임을 캐시한다. 8명 x 3방향 x 4컷 x (눈 뜸/감음) 이라도 200 장이 안 되고
 * 한 장이 16x22 라 메모리가 거의 안 든다. 매 프레임 픽셀을 다시 찍는 것보다
 * drawImage 한 번이 훨씬 싸다 — 폰에서 이 차이가 크다. */
const charCache = new Map();

function charSprite(key, dir, frame, blink, sitting) {
  // left·right 는 같은 옆모습 한 장을 쓰고 그릴 때 뒤집는다. 여기서 right 를
  // 빠뜨렸더니 오른쪽을 볼 때만 얼굴이 통째로 비었다.
  const face = (dir === "left" || dir === "right") ? "side" : dir;
  const id = key + "|" + face + "|" + frame + "|" + (blink ? 1 : 0) + "|" + (sitting ? 1 : 0);
  let cv = charCache.get(id);
  if (cv) return cv;

  const L = lookFor(key);
  const b = newBuf();
  HEAD_LIFT = (!sitting && (frame === 1 || frame === 3)) ? 1 : 0;
  fillSkull(b, L, face);
  if (face === "down") faceFront(b, L, blink);
  else if (face === "side") faceSide(b, L, blink);
  drawBody(b, L, face, frame, sitting);
  drawHair(b, L, face);                            // 앞머리가 이마를 덮어야 하니 마지막
  if (L.brooch && face !== "up") {
    boxFill(b, 3, 14, 4, 17, "#F7ECDC");
    boxFill(b, 11, 14, 12, 17, "#F7ECDC");
    setPxRaw(b, 10, 14, "#D9B34E");
    setPxRaw(b, 10, 15, "#F9DF83");
  }
  HEAD_LIFT = 0;

  cv = document.createElement("canvas");
  cv.width = CW; cv.height = CH;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < CW; x++) {
      const c = b[y * CW + x];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  charCache.set(id, cv);
  return cv;
}

/** 캐릭터를 (x, y) 에 scale 배로. 왼쪽을 보면 오른쪽 그림을 좌우로 뒤집는다. */
function drawChar(ctx, key, dir, frame, blink, sitting, x, y, scale, alpha) {
  const sp = charSprite(key, dir, frame, blink, sitting);
  const a = alpha === undefined ? 1 : alpha;
  ctx.save();
  if (a !== 1) ctx.globalAlpha = a;
  if (dir === "left") {
    ctx.translate(x + CW * scale, y);
    ctx.scale(-1, 1);
    ctx.drawImage(sp, 0, 0, CW * scale, CH * scale);
  } else {
    ctx.drawImage(sp, x, y, CW * scale, CH * scale);
  }
  ctx.restore();
}

/* --- 방 팔레트 ------------------------------------------------------------ */

/* 가구 색은 두 벌만 둔다. 사람 색은 테마를 안 따라간다 — 피부·머리색이 밤낮으로
 * 바뀌면 같은 팀원이 다른 사람으로 보인다. */
const ROOM_LIGHT = {
  floor: "#E2C098", floorAlt: "#D9B48A", seam: "#C49871", light: "rgba(255,238,190,.32)",
  wall: "#F0E2CB", wallTop: "#CDBA99", wallBase: "#B9A484", wallShade: "rgba(92,64,40,.17)",
  deskTop: "#C68C58", deskLip: "#DCA971", deskEdge: "#9A6939", deskFace: "#8A5C33",
  drawer: "#6F4926", handle: "#D8B98E",
  mon: "#3B3542", monEdge: "#524B5C", monFoot: "#2E2934", glow: "rgba(150,226,214,.30)",
  key: "#E8E2EA", keyDim: "#BAB1C2",
  chair: "#4E4754", chairTop: "#635B6C",
  leaf: "#5F9058", leafDark: "#406B46", pot: "#C0714F", potDark: "#96543A",
  rug: "#D6BFA0", rugEdge: "#B29570", rugLine: "#C0A483",
  paper: "#FAF4EA", mug: "#F7F1EA", mugDark: "#C3B4B8",
  sky: "#BFE2F2", skyLow: "#E6F2FA", frame: "#C9B899",
  board: "#F7F4EC", boardEdge: "#B9A98C",
  shadow: "rgba(72,48,28,.22)",
};
const ROOM_DARK = {
  floor: "#6B5340", floorAlt: "#634C3A", seam: "#523E2E", light: "rgba(255,226,170,.10)",
  wall: "#3E3648", wallTop: "#2C2635", wallBase: "#241F2C", wallShade: "rgba(0,0,0,.30)",
  deskTop: "#8A6142", deskLip: "#A07655", deskEdge: "#5E402A", deskFace: "#573C28",
  drawer: "#3E2A1C", handle: "#9A7C5C",
  mon: "#221D29", monEdge: "#372F40", monFoot: "#1A1620", glow: "rgba(120,210,196,.22)",
  key: "#5A525F", keyDim: "#3C3542",
  chair: "#332D3C", chairTop: "#453D50",
  leaf: "#4B7A4C", leafDark: "#32563A", pot: "#84503A", potDark: "#61382A",
  rug: "#5C4B3C", rugEdge: "#463829", rugLine: "#6E5B48",
  paper: "#CFC6BA", mug: "#D7CEDA", mugDark: "#7A7080",
  sky: "#2E4460", skyLow: "#405C78", frame: "#6A5C48",
  board: "#4A4454", boardEdge: "#332D3C",
  shadow: "rgba(0,0,0,.38)",
};

function isDark() {
  const t = document.documentElement.getAttribute("data-theme");
  if (t === "dark") return true;
  if (t === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
function roomPalette() { return isDark() ? ROOM_DARK : ROOM_LIGHT; }

/* --- 가구 ----------------------------------------------------------------- */
/* 전부 **기본 픽셀 좌표**를 받고 scale 을 곱해 찍는다. 3/4 시점의 규칙은 하나다:
 *   물건마다 윗면(밝게) + 앞면(어둡게) + 바닥 그림자. 이 셋이 있으면 3D 로 보인다. */

function rect(ctx, s, x, y, w, h, c) {
  if (!c || w <= 0 || h <= 0) return;
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x * s), Math.round(y * s), Math.round(w * s), Math.round(h * s));
}

/** 원목 바닥. 판자를 가로로 눕히고 세로 이음매를 줄마다 어긋나게 둔다. */
function drawFloor(ctx, s, x, y, w, h, pal) {
  rect(ctx, s, x, y, w, h, pal.floor);
  const plank = 9;
  for (let r = 0, i = 0; r < h; r += plank, i++) {
    if (i % 2) rect(ctx, s, x, y + r, w, Math.min(plank - 1, h - r), pal.floorAlt);
    rect(ctx, s, x, y + r + plank - 1, w, 1, pal.seam);
    // 이음매를 줄마다 밀어 판자가 벽돌처럼 어긋나게 한다
    for (let j = (i % 3) * 21; j < w; j += 63) rect(ctx, s, x + j, y + r, 1, plank - 1, pal.seam);
  }
}

/** 벽 — 앞면 위에 윗면(두께)을 얹고, 바닥에 그림자를 떨군다. */
function drawWall(ctx, s, x, y, w, faceH, pal) {
  rect(ctx, s, x, y, w, 3, pal.wallTop);             // 벽 두께 (위에서 본 면)
  rect(ctx, s, x, y + 3, w, faceH, pal.wall);        // 벽지
  rect(ctx, s, x, y + 3 + faceH, w, 2, pal.wallBase); // 걸레받이
  rect(ctx, s, x, y + 5 + faceH, w, 3, pal.wallShade); // 바닥에 지는 그늘
}

/** 창문. 바깥이 보여야 방이 건물 안에 있는 것처럼 된다. */
function drawWindow(ctx, s, x, y, w, h, pal) {
  rect(ctx, s, x, y, w, h, pal.frame);
  rect(ctx, s, x + 1, y + 1, w - 2, h - 2, pal.sky);
  rect(ctx, s, x + 1, y + Math.floor(h * 0.6), w - 2, h - 1 - Math.floor(h * 0.6), pal.skyLow);
  rect(ctx, s, x + Math.floor(w / 2), y + 1, 1, h - 2, pal.frame);
  rect(ctx, s, x + 1, y + Math.floor(h / 2), w - 2, 1, pal.frame);
}

/** 화이트보드 — 포스트잇 몇 장. */
function drawBoard(ctx, s, x, y, w, h, pal, key) {
  rect(ctx, s, x, y, w, h, pal.boardEdge);
  rect(ctx, s, x + 1, y + 1, w - 2, h - 2, pal.board);
  let hsh = hashKey((key || "b") + "~board");
  for (let i = 0; i < 5; i++) {
    hsh = (Math.imul(hsh, 1103515245) + 12345) >>> 0;
    const px = x + 3 + ((hsh >>> 5) % Math.max(1, w - 9));
    const py = y + 3 + ((hsh >>> 13) % Math.max(1, h - 8));
    rect(ctx, s, px, py, 4, 4, POINTS[(hsh >>> 21) % POINTS.length]);
  }
}

/** 책상. 상판(윗면) + 앞판 + 서랍 + 바닥 그림자. 한 줄을 통째로 잇는다. */
const DESK_TOP_H = 9, DESK_FACE_H = 7, DESK_H = DESK_TOP_H + DESK_FACE_H;

function drawDesk(ctx, s, x, y, w, pal) {
  rect(ctx, s, x + 2, y + DESK_H, w, 3, pal.shadow);          // 바닥 그림자 (오른쪽 아래로)
  rect(ctx, s, x, y, w, DESK_TOP_H, pal.deskTop);             // 상판
  rect(ctx, s, x, y, w, 1, pal.deskLip);                      // 상판 뒤쪽 하이라이트
  rect(ctx, s, x, y + DESK_TOP_H - 1, w, 1, pal.deskEdge);    // 모서리
  rect(ctx, s, x, y + DESK_TOP_H, w, DESK_FACE_H, pal.deskFace);
  for (let dx = 6; dx + 16 < w; dx += 46) {                   // 서랍
    rect(ctx, s, x + dx, y + DESK_TOP_H + 2, 16, 4, pal.drawer);
    rect(ctx, s, x + dx + 6, y + DESK_TOP_H + 3, 4, 1, pal.handle);
  }
}

/** 모니터. 뒤통수가 우리 쪽이다 — 그래서 화면 대신 **책상에 번지는 빛**으로
 *  켜졌는지 알린다. 화면을 정면으로 돌리면 3/4 시점이 무너진다. */
const MON_W = 17, MON_H = 11;

function drawMonitor(ctx, s, x, deskTop, pal, on) {
  const bottom = deskTop + 5;
  if (on) {                                                    // 화면 빛이 상판에 번진다
    rect(ctx, s, x - 4, deskTop + 1, MON_W + 8, 7, pal.glow);
    rect(ctx, s, x - 8, deskTop + 3, MON_W + 16, 4, pal.glow);
  }
  rect(ctx, s, x + MON_W / 2 - 4, bottom - 2, 9, 3, pal.monFoot);   // 받침
  rect(ctx, s, x + MON_W / 2 - 1, bottom - 5, 3, 4, pal.monFoot);   // 목
  rect(ctx, s, x, bottom - MON_H - 4, MON_W, MON_H, pal.mon);       // 뒤판
  rect(ctx, s, x, bottom - MON_H - 4, MON_W, 1, pal.monEdge);
  rect(ctx, s, x + 1, bottom - MON_H - 1, 3, 2, pal.monEdge);       // 환기구
  if (on) rect(ctx, s, x + MON_W - 4, bottom - 6, 2, 1, "#7FD4C1");  // 전원 램프
}

/** 키보드. 상판 앞줄에 얹는다. press 면 한 칸 눌린다. */
function drawKeyboard(ctx, s, x, deskTop, pal, press) {
  const y = deskTop + 4 + (press ? 1 : 0);
  rect(ctx, s, x, y, 14, 4, pal.keyDim);
  rect(ctx, s, x, y, 14, 3, pal.key);
}

/** 사무 의자. 사람이 없으면 등받이가 통째로 보인다 (자리를 비운 티가 난다). */
function drawChairSeat(ctx, s, cx, footY, pal, empty) {
  rect(ctx, s, cx - 7, footY - 2, 16, 3, pal.shadow);
  if (empty) {
    rect(ctx, s, cx - 6, footY - 9, 14, 8, pal.chair);
    rect(ctx, s, cx - 6, footY - 9, 14, 2, pal.chairTop);
  } else {
    rect(ctx, s, cx - 7, footY - 13, 16, 7, pal.chair);     // 어깨 뒤로 보이는 등받이
    rect(ctx, s, cx - 7, footY - 13, 16, 1, pal.chairTop);
  }
}

/** 화분. 잎 뭉치 + 화분 윗면 + 앞면. 방이 비어 보이지 않게 하는 소품이다. */
function drawPlant(ctx, s, cx, footY, pal, big) {
  const w = big ? 14 : 10, h = big ? 15 : 11;
  rect(ctx, s, cx - w / 2 + 2, footY - 1, w, 3, pal.shadow);
  rect(ctx, s, cx - w / 2 + 1, footY - 6, w - 2, 6, pal.potDark);   // 화분 앞면
  rect(ctx, s, cx - w / 2, footY - 8, w, 3, pal.pot);               // 화분 윗면
  const lx = cx - w / 2 - 1, ly = footY - 8 - h;
  rect(ctx, s, lx + 2, ly, w - 2, h, pal.leafDark);
  rect(ctx, s, lx + 1, ly + 3, w, h - 6, pal.leafDark);
  rect(ctx, s, lx + 3, ly + 1, w - 5, h - 4, pal.leaf);             // 밝은 잎이 위쪽에
  rect(ctx, s, cx - 1, ly + 2, 2, h - 2, pal.leafDark);
}

/** 정수기. 통로 끝에 두면 '쉬러 나온' 자리가 생긴다. */
function drawCooler(ctx, s, cx, footY, pal) {
  rect(ctx, s, cx - 3, footY - 1, 10, 3, pal.shadow);
  rect(ctx, s, cx - 4, footY - 11, 9, 11, pal.monEdge);      // 몸통 앞면
  rect(ctx, s, cx - 4, footY - 13, 9, 3, pal.mon);           // 윗면
  rect(ctx, s, cx - 3, footY - 21, 7, 8, pal.sky);           // 물통
  rect(ctx, s, cx - 3, footY - 17, 7, 4, pal.skyLow);
  rect(ctx, s, cx - 2, footY - 8, 3, 2, pal.key);            // 꼭지
}

/** 러그. 책상 밑에 깔면 바닥이 허전하지 않고 구역도 구분된다. */
function drawRug(ctx, s, x, y, w, h, pal) {
  rect(ctx, s, x + 1, y, w - 2, h, pal.rugEdge);
  rect(ctx, s, x, y + 1, w, h - 2, pal.rugEdge);
  rect(ctx, s, x + 2, y + 2, w - 4, h - 4, pal.rug);
  rect(ctx, s, x + 4, y + 4, w - 8, 1, pal.rugLine);
  rect(ctx, s, x + 4, y + h - 5, w - 8, 1, pal.rugLine);
  for (let i = 6; i < w - 6; i += 8) rect(ctx, s, x + i, y + Math.floor(h / 2), 3, 1, pal.rugLine);
}

/** 머그컵과 서류. 책상 위에 사람이 쓰는 흔적을 남긴다. */
function drawDeskProps(ctx, s, x, deskTop, pal, key) {
  const h = hashKey((key || "d") + "~props");
  rect(ctx, s, x, deskTop + 3, 4, 4, pal.mugDark);
  rect(ctx, s, x, deskTop + 3, 4, 3, pal.mug);
  rect(ctx, s, x + 4, deskTop + 4, 1, 2, pal.mugDark);           // 손잡이
  if (h % 2) {
    rect(ctx, s, x + 8, deskTop + 3, 7, 5, pal.shadow);
    rect(ctx, s, x + 8, deskTop + 2, 7, 5, pal.paper);
  }
}

/** 캐릭터 발밑 그림자. 이게 없으면 사람이 바닥에서 1cm 떠 있는 것처럼 보인다. */
function drawFootShadow(ctx, s, cx, footY, pal, wide) {
  const w = wide ? 12 : 10;
  rect(ctx, s, cx - w / 2, footY, w, 2, pal.shadow);
  rect(ctx, s, cx - w / 2 + 1, footY + 2, w - 2, 1, pal.shadow);
}

/** 머리 위 상태 점. DOM 으로 띄우면 캐릭터가 걸을 때마다 흔들려서 캔버스에 찍는다. */
const DOT_COLORS = { work: "#3FBF93", idle: "#E0A93C", halt: "#D8635F", off: "#8A8594" };

function drawStatusDot(ctx, s, cx, y, tone, pulse) {
  const c = DOT_COLORS[tone] || DOT_COLORS.idle;
  const r = 2 + (pulse ? 1 : 0);
  rect(ctx, s, cx - r - 1, y - r - 1, r * 2 + 2, r * 2 + 2, "rgba(20,14,26,.22)");
  rect(ctx, s, cx - r, y - r, r * 2, r * 2, c);
}

/* --- 목록·상세에 쓰는 얼굴 ------------------------------------------------ */

/** 캐릭터 한 명을 작은 캔버스에 앞모습으로. 명단·상세 패널의 아바타. */
function paintPortrait(canvas, key, opts) {
  const o = opts || {};
  const s = o.scale || 3;
  const pal = o.palette || roomPalette();
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = CW * s, h = CH * s;
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
  drawFootShadow(ctx, s, CW / 2, FOOT_Y, pal, false);
  drawChar(ctx, key, "down", 0, false, false, 0, 0, s, o.mode === "off" ? 0.45 : 1);
}
