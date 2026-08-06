/*
 * 벽 자동 인식 회귀용 도면 코퍼스
 *
 * 사용자가 어떤 도면을 올릴지 모르므로, 실제 분양·인테리어 도면의 **표기 관례**를 그대로
 * 재현한 평면을 여러 벌 만들어 두고 매번 전부 통과하는지 검사한다. 관례는 웹 리서치로 확인했다:
 *   - 내력벽은 굵은 복선(150~200mm), 경량 칸막이벽은 얇은 단선(100mm 내외)
 *   - 문은 반원(호), 창은 벽 안의 직선 — 둘 다 가는 선이라 '열기'에 지워진다
 *   - **창은 벽에 뚫린 구멍이 아니다.** 벽은 이어져 있고 그 안에 유리선을 가늘게 긋는다
 *   - 발코니를 확장하면 거실과 발코니 사이 벽이 없어져 4~5m가 통째로 트인다
 *   - 요즘 분양 도면은 컬러 렌더링이라 바닥·가구에 색이 들어간다
 *   - 스캔·복사본은 배경이 흰색이 아니고, 벽을 칠하지 않고 윤곽선만 그린 도면도 있다
 *
 * 좌표는 전부 **mm**로 쓰고 렌더링할 때 px로 환산한다. 도면을 읽을 때 머릿속에서
 * 실제 치수로 검산할 수 있어야 기대값을 틀리게 적지 않는다.
 *
 * 각 평면의 probes[]는 "여기를 눌렀을 때 이런 방이 나와야 한다"를 적은 것이다.
 *   at      : 누를 지점 (mm)
 *   areaM2  : 인식된 방 넓이 (㎡) 기대 범위 [min, max]
 *   opens   : 개구부 개수 기대 범위 [min, max] (생략 가능)
 *   note    : 이 검사가 무엇을 지키는지
 */

const T_BEAR = 200;   // 내력벽
const T_PART = 100;   // 경량 칸막이벽
const DOOR   = 900;   // 문 유효폭

