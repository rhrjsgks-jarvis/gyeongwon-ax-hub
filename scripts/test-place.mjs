/*
 * 가전 배치 시뮬레이터 회귀 테스트
 * 실행: node scripts/test-place.mjs   (npm run test:place)
 *
 * 다른 모듈과 같은 방식으로 jsdom에 public/place-app.html을 올리고, 인라인 스크립트가
 * window.__place로 노출한 함수들을 직접 호출해 검증한다.
 *
 * 이 모듈은 "들어갑니다/안 들어갑니다"를 판정해 고객에게 말하는 도구다. 판정이 틀리면
 * 설치 당일 사고가 나므로, 기하 계산을 눈으로 검산 가능한 값으로 못 박아 둔다.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

let ok = true;
const fail = (m) => { console.log('ERROR:', m); ok = false; };
const pass = (m) => console.log('OK:', m);
const near = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;

const html = fs.readFileSync(path.join(root, 'public', 'place-app.html'), 'utf8');
const reps = JSON.parse(fs.readFileSync(path.join(root, 'public', 'size-reps.json'), 'utf8'));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/place-app.html',
  beforeParse(win) {
    // canvas 2D 컨텍스트는 jsdom에 없다. 그리기는 검증 대상이 아니라 계산만 보므로
    // 호출을 삼키는 스텁으로 대신한다.
    win.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
      get: (_, k) => (k === 'canvas' ? {} : () => {}),
    });
    win.fetch = () => Promise.resolve({ json: () => Promise.resolve(reps) });
    win.URL.createObjectURL = () => 'blob:stub';
  },
});
const P = dom.window.__place;
if (!P) { fail('window.__place가 노출되지 않음 — 스크립트가 실행되지 않았다'); process.exit(1); }
pass('place-app.html 로드 및 전역 노출');

const box = (bx, by, w, d, a = 0) => ({ bx, by, w, d, a });

// ── [1] corners: 뒷면 중앙 기준, 로컬 +y가 정면 ──
{
  const c = P.corners(box(0, 0, 600, 700));
  const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
  if (!near(Math.min(...xs), -300) || !near(Math.max(...xs), 300)) fail(`폭이 어긋남: ${Math.min(...xs)}~${Math.max(...xs)}`);
  else if (!near(Math.min(...ys), 0) || !near(Math.max(...ys), 700)) fail(`깊이가 어긋남: ${Math.min(...ys)}~${Math.max(...ys)}`);
  else pass('뒷면 중앙 기준 사각형 (폭 600 · 깊이 700, 뒷면이 y=0)');

  // 90° 회전하면 폭과 깊이가 축을 바꿔야 한다
  const r = P.corners(box(0, 0, 600, 700, Math.PI / 2));
  const rw = Math.max(...r.map((p) => p[1])) - Math.min(...r.map((p) => p[1]));
  if (!near(rw, 600)) fail(`90° 회전 후 폭이 y축으로 가지 않음: ${rw}`);
  else pass('90° 회전 시 축 교환');
}

// ── [2] 이격 패딩 ──
{
  const c = P.corners(box(0, 0, 600, 700), { back: 50, side: 20, front: 555 });
  const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
  if (!near(Math.min(...xs), -320) || !near(Math.max(...xs), 320)) fail('좌우 이격이 반영되지 않음');
  else if (!near(Math.min(...ys), -50) || !near(Math.max(...ys), 1255)) fail(`후면/전면 이격이 어긋남: ${Math.min(...ys)}~${Math.max(...ys)}`);
  else pass('이격 확장 (좌우 ±20 · 후면 −50 · 전면 +555)');
}

// ── [3] 겹침 판정 ──
{
  const A = P.corners(box(0, 0, 600, 700));
  const apart = P.corners(box(700, 0, 600, 700));   // 좌우로 100mm 떨어짐
  const over = P.corners(box(300, 0, 600, 700));    // 절반 겹침
  const touch = P.corners(box(600, 0, 600, 700));   // 변끼리 맞닿음
  if (P.overlaps(A, apart)) fail('떨어져 있는데 겹친다고 판정');
  else pass('떨어진 두 가전 — 겹침 아님');
  if (!P.overlaps(A, over)) fail('절반 겹치는데 겹침으로 판정하지 않음');
  else pass('절반 겹침 — 겹침으로 판정');
  if (P.overlaps(A, touch)) fail('변끼리 맞닿은 것을 겹침으로 판정 — 나란히 붙여 놓을 수 없게 된다');
  else pass('변끼리 맞닿음 — 겹침 아님 (나란히 설치 허용)');
}

// ── [4] 벽 스냅 — 법선 부호 ──
// 벽 선분의 점 순서가 반대여도, 사용자가 클릭한 쪽으로 붙어야 한다.
{
  const st = P.state;
  const item = { w: 600, d: 700, clear: { back: 50, side: 0, front: 0 } };

  st.walls = [{ x1: 0, y1: 0, x2: 4000, y2: 0 }];
  const below = P.snapToWall(1000, 500, item);      // 벽 아래쪽(+y)에서 클릭
  if (!near(below.by, 50)) fail(`아래쪽 클릭인데 뒷면이 y=${below.by} (기대 50)`);
  else pass('벽 아래쪽에서 클릭 → 아래쪽에 배치 (후면 이격 50mm 반영)');

  const above = P.snapToWall(1000, -500, item);     // 같은 벽, 위쪽에서 클릭
  if (!near(above.by, -50)) fail(`위쪽 클릭인데 뒷면이 y=${above.by} (기대 -50)`);
  else pass('같은 벽 위쪽에서 클릭 → 위쪽에 배치');

  // 점 순서를 뒤집어도 결과가 같아야 한다 (법선을 각도로만 정하면 여기서 뒤집힌다)
  st.walls = [{ x1: 4000, y1: 0, x2: 0, y2: 0 }];
  const flipped = P.snapToWall(1000, 500, item);
  if (!near(flipped.by, 50)) fail(`벽 점 순서를 뒤집으니 반대편(y=${flipped.by})에 배치됨 — 법선 부호 버그`);
  else pass('벽 점 순서를 뒤집어도 클릭한 쪽에 배치');

  st.walls = [];
}

// ── [5] 방 안/밖 판정 ──
{
  const st = P.state;
  st.walls = [
    { x1: 0, y1: 0, x2: 3000, y2: 0 },
    { x1: 3000, y1: 0, x2: 3000, y2: 2500 },
    { x1: 3000, y1: 2500, x2: 0, y2: 2500 },
    { x1: 0, y1: 2500, x2: 0, y2: 0 },
  ];
  if (!P.wallLoop()) fail('닫힌 사각형인데 방으로 인식하지 못함');
  else pass('닫힌 벽 4개 → 방으로 인식');
  if (!P.insideRoom(1500, 1200)) fail('방 안의 점을 밖으로 판정');
  else if (P.insideRoom(3500, 1200)) fail('방 밖의 점을 안으로 판정');
  else pass('방 안/밖 판정');
  st.walls = [];
}

// ── [6] 실제 배치 시나리오 ──
// 3,000 × 2,500mm 방 위쪽 벽에 냉장고(폭 912) + 김치냉장고(폭 595)를 나란히 놓는다.
// 냉장고 후면 이격 50 · 김치냉장고 스탠드형 후면 100 · 양측 50이 각각 적용된다.
{
  const st = P.state;
  st.walls = [
    { x1: 0, y1: 0, x2: 3000, y2: 0 },
    { x1: 3000, y1: 0, x2: 3000, y2: 2500 },
    { x1: 3000, y1: 2500, x2: 0, y2: 2500 },
    { x1: 0, y1: 2500, x2: 0, y2: 0 },
  ];
  const mk = (label, cat, bx, w, d) => ({
    id: label, label, cat, size: '', model: '',
    w, h: 1853, d, clear: P.clearFor(cat, '본체'),
    bx, by: (P.clearFor(cat, '본체').back || 0), a: 0, warn: [],
  });
  st.items = [mk('냉장고', '냉장고', 600, 912, 683), mk('김치냉장고', '김치냉장고', 1200, 595, 700)];
  P.evaluate();
  const overlapping = st.items.filter((i) => i.warn.some((w) => w.includes('겹침')));
  if (!overlapping.length) fail('600mm 간격에 폭 912+595를 놓았는데 겹침을 잡지 못함');
  else pass('가까이 붙인 두 가전 — 겹침 감지');

  // 충분히 띄우면 통과해야 한다 (912/2 + 50 + 50 + 595/2 = 853.5 이상 필요)
  st.items[1].bx = 1600;
  P.evaluate();
  if (st.items.some((i) => i.warn.length)) fail(`1,000mm 띄웠는데도 경고: ${JSON.stringify(st.items.map((i) => i.warn))}`);
  else pass('1,000mm 띄움 — 이격 포함 통과');

  // 방 밖으로 밀어내면 잡아야 한다
  st.items[1].bx = 2900;
  P.evaluate();
  if (!st.items[1].warn.includes('방 밖으로 나감')) fail('방 밖으로 나갔는데 잡지 못함');
  else pass('방 밖 이탈 감지');

  st.items = []; st.walls = [];
}

// ── [7] 이격거리표는 설치환경 가이드에 실제로 있는 값만 쓴다 ──
{
  const install = fs.readFileSync(path.join(root, 'public', 'install-app.html'), 'utf8');
  const CHECK = [
    ['에어드레서', 'side', 2.5, "['좌우 이격','2.5mm — 현재 판매 라인업"],
    ['에어드레서', 'back', 15, "['후면 이격','15mm — 전 라인업 공통"],
    ['세탁기·콤보', 'side', 20, '양옆 이격 각 20mm'],
    ['김치냉장고', 'back', 100, '후면 벽과의 거리 100mm'],
    ['건조기', 'back', 20, '후면 이격 20mm'],
    ['전자레인지/오븐', 'side', 100, "['좌우 이격','10cm 이상"],
    ['전자레인지/오븐', 'back', 100, "['후면 이격','10cm 이상"],
    ['공기청정기', 'back', 600, "['벽면 이격','최소 60cm 권장"],
  ];
  let bad = 0;
  for (const [cat, key, val, evidence] of CHECK) {
    const c = P.CLEAR[cat];
    if (!c) { fail(`이격거리표에 ${cat}이 없음`); bad++; continue; }
    if (c[key] !== val) { fail(`${cat}.${key} = ${c[key]} (기대 ${val})`); bad++; continue; }
    if (!install.includes(evidence)) {
      fail(`${cat}.${key}의 근거 문구 "${evidence}"가 설치환경 가이드에 없음 — 근거 없는 수치는 넣지 않는다`);
      bad++;
    }
  }
  if (!bad) pass(`이격거리 ${CHECK.length}건이 설치환경 가이드 원문과 일치`);

  // 근거가 약한 항목은 weak로 표시해 두었는지
  for (const [cat, c] of Object.entries(P.CLEAR)) {
    if (!c.src) fail(`${cat}: 이격거리 출처(src)가 비어 있음`);
  }
  const weak = Object.entries(P.CLEAR).filter(([, c]) => c.weak).map(([k]) => k);
  pass(`출처 표기 완비 · 준용(추정) 표시: ${weak.join(', ') || '없음'}`);
}

// ── [7-b] 모델 세대에 따라 이격이 달라지는 경우 ──
// 에어드레서는 현행 라인업 2.5mm / 구형 Bespoke 14mm로 5.5배 차이가 난다.
// 나란히 설치할 때 결과가 뒤집히므로 모델코드로 갈라져야 한다.
{
  const install = fs.readFileSync(path.join(root, 'public', 'install-app.html'), 'utf8');
  const cur = P.clearFor('에어드레서', '본체', 'DF80H24R1D');
  const old = P.clearFor('에어드레서', '본체', 'DF10A9500CG');
  if (cur.side !== 2.5) fail(`현행 에어드레서(DF80H24R1D) 좌우 이격이 ${cur.side} (기대 2.5)`);
  else if (old.side !== 14) fail(`구형 Bespoke 에어드레서(DF10A9500CG) 좌우 이격이 ${old.side} (기대 14)`);
  else if (!install.includes('DF10A9500CG') || !install.includes('14mm')) {
    fail('구형 14mm 근거가 설치환경 가이드에 없음');
  } else pass('에어드레서 모델 세대별 좌우 이격 (현행 2.5mm / 구형 Bespoke 14mm)');

  // size-reps에 실린 에어드레서가 어느 쪽인지 확인 — 지금은 전부 현행 라인업이어야 한다
  const ad = reps.filter((r) => r.cat === '에어드레서')
    .flatMap((r) => r.options.flatMap((o) => [o.model, ...o.also]));
  const legacy = ad.filter((m) => P.clearFor('에어드레서', '본체', m).side !== 2.5);
  if (legacy.length) console.log(`NOTE: size-reps의 에어드레서 중 구형 라인 ${legacy.join(', ')} — 좌우 14mm로 계산됨`);
  else pass(`size-reps 에어드레서 ${ad.length}종 전부 현행 라인업 (${ad.join(', ')})`);
}

// ── [8] 실외기는 실내기와 다른 이격을 쓴다 ──
{
  const indoor = P.clearFor('에어컨', '실내기');
  const outdoor = P.clearFor('에어컨', '실외기');
  if (outdoor.front !== 500) fail(`실외기 전면 이격이 ${outdoor.front} (기대 500)`);
  else if (indoor.front === outdoor.front) fail('실내기와 실외기가 같은 이격을 씀');
  else pass('실외기 전용 이격 (전면 500 · 후면 150 · 좌우 100)');
}

// ── [9] size-reps.json의 모든 카테고리가 배치 가능한지 ──
{
  const cats = [...new Set(reps.map((r) => r.cat))];
  const noClear = cats.filter((c) => !P.CLEAR[c]);
  // 이격 수치가 없는 카테고리는 0으로 배치되며 화면에 그 사실이 표시된다.
  // 실패로 두지 않는 이유: 근거 없는 값을 채우는 것보다 비워 두는 편이 낫다.
  console.log(`NOTE: 이격거리 미확인 ${noClear.length}개 카테고리 — ${noClear.join(', ')}`);
  for (const c of cats) {
    const cl = P.clearFor(c, '본체');
    if (typeof cl.back !== 'number' || typeof cl.side !== 'number') { fail(`${c}: clearFor가 수치를 돌려주지 않음`); break; }
  }
  pass(`size-reps 카테고리 ${cats.length}개 전부 clearFor 처리 가능`);
}

// ── [10] 배치 추천 ──
// 자동 배치가 "억지로 넣고 들어간다고 말하는" 실패를 하지 않는지가 핵심이다.
{
  const st = P.state;
  const room = (w, h) => [
    { x1: 0, y1: 0, x2: w, y2: 0 }, { x1: w, y1: 0, x2: w, y2: h },
    { x1: w, y1: h, x2: 0, y2: h }, { x1: 0, y1: h, x2: 0, y2: 0 },
  ];
  const pick = (cat, sizeIdx = 0) => {
    const r = reps.filter((x) => x.cat === cat)[sizeIdx];
    return { cat, size: r.size, model: r.options[0].model, part: r.options[0].parts[0] };
  };

  // 3,600 × 2,600mm 주방 — 냉장고 + 김치냉장고 + 식기세척기
  st.walls = room(3600, 2600); st.items = [];
  P.autoPlace([pick('냉장고', 2), pick('김치냉장고'), pick('식기세척기')]);
  if (st.items.length !== 3) fail(`3.6×2.6m 방에 3종을 넣었는데 ${st.items.length}종만 배치됨`);
  else if (st.items.some((i) => i.warn.length)) {
    fail(`자동 배치인데 경고가 남음: ${st.items.filter((i) => i.warn.length).map((i) => `${i.label}(${i.warn})`).join(', ')}`);
  } else pass('3.6×2.6m 주방에 냉장고·김치냉장고·식기세척기 3종 자동 배치 — 경고 없음');

  // 좁은 방에서는 억지로 놓지 않아야 한다
  st.walls = room(1000, 1000); st.items = [];
  P.autoPlace([pick('냉장고', 2), pick('김치냉장고')]);
  if (st.items.some((i) => i.warn.length)) fail('좁은 방에 억지로 놓아 경고가 발생 — 자리가 없으면 놓지 않아야 한다');
  else if (st.items.length >= 2) fail(`1×1m 방에 폭 912+595를 둘 다 놓음 — 자리 없음 판정이 동작하지 않는다`);
  else pass(`1×1m 방 — ${st.items.length}종만 배치하고 나머지는 자리 없음으로 남김`);

  // 방을 그리지 않으면 자리를 찾지 못한다(스냅과 달리 방 경계가 필수)
  st.walls = []; st.items = [];
  const it = { w: 600, d: 700, clear: { back: 50, side: 20, front: 0 } };
  if (P.findSpot(it, [])) fail('방이 없는데 자리를 찾았다고 응답');
  else pass('방(닫힌 벽)이 없으면 자동 배치를 하지 않음');

  // 방 용도별 후보에 엉뚱한 카테고리가 섞이지 않는지
  if (P.ROOM_PLAN['주방'].includes('세탁기·콤보')) fail('주방 추천 목록에 세탁기가 들어 있음');
  else if (!P.ROOM_PLAN['세탁실'].includes('건조기')) fail('세탁실 추천 목록에 건조기가 없음');
  else pass('방 용도별 후보 카테고리 구성');

  // 같은 제품 여러 대 — 서로 겹치지 않고 목록에서 구분되어야 한다
  st.walls = room(6000, 3000); st.items = [];
  const ac = pick('공기청정기');
  P.autoPlace([{ ...ac, seq: 1 }, { ...ac, seq: 2 }, { ...ac, seq: 3 }]);
  if (st.items.length !== 3) fail(`같은 제품 3대를 넣었는데 ${st.items.length}대만 배치됨`);
  else if (st.items.some((i) => i.warn.length)) fail(`같은 제품 3대가 서로 겹침: ${st.items.map((i) => i.warn).flat()}`);
  else if (new Set(st.items.map((i) => i.label)).size !== 3) fail(`3대의 이름이 겹침: ${st.items.map((i) => i.label)}`);
  else pass(`같은 제품 3대 — 겹치지 않게 배치되고 이름이 구분됨 (${st.items.map((i) => i.label.split(' ').pop()).join(' ')})`);

  st.walls = []; st.items = [];
}

// ── [11] 도어 오픈 공간 ──
// 하드 판정이 아니라 주의 경고여야 한다. 이걸 이격처럼 걸면 실제 주방 대부분이
// "배치 불가"가 되어 도구가 쓸모없어진다.
{
  const st = P.state;
  const install = fs.readFileSync(path.join(root, 'public', 'install-app.html'), 'utf8');

  // 근거 대조 — 양문형 1,726 − 912 = 좌우 각 407
  const sbs = P.doorZoneFor({ cat: '냉장고', group: '양문형 2도어' });
  const four = P.doorZoneFor({ cat: '냉장고', group: '4도어 (2026 카탈로그)' });
  if (!sbs || sbs.side !== 407) fail(`양문형 도어 오픈 좌우가 ${sbs && sbs.side} (기대 407 = (1726−912)/2)`);
  else if (!install.includes('도어 오픈 시 전체 폭 1,726mm')) fail('양문형 1,726mm 근거가 설치환경 가이드에 없음');
  else if (!four || four.side !== 295) fail(`4도어 도어 측면 여유가 ${four && four.side} (기대 295)`);
  else if (!install.includes('246~295mm')) fail('4도어 246~295mm 근거가 설치환경 가이드에 없음');
  else pass('도어 오픈 좌우 여유 (양문형 407mm · 4도어 295mm) — 원문 대조');

  // 위로 열리는 유형은 평면 구역을 만들지 않는다
  const lid = P.topOpenFor({ cat: '김치냉장고', group: '김치플러스 뚜껑형 (RP 시리즈)' });
  if (!lid) fail('뚜껑형 김치냉장고에 상부 개폐 안내가 없음');
  else if (P.doorZoneFor({ cat: '김치냉장고', group: '김치플러스 뚜껑형 (RP 시리즈)' })) {
    fail('뚜껑형인데 평면 도어 구역을 만듦 — 위로 열리므로 평면에는 영향이 없다');
  } else pass('뚜껑형·통버블은 평면 도어 구역 없음 (상부 개폐 안내만)');

  // 좁은 방에 양문형을 놓으면 하드 실패가 아니라 주의로 잡혀야 한다
  st.walls = [
    { x1: 0, y1: 0, x2: 1400, y2: 0 }, { x1: 1400, y1: 0, x2: 1400, y2: 2000 },
    { x1: 1400, y1: 2000, x2: 0, y2: 2000 }, { x1: 0, y1: 2000, x2: 0, y2: 0 },
  ];
  st.items = [{
    id: 'sbs', label: '양문형', cat: '냉장고', group: '양문형 2도어', size: '', model: 'RS84DB5002WW',
    w: 912, h: 1780, d: 915, clear: P.clearFor('냉장고', '본체'), bx: 700, by: 50, a: 0, warn: [], soft: [],
  }];
  P.evaluate();
  const it = st.items[0];
  if (it.warn.length) fail(`도어 오픈이 하드 실패로 잡힘: ${it.warn.join(', ')}`);
  else if (!it.soft.some((w) => w.includes('도어 오픈'))) fail(`1.4m 폭 방에 양문형(도어 오픈 1,726mm)인데 주의가 없음: ${JSON.stringify(it.soft)}`);
  else pass(`좁은 방의 양문형 — 하드 실패 아닌 주의로 보고 ("${it.soft[0]}")`);

  // 넉넉한 방이면 주의도 없어야 한다
  st.walls = [
    { x1: 0, y1: 0, x2: 4000, y2: 0 }, { x1: 4000, y1: 0, x2: 4000, y2: 3000 },
    { x1: 4000, y1: 3000, x2: 0, y2: 3000 }, { x1: 0, y1: 3000, x2: 0, y2: 0 },
  ];
  st.items[0].bx = 2000;
  P.evaluate();
  if (st.items[0].soft.length) fail(`4m 폭 방인데 도어 오픈 주의가 남음: ${st.items[0].soft.join(', ')}`);
  else pass('넉넉한 방 — 도어 오픈 주의 없음');

  st.items = []; st.walls = [];
}

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