/** mm 좌표를 그대로 받는 SVG 빌더 */
function planSvg({ w, h, ppm = 0.12, bg = '#fff', ink = '#111', body }) {
  const W = Math.round(w * ppm), H = Math.round(h * ppm);
  const p = [];
  const px = (v) => +(v * ppm).toFixed(2);
  const api = {
    ppm, ink,
    /** 벽(칠한 사각형) */
    wall: (x, y, ww, hh, fill = ink) =>
      p.push(`<rect x="${px(x)}" y="${px(y)}" width="${px(ww)}" height="${px(hh)}" fill="${fill}"/>`),
    /** 벽 윤곽선만 그린다 — 아웃라인 도면용 */
    wallOutline: (x, y, ww, hh, sw = 1.6) =>
      p.push(`<rect x="${px(x)}" y="${px(y)}" width="${px(ww)}" height="${px(hh)}" fill="${bg}" stroke="${ink}" stroke-width="${sw}"/>`),
    /** 벽을 도려낸다 — 문 자리 */
    cut: (x, y, ww, hh) =>
      p.push(`<rect x="${px(x)}" y="${px(y)}" width="${px(ww)}" height="${px(hh)}" fill="${bg}"/>`),
    /** 가는 선 (문 호·창 유리선·가구·치수선) — 정리 단계에서 지워져야 하는 것들 */
    thin: (d, sw = 1.2) =>
      p.push(`<path d="${d}" fill="none" stroke="${ink}" stroke-width="${sw}"/>`),
    /** 색이 들어간 면 (바닥 마감·가구) */
    fill: (x, y, ww, hh, color) =>
      p.push(`<rect x="${px(x)}" y="${px(y)}" width="${px(ww)}" height="${px(hh)}" fill="${color}"/>`),
    text: (x, y, s, size = 90) =>
      p.push(`<text x="${px(x)}" y="${px(y)}" font-size="${px(size)}" fill="${ink}">${s}</text>`),
    px,
  };
  body(api);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<rect width="${W}" height="${H}" fill="${bg}"/>${p.join('')}</svg>`;
}

/* ── 84타입 3베이 판상형 ─────────────────────────────────────────────
   외곽 12,600 × 9,400 (사방 300 여백) / 외벽 200 / 내부벽 150
   남측  : 침실1 · [발코니 확장 + 거실] · 안방
   복도  : 거실·주방·현관과 트여 있다 (침실들은 문으로 막힘)
   북측  : 주방 · 욕실 · 현관 · 침실2
   창은 벽을 뚫지 않고 유리선만 가늘게 긋는다 — 실제 도면 표기 그대로.
   따라서 **세대 전체가 닫혀 있다**. 닫기 반경 0에서도 새어 나가지 않으므로,
   "새지 않는 가장 작은 반경"만 보면 세대 전체가 방 하나로 잡힌다.
──────────────────────────────────────────────────────────────────── */
function unit84(opts = {}) {
  const {
    color = false, partitionThin = false, outline = false,
    bg = '#fff', ink = '#111', ppm = 0.12, floor = null,
  } = opts;
  const M = 300;                                   // 도면 여백
  const W = 12000, H = 9000;                       // 세대 외곽
  const wallT = partitionThin ? T_PART : 150;
  return planSvg({
    w: W + M * 2, h: H + M * 2, ppm, bg, ink,
    body(a) {
      const wall = outline
        ? (x, y, ww, hh) => a.wallOutline(x + M, y + M, ww, hh)
        : (x, y, ww, hh) => a.wall(x + M, y + M, ww, hh);
      const cut  = (x, y, ww, hh) => a.cut(x + M, y + M, ww, hh);
      const thin = (d, sw) => a.thin(d, sw);
      const X = (v) => a.px(v + M), Y = (v) => a.px(v + M);

      // 바닥 마감 — 이진화 임계가 이걸 벽으로 보면 인식이 통째로 망가진다
      if (color) {
        a.fill(M + 200, M + 200, W - 400, H - 400, floor || '#d8c3a5');   // 우드톤
        a.fill(M + 200, M + 6800, 4300, 2000, '#9a9a9a');                 // 주방 타일
        a.fill(M + 4650, M + 6800, 1550, 2000, '#8f9ba6');                // 욕실 타일
      }
      // 외벽
      wall(0, 0, W, T_BEAR); wall(0, H - T_BEAR, W, T_BEAR);
      wall(0, 0, T_BEAR, H); wall(W - T_BEAR, 0, T_BEAR, H);

      // 남측 세로벽 (침실1 | 거실 | 안방)
      wall(3400, T_BEAR, wallT, 5200 - T_BEAR);
      wall(8000, T_BEAR, wallT, 5200 - T_BEAR);
      // 남측 가로벽 (복도와 가름) — 거실 구간은 트여 있다
      wall(T_BEAR, 5200, 3400 - T_BEAR, wallT);
      wall(8000 + wallT, 5200, W - T_BEAR - 8000 - wallT, wallT);
      // 북측 가로벽 — 주방(2,000)과 현관(1,850)은 복도로 트여 있다
      wall(T_BEAR, 6650, 6200 - T_BEAR, wallT);
      wall(6200, 6650, 2000, wallT);
      wall(6350 + 1850, 6650, W - T_BEAR - 8200, wallT);
      cut(200, 6650, 2000, wallT);                        // 주방 개구부
      cut(6350, 6650, 1850, wallT);                       // 현관 개구부
      // 북측 세로벽
      wall(4500, 6800, wallT, H - T_BEAR - 6800);
      wall(6200, 6800, wallT, H - T_BEAR - 6800);
      wall(8200, 6800, wallT, H - T_BEAR - 6800);

      // 문 — 벽을 도려내고 열림 호를 가는 선으로 그린다
      const doorH = (x, y) => { cut(x, y - 20, DOOR, wallT + 40);
        thin(`M${X(x)} ${Y(y)} a ${a.px(DOOR)} ${a.px(DOOR)} 0 0 1 ${a.px(DOOR)} ${a.px(DOOR)}`); };
      doorH(1600, 5200);          // 침실1
      doorH(9200, 5200);          // 안방
      doorH(4800, 6650);          // 욕실
      doorH(9600, 6650);          // 침실2

      // 발코니 확장 — 거실 남측 벽이 없어져 4,450mm가 통째로 트인다.
      // 발코니는 세대 안쪽이라 새어 나가지 않는다(실제 확장형 도면 그대로).
      wall(3400 + wallT, 1700, 0, 0);                    // (자리표시 — 벽 없음)
      thin(`M${X(3550)} ${Y(1700)} H${X(8000)}`);        // 창호선(가는 선)

      // 창 — 벽을 뚫지 않는다. 벽은 이어져 있고 유리선만 가늘게 긋는다
      const win = (x0, x1) => thin(`M${X(x0)} ${Y(70)} H${X(x1)} M${X(x0)} ${Y(130)} H${X(x1)}`);
      win(1200, 3000); win(3800, 7800); win(9000, 10800);

      // 가구·치수선·실명 — 전부 가는 선이라 정리 단계에서 지워져야 한다
      thin(`M${X(4200)} ${Y(3600)} h${a.px(2400)} v${a.px(900)} h${a.px(-2400)} z`);   // 소파
      thin(`M${X(9000)} ${Y(2000)} h${a.px(1600)} v${a.px(2000)} h${a.px(-1600)} z`);  // 침대
      thin(`M${X(400)} ${Y(7200)} h${a.px(3800)} v${a.px(600)} h${a.px(-3800)} z`);    // 싱크대
      thin(`M${a.px(0)} ${Y(-150)} H${a.px((W + 600) * 1)}`);                          // 치수선
      a.text(M + 4600, M + 3200, '거실');
      a.text(M + 1200, M + 3000, '침실1');
      a.text(M + 9000, M + 3000, '안방');
      a.text(M + 700, M + 8200, '주방');
    },
  });
}

/* 거실+발코니+복도+주방+현관 = 49.7㎡ / 침실1 16.0 / 안방 18.25 / 욕실 3.1 */
const OPEN_AREA = [44, 56];
const BED1 = [14, 18], MASTER = [16, 21], BATH = [2.4, 3.8];

export const PLANS = [
  {
    name: '84타입 3베이 (표준)',
    svg: unit84(),
    mmPerImgPx: 1 / 0.12,
    probes: [
      { at: [5800, 3300], areaM2: OPEN_AREA,
        note: '거실을 누르면 거실+발코니+복도+주방+현관(49.7㎡)이 나온다. 세대 전체(약 90㎡)가 나오면 "새지 않는 가장 작은 반경" 규칙이 침실 문을 안 막은 것이다' },
      { at: [1600, 3000], areaM2: BED1,
        note: '침실1은 문이 막혀 단독으로 잡혀야 한다 (3,200×5,000 = 16㎡)' },
      { at: [10000, 3000], areaM2: MASTER, note: '안방 (3,650×5,000 = 18.3㎡)' },
      { at: [5300, 7800], areaM2: BATH, note: '욕실 (1,550×2,000 = 3.1㎡)' },
    ],
  },
  {
    name: '84타입 (컬러 도면 · 어두운 바닥)',
    svg: unit84({ color: true, floor: '#6f6f6f' }),
    mmPerImgPx: 1 / 0.12,
    probes: [
      { at: [5800, 3300], areaM2: OPEN_AREA,
        note: '바닥이 어두워도 결과가 같아야 한다 — 고정 임계(125)로는 바닥 전체가 벽이 된다' },
      { at: [1600, 3000], areaM2: BED1, note: '어두운 바닥의 침실1' },
    ],
  },
  {
    name: '84타입 (회색 배경 스캔본)',
    svg: unit84({ bg: '#dcdcdc', ink: '#2a2a2a' }),
    mmPerImgPx: 1 / 0.12,
    probes: [
      { at: [5800, 3300], areaM2: OPEN_AREA, note: '복사본처럼 배경이 회색이어도 인식돼야 한다' },
      { at: [1600, 3000], areaM2: BED1, note: '스캔본의 침실1' },
    ],
  },
  {
    name: '84타입 (벽을 칠하지 않은 아웃라인 도면)',
    svg: unit84({ outline: true }),
    mmPerImgPx: 1 / 0.12,
    probes: [
      { at: [1600, 3000], areaM2: BED1,
        note: '벽을 윤곽선으로만 그린 도면. 열기 반경이 선을 지우면 인식이 통째로 실패한다' },
      { at: [5800, 3300], areaM2: [20, 56],
        note: '아웃라인 도면은 열기를 건너뛰므로 문 열림 호가 남아 복도가 끊길 수 있다. '
            + '거실이 통째로 안 잡히는 것만 막는다(범위 조절로 사용자가 넓힐 수 있음)' },
    ],
  },
  {
    name: '84타입 (경량 칸막이벽 100mm)',
    svg: unit84({ partitionThin: true }),
    mmPerImgPx: 1 / 0.12,
    probes: [
      { at: [1600, 3000], areaM2: [14, 18.5],
        note: '얇은 칸막이벽이 정리 단계에서 지워지면 침실이 거실과 합쳐진다' },
      { at: [5800, 3300], areaM2: OPEN_AREA, note: '칸막이벽 도면의 거실' },
    ],
  },
  {
    name: '84타입 (저해상도 660px)',
    svg: unit84({ ppm: 0.055 }),
    mmPerImgPx: 1 / 0.055,
    probes: [
      { at: [5800, 3300], areaM2: [42, 58], note: '작은 도면에서도 벽이 살아남아야 한다' },
      { at: [1600, 3000], areaM2: [13, 19], note: '저해상도의 침실1' },
    ],
  },
  {
    name: '단일 실 (문·창이 도면 밖으로 열림)',
    svg: planSvg({
      w: 6600, h: 5100, ppm: 0.2,
      body(a) {
        const M = 300;
        a.wall(M, M, 6000, T_BEAR); a.wall(M, M + 4300, 6000, T_BEAR);
        a.wall(M, M, T_BEAR, 4500); a.wall(M + 5800, M, T_BEAR, 4500);
        a.cut(M + 2000, M, 1600, T_BEAR);                          // 창 1,600 (실제로 뚫린 개구부)
        a.thin(`M${a.px(M + 2000)} ${a.px(M + 70)} H${a.px(M + 3600)} M${a.px(M + 2000)} ${a.px(M + 130)} H${a.px(M + 3600)}`);
        a.cut(M + 5800, M + 1600, T_BEAR, DOOR);                   // 문 900
        a.thin(`M${a.px(M + 5800)} ${a.px(M + 1600)} a ${a.px(DOOR)} ${a.px(DOOR)} 0 0 0 ${a.px(DOOR)} ${a.px(DOOR)}`);
        a.thin(`M${a.px(M + 400)} ${a.px(M + 2600)} h${a.px(1800)} v${a.px(1400)} h${a.px(-1800)} z`);
        a.text(M + 2400, M + 2400, '거실');
      },
    }),
    mmPerImgPx: 1 / 0.2,
    probes: [
      { at: [3300, 2500], areaM2: [21, 25], opens: [2, 2],
        note: '5,600×4,100 = 23㎡. 뚫린 창(1,600)·문(900) 딱 2곳이 개구부로 잡혀야 한다' },
    ],
  },
  {
    name: 'ㄷ자 방 (기둥·벽감이 안으로 튀어나옴)',
    svg: planSvg({
      w: 7600, h: 5600, ppm: 0.2,
      body(a) {
        const M = 300;
        a.wall(M, M, 7000, T_BEAR); a.wall(M, M + 4800, 7000, T_BEAR);
        a.wall(M, M, T_BEAR, 5000); a.wall(M + 6800, M, T_BEAR, 5000);
        a.wall(M + 3000, M, 900, 1400);                      // 안으로 튀어나온 기둥
        a.wall(M + 6800 - 1200, M + 2000, 1200, 1000);       // 벽감
        a.cut(M, M + 3200, T_BEAR, DOOR);
        a.text(M + 1200, M + 2600, '거실');
      },
    }),
    mmPerImgPx: 1 / 0.2,
    probes: [
      { at: [1800, 2800], areaM2: [27, 30],
        note: '6,600×4,600 = 30.4㎡에서 기둥 1.26 + 벽감 1.2를 빼면 약 28㎡. 파인 부분을 가로지르면 30㎡ 위로 뜬다' },
    ],
  },
];

export { planSvg, unit84 };
