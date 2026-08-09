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
  // 냉장고 라인업 — 프리스탠딩은 벽 이격, 키친핏은 냉장고장 내측 이격이라 값이 완전히 다르다.
  // 키친핏에 벽 이격 50mm 를 적용하면 실제 주방 대부분이 "안 들어감"이 되어 정반대로 틀린다.
  {
    const free = P.clearFor('냉장고', '본체', 'RM80H64S2A', '4도어 (2026 카탈로그)');
    const fit = P.clearFor('냉장고', '본체', 'RM70F63R2A', '키친핏 Max 4도어');
    if (free.back !== 50) fail(`프리스탠딩 냉장고 후면 이격이 ${free.back}mm (기대 50)`);
    else if (fit.back >= free.back) fail(`키친핏 후면 이격이 ${fit.back}mm — 프리스탠딩(${free.back}mm)보다 작아야 한다`);
    else if (!fit.weak) fail('키친핏 이격에 미확정 표시(weak)가 없다 — 용량대별로 값이 갈린다');
    else pass(`냉장고 라인업 이격 구분 (프리스탠딩 후면 ${free.back}mm · 키친핏 내측 ${fit.back}mm)`);
  }

  /*
   * **키친핏 안에서도 라인업에 따라 갈려야 한다.**
   * 한때 키친핏 전체를 12mm 한 값으로 뭉뚱그렸는데, 그러면 키친핏 Max 의 4mm 가 3배로
   * 부풀려진다 — "이렇게 좁은 자리에도 들어갑니다"가 이 라인업을 파는 이유인데 정반대로
   * 재는 셈이다(사용자 지적). 프리스탠딩의 방열 이격과 달리 키친핏 이격은 끼움 여유라
   * 크게 잡는 것이 안전한 방향이 아니다 — 들어갈 자리를 못 들어간다고 말하게 된다.
   */
  {
    const max = P.clearFor('냉장고', '본체', 'RM70F63R2A', '키친핏 Max 4도어');
    const one = P.clearFor('냉장고', '본체', 'RR40C8995APG', '1도어 냉장 키친핏 (2026 카탈로그)');
    const old4 = P.clearFor('김치냉장고', '본체', 'RQ33DB7441AP', '키친핏 313L (2026 카탈로그)');
    if (max.side !== 4) fail(`키친핏 Max 좌우 이격이 ${max.side}mm (기대 4 — 가이드 "좌/우 단 4mm만 있으면 설치 가능")`);
    else if (one.side !== 4) fail(`1도어 키친핏 좌우 이격이 ${one.side}mm (기대 4 — 신형 Max 기준)`);
    else if (old4.side !== 12) fail(`Infinite·구형 Bespoke 4도어 키친핏 좌우 이격이 ${old4.side}mm (기대 12)`);
    else if (!/4mm만 있으면/.test(max.src || '')) fail('키친핏 Max 이격의 근거 문구가 설치환경 가이드 표현과 다르다');
    else pass(`키친핏 라인업별 이격 (Max·1도어 각 ${max.side}mm · Infinite/구형 4도어 각 ${old4.side}mm)`);
  }

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
  /*
   * 이 스위트는 벽을 mm 좌표로 **직접 꽂아 넣는다.** 실제 앱에서는 벽이 축척 확정을 거쳐
   * 들어오므로(askWallLength·askScale·단지 불러오기가 scaled 를 세운다) 여기서도 그
   * 플래그를 같이 세워야 앱과 같은 상태가 된다. 안 세우면 "축척 없이는 가전을 올리지
   * 않는다"는 안전장치에 걸려 배치 검사가 통째로 무의미해진다.
   */
  st.scaled = true;
  /*
   * 사이즈는 **이름으로** 고른다. 예전에는 배열 인덱스를 썼는데, size-reps 에 항목이
   * 하나 늘거나 정렬 기준이 바뀔 때마다 엉뚱한 제품이 뽑혀 테스트가 무관한 이유로 깨졌다
   * (냉장고에 키친핏 세트 3종이 들어오면서 인덱스 2가 폭 2,495mm 세트가 됐다).
   */
  const pick = (cat, size) => {
    const list = reps.filter((x) => x.cat === cat);
    const r = size ? list.find((x) => x.size === size) : list[0];
    if (!r) throw new Error(`테스트가 찾는 사이즈가 없다: ${cat} ${size} (있는 것: ${list.map((x) => x.size).join(', ')})`);
    return { cat, size: r.size, model: r.options[0].model, part: r.options[0].parts[0] };
  };

  // 3,600 × 2,600mm 주방 — 냉장고 + 김치냉장고 + 식기세척기
  st.walls = room(3600, 2600); st.items = [];
  P.autoPlace([pick('냉장고', '602~640L'), pick('김치냉장고', '126L'), pick('식기세척기', '폭 450mm')]);
  if (st.items.length !== 3) fail(`3.6×2.6m 방에 3종을 넣었는데 ${st.items.length}종만 배치됨`);
  else if (st.items.some((i) => i.warn.length)) {
    fail(`자동 배치인데 경고가 남음: ${st.items.filter((i) => i.warn.length).map((i) => `${i.label}(${i.warn})`).join(', ')}`);
  } else pass('3.6×2.6m 주방에 냉장고·김치냉장고·식기세척기 3종 자동 배치 — 경고 없음');

  /*
   * **배치가 끝나면 도면을 다시 만질 수 있어야 한다.**
   * 방을 확정하면 방을 더 잡을 수 있게 `detect` 모드가 유지되는데, 그대로 배치까지 가면
   * 배치된 가전을 누르는 순간 pointerdown 이 detect 분기에서 return 해 버려
   * **가전을 집을 수가 없었다.** 자동 배치 뒤에는 반드시 idle 로 돌아와야 한다.
   */
  st.walls = room(3600, 2600); st.items = [];
  P.state.mode = 'detect';
  P.autoPlace([pick('냉장고', '602~640L')]);
  if (P.state.mode !== 'idle') fail(`자동 배치 뒤 모드가 '${P.state.mode}' — idle 이어야 가전을 끌 수 있다`);
  else if (P.state.showClean) fail('자동 배치 뒤에도 정리본(마스크)을 보여준다 — 원본 도면으로 돌아와야 한다');
  else pass('자동 배치 뒤 idle 모드 · 원본 도면 — 가전을 끌 수 있는 상태');

  /*
   * ── 도면 밖에 꺼내 두기 ──
   * 이 도구는 상담사가 제품을 도면 안으로 끌고 들어와 설치 느낌을 보여주는 물건이다.
   * 그래서 고른 가전은 자동으로 밀어 넣지 않고 도면 **오른쪽 바깥**에 대기 상태로 세운다.
   * 대기 중에는 방 밖·겹침 판정을 하지 않는다 — 아직 놓은 것이 아니라 경고가 나오면 안 된다.
   */
  st.walls = room(4000, 3000); st.items = [];
  {
    const box = P.planBox();
    const made = P.stageOutside([pick('냉장고', '602~640L'), pick('TV', '65형')]);
    if (made.length !== 2) fail(`꺼내기 2대를 요청했는데 ${made.length}대`);
    else if (!made.every((i) => i.staged)) fail('꺼내 둔 가전에 대기 표시(staged)가 없다');
    else if (!made.every((i) => P.bodyCenter(i)[0] > box.x2)) fail('꺼내 둔 가전이 도면 범위 안에 있다 — 밖에 세워야 한다');
    else if (made.some((i) => i.warn.length)) fail(`대기 중인데 경고가 붙었다: ${made.map((i) => i.warn).flat().join(', ')}`);
    else if (P.bodyCenter(made[0])[1] === P.bodyCenter(made[1])[1]) fail('꺼낸 가전이 같은 자리에 겹쳐 있다 — 세로로 늘어놔야 한다');
    else pass(`도면 밖 대기 배치 — 2대를 도면 오른쪽(x > ${Math.round(box.x2)})에 세로로 세움 · 경고 없음`);
  }

  /*
   * ── 축척 기준 벽은 '창 구간'이 아니라 벽면 전체다 ──
   * `classifyEdges` 가 한 벽면을 [벽토막 | 개구부 | 벽토막] 으로 쪼개 놓기 때문에,
   * "가장 긴 가로 조각"을 고르면 **창 하나를 재게 된다.** 실제 75㎡ 도면에서 침실1 아래
   * 창 구간만 잡혔고, 거기에 3,600을 넣으면 도면 전체 축척이 통째로 틀어졌다(사용자 지적).
   * 벽면의 안목치수는 창이 끼어 있어도 왼쪽 끝에서 오른쪽 끝까지다.
   */
  {
    /*
     * 4,000 × 3,000 방. **가로 벽 둘 다 쪼개 둔다** — 하나라도 통짜로 남으면
     * 조각 단위로 골라도 정답이 나와 이 검사가 버그를 못 잡는다(실제로 한 번 놓쳤다).
     *   아래: [벽 1,200 | 창 1,600 | 벽 1,200]
     *   위  : [벽 1,900 | 문 200 | 벽 1,900]
     * 조각 단위로 고르면 최대 1,900. 벽면 전체로 합치면 4,000.
     */
    const W = 4000, H = 3000;
    const ring = [
      { x1: 0,    y1: H, x2: 1200, y2: H },                 // 아래 벽 왼쪽
      { x1: 1200, y1: H, x2: 2800, y2: H, open: true },     // 창
      { x1: 2800, y1: H, x2: W,    y2: H },                 // 아래 벽 오른쪽
      { x1: W, y1: H, x2: W, y2: 0 },                       // 오른쪽 벽
      { x1: W,    y1: 0, x2: 2100, y2: 0 },                 // 위 벽 오른쪽 1,900
      { x1: 2100, y1: 0, x2: 1900, y2: 0, open: true },     // 문 200
      { x1: 1900, y1: 0, x2: 0,    y2: 0 },                 // 위 벽 왼쪽 1,900
      { x1: 0, y1: 0, x2: 0, y2: H },                       // 왼쪽 벽
    ];
    const run = P.longestHRun(ring);
    if (!run) fail('가로 벽면을 하나도 못 찾았다');
    else if (Math.abs(run.len - W) > 1) {
      fail(`기준 길이가 ${Math.round(run.len)}mm — 방 가로 안목치수 ${W}mm 여야 한다`);
    } else if (Math.abs(run.len - 1600) < 1) {
      fail('창 구간(1,600mm)을 기준으로 잡았다');
    } else {
      /*
       * **배열 시작·끝에 걸친 런도 합쳐져야 한다.** 앞에서 뒤로만 훑으면 두 토막으로 남는다.
       * 위 고리를 한 칸 돌려(아래 벽이 배열 끝과 처음에 걸치게) 같은 답이 나오는지 본다.
       */
      const rot = [...ring.slice(2), ...ring.slice(0, 2)];
      const run2 = P.longestHRun(rot);
      if (!run2 || Math.abs(run2.len - W) > 1) {
        fail(`고리를 돌리니 ${run2 ? Math.round(run2.len) : '없음'} — 닫힌 고리로 안 돌고 있다`);
      } else {
        pass(`축척 기준 벽 = 벽면 전체 ${Math.round(run.len)}mm (창 1,600mm 조각 아님 · 고리 회전에도 동일)`);
      }
    }
  }

  /*
   * ── 축척 없이는 가전을 올리지 않는다 ──
   * 가전 치수는 언제나 mm 인데 **축척 전 도면의 월드 단위는 이미지 픽셀**이다.
   * 둘을 같은 화면에 올리면 크기 관계가 통째로 거짓이 되고, 화면 맞춤이 줌아웃하면서
   * 도면이 눈에 띄게 줄어든다(실측: 854px → 118px). 사용자가 잡아낸 문제다.
   * 화면이 이상해지는 것보다 **"이 자리에 들어갑니다"가 거짓이 되는 것**이 더 큰 문제다.
   */
  {
    st.walls = room(4000, 3000); st.items = [];
    const wasScaled = P.state.scaled, wasMm = P.state.mmPerPx;
    P.state.scaled = false; P.state.mmPerPx = null;
    const made = P.stageOutside([pick('냉장고', '602~640L')]);
    if (made.length || st.items.length) fail(`축척 미확정인데 가전 ${st.items.length}대가 올라갔다`);
    else {
      st.items = [];
      P.autoPlace([pick('냉장고', '602~640L')]);
      if (st.items.length) fail('축척 미확정인데 자동 배치가 됐다');
      else pass('축척 미확정이면 가전을 올리지 않는다 (꺼내기·자동 배치 둘 다)');
    }
    P.state.scaled = wasScaled; P.state.mmPerPx = wasMm;
  }

  /*
   * ── 벽을 넘으면 되돌리지 말고 안쪽으로 밀어 넣는다 ──
   * 예전에는 직전 위치로 되돌려서 벽 근처에서 제품이 손에서 자꾸 빠졌다.
   * 벽에 설치할 수는 없으므로 안쪽으로 옮겨 주는 것이 맞다(사용자가 정한 동작).
   */
  st.walls = room(4000, 3000); st.items = [];
  {
    const q = pick('냉장고', '602~640L');
    P.stageOutside([q]);
    const it = st.items[0];
    it.staged = false; it.a = 0;
    it.bx = 3950; it.by = 1200;          // 오른쪽 벽을 뚫고 나간 자리
    if (!P.escapesRoom(it)) fail('벽을 넘겼는데 방 밖 판정이 안 된다 — 시험 자체가 성립하지 않는다');
    else if (!P.nudgeInside(it)) fail('벽 안쪽으로 밀어 넣지 못했다');
    else if (P.escapesRoom(it)) fail('밀어 넣었다는데 아직 방 밖이다');
    else pass(`벽을 넘으면 안쪽으로 이동 (x ${3950} → ${Math.round(it.bx)})`);
  }

  /*
   * ── 2D 라서 생기는 겹침 예외 ──
   * 사운드바는 TV 아래, 건조기는 세탁기 위에 놓인다. 콤보는 그 자체가 건조까지 하므로 제외다.
   * 이 예외가 없으면 **실제로 되는 설치를 "겹칩니다"로 막는다.**
   */
  {
    const mk = (cat, group, model) => ({ cat, group, model, label: cat });
    const tv = mk('TV', 'Neo QLED', 'KQ65');
    const bar = mk('사운드바', 'Q-시리즈', 'HW-Q');
    const wash = mk('세탁기·콤보', 'AI 세탁기', 'WF25');
    const combo = mk('세탁기·콤보', 'Infinite AI 콤보', 'WD99F25AHR');
    const dry = mk('건조기', 'AI 건조기', 'DV90');
    const fridge = mk('냉장고', '4도어', 'RS80');
    if (!P.stackable(tv, bar)) fail('TV와 사운드바가 겹칠 수 없다고 나온다 — 사운드바는 TV 아래에 단다');
    else if (!P.stackable(bar, tv)) fail('순서를 바꾸면 판정이 달라진다');
    else if (!P.stackable(wash, dry)) fail('세탁기와 건조기가 겹칠 수 없다고 나온다 — 적층 설치가 정상이다');
    else if (P.stackable(combo, dry)) fail('콤보 위에 건조기를 얹을 수 있다고 나온다 — 콤보는 제외해야 한다');
    else if (P.stackable(tv, fridge)) fail('TV와 냉장고가 겹쳐도 된다고 나온다');
    else if (P.stackable(wash, fridge)) fail('세탁기와 냉장고가 겹쳐도 된다고 나온다');
    else pass('겹침 예외 — TV↔사운드바 · 세탁기↔건조기만 허용(콤보 제외)');
  }

  /*
   * **하나씩 직접 놓기.**
   * 상담에서 보고 싶은 것은 대개 "저 자리에 놓으면 어떤 느낌인가"이고, 자동이 자리를
   * 못 찾았을 때 "안 됩니다"로 끝나면 거기서 막힌다. 이 경로(mode 'place' + pending)는
   * 코드에 있었지만 **pending 을 설정하는 진입점이 없어 죽어 있었다.**
   * 한 번 누를 때 한 대씩 놓이고, 대기열이 끝나면 idle 로 돌아와야 한다.
   */
  st.walls = room(6000, 4000); st.items = [];
  const q3 = [pick('냉장고', '602~640L'), pick('김치냉장고', '126L'), pick('식기세척기', '폭 450mm')];
  P.startManual(q3);
  if (P.state.mode !== 'place') fail(`직접 놓기를 시작했는데 모드가 '${P.state.mode}'`);
  else if (!P.state.pending) fail('직접 놓기인데 놓을 제품(pending)이 없다');
  else {
    const order = [P.state.pending.cat];
    P.placeAt(1000, 1000);
    order.push(P.state.pending ? P.state.pending.cat : null);
    P.placeAt(3000, 1000);
    P.placeAt(5000, 1000);
    if (st.items.length !== 3) fail(`직접 놓기로 3번 눌렀는데 ${st.items.length}대만 놓였다`);
    else if (P.state.mode !== 'idle') fail(`다 놓았는데 모드가 '${P.state.mode}' — idle 로 돌아와야 한다`);
    else if (P.state.pending) fail('다 놓았는데 pending 이 남아 있다');
    else if (P.state.queue.length) fail(`대기열이 ${P.state.queue.length}개 남았다`);
    else if (order[0] === order[1]) fail('두 번째로 놓을 제품이 첫 번째와 같다 — 대기열이 안 넘어간다');
    else pass(`직접 놓기 — 누를 때마다 한 대씩 (${order[0]} → ${order[1]} → …) 3대 배치 후 idle 복귀`);
  }

  // 좁은 방에서는 억지로 놓지 않아야 한다
  st.walls = room(1000, 1000); st.items = [];
  P.autoPlace([pick('냉장고', '602~640L'), pick('김치냉장고', '126L')]);
  if (st.items.some((i) => i.warn.length)) fail('좁은 방에 억지로 놓아 경고가 발생 — 자리가 없으면 놓지 않아야 한다');
  else if (st.items.length >= 2) fail(`1×1m 방에 폭 912+595를 둘 다 놓음 — 자리 없음 판정이 동작하지 않는다`);
  else pass(`1×1m 방 — ${st.items.length}종만 배치하고 나머지는 자리 없음으로 남김`);

  /*
   * ── 안 들어가면 "무엇이면 들어가는지" ──
   * "억지로 놓지 않았습니다"로 끝나면 상담이 거기서 멈춘다. 같은 카테고리에서 실제로
   * 들어가는 가장 큰 사이즈를 찾아 줘야 거절이 대안 제시로 바뀐다.
   * **없는 답을 지어내면 안 되므로** findSpot 으로 진짜 놓아 보고 되는 것만 말한다.
   */
  {
    // 대안 찾기는 `state.reps` 를 뒤진다. 앱에서는 가전 선택 시트가 채우지만 여기서는 직접 넣는다.
    P.state.reps = reps;
    st.walls = room(1500, 1500); st.items = [];
    const big = pick('냉장고', '845~905L');          // 912×930 — 이 방에는 이격까지 지킬 수 없다
    const it = { ...big, w: big.part.w, d: big.part.d, cat: '냉장고', size: '845~905L',
      clear: P.clearFor('냉장고', '본체', big.model, big.group), bx: 0, by: 0, a: 0 };
    const alt = P.fitAlternative(it, []);
    if (!alt) fail('1.5×1.5m 방에 냉장고가 안 들어가는데 대안 사이즈를 못 찾았다 (333L 은 들어가야 한다)');
    else if (alt.size === '845~905L') fail('대안이 원래 사이즈와 같다');
    // 폭만 보면 안 된다 — 폭이 같고 **깊이가 줄어** 들어가는 경우가 실제로 있다
    // (845~905L 912×930 → 602~640L 912×716). 자리를 정하는 것은 발자국 넓이다.
    else if (alt.w * alt.d >= big.part.w * big.part.d) {
      fail(`대안(${alt.size} ${alt.w}×${alt.d})의 발자국이 원래(${big.part.w}×${big.part.d})보다 작지 않다`);
    } else pass(`안 들어갈 때 대안 제시 — 845~905L(${big.part.w}×${big.part.d}) 대신 ${alt.size}(${Math.round(alt.w)}×${Math.round(alt.d)}mm)`);

    // 아무리 줄여도 안 되는 방에서는 **없는 답을 지어내지 않아야** 한다
    st.walls = room(300, 300); st.items = [];
    if (P.fitAlternative(it, [])) fail('30×30cm 방인데 들어가는 사이즈가 있다고 한다');
    else pass('자리가 정말 없으면 대안을 지어내지 않는다');
  }

  /*
   * ── 삭제 ──
   * 매장 기기가 태블릿이면 Delete 키가 없다. 목록의 ✕ 가 유일한 삭제 수단이므로
   * 키보드와 버튼이 **같은 함수**를 지나가야 한쪽만 고치는 사고가 안 난다.
   */
  {
    st.walls = room(6000, 4000); st.items = [];
    P.stageOutside([pick('냉장고', '602~640L'), pick('TV', '65형')]);
    const id = st.items[0].id;
    P.removeItem(id);
    if (st.items.length !== 1) fail(`1대를 지웠는데 ${st.items.length}대 남음`);
    else if (st.items.some((i) => i.id === id)) fail('지운 가전이 목록에 남아 있다');
    else { P.removeItem('없는id'); pass('가전 삭제 — 목록에서 빠지고, 없는 id 는 조용히 무시'); }
  }

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

// ── [12] 중첩 차단 ──
// 겹친 채로 놓이는 상태 자체를 만들지 않는다. 설치할 수 없는 배치를 화면에 그려 두면
// 상담 중에 그대로 읽힌다.
{
  const st = P.state;
  st.walls = [
    { x1: 0, y1: 0, x2: 4000, y2: 0 }, { x1: 4000, y1: 0, x2: 4000, y2: 3000 },
    { x1: 4000, y1: 3000, x2: 0, y2: 3000 }, { x1: 0, y1: 3000, x2: 0, y2: 0 },
  ];
  const mk = (id, cat, bx) => ({
    id, label: id, cat, group: '', size: '', model: '',
    w: 600, h: 1800, d: 600, clear: P.clearFor(cat, '본체'),
    bx, by: (P.clearFor(cat, '본체').back || 0), a: 0, warn: [], soft: [],
  });
  st.items = [mk('A', '건조기', 1000), mk('B', '건조기', 2500)];

  // 떨어져 있으면 놓을 수 있다
  if (P.collisionAt(st.items[1])) fail(`1,500mm 떨어져 있는데 막힘: ${P.collisionAt(st.items[1])}`);
  else pass('떨어진 자리 — 배치 허용');

  // 본체가 겹치는 자리는 막는다
  const probe = { ...st.items[1], bx: 1200 };
  const why = P.collisionAt(probe);
  if (!why || !why.includes('겹칩')) fail(`본체가 겹치는데 막지 않음 (${why})`);
  else pass(`본체 겹침 차단 ("${why}")`);

  // 이격거리만 침범해도 막는다 (건조기 좌우 각 20mm → 중심 간 640mm 미만이면 침범)
  const probe2 = { ...st.items[1], bx: 1000 + 610 };
  const why2 = P.collisionAt(probe2);
  if (!why2) fail('이격거리를 침범했는데 막지 않음');
  else pass(`이격 침범 차단 ("${why2}")`);

  // 방 밖도 막는다
  const probe3 = { ...st.items[1], bx: 3900 };
  if (!P.collisionAt(probe3)) fail('방 밖으로 나가는데 막지 않음');
  else pass('방 밖 이탈 차단');

  st.items = []; st.walls = [];
}

// ── [13] 벽 자동 인식 ──
// 도면 선을 추측해 그리지 않고, 밝은 영역을 채워 그 경계를 벽으로 삼는지 확인한다.
{
  const st = P.state;
  const W = 400, H = 300;
  // 흰 바탕에 굵은 검은 사각형 테두리(=벽) 하나. 안쪽은 방.
  const dark = new Uint8Array(W * H);
  const mark = (x0, y0, x1, y1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) dark[y * W + x] = 1;
  };
  mark(50, 40, 350, 48);     // 위 벽
  mark(50, 240, 350, 248);   // 아래 벽
  mark(50, 40, 58, 248);     // 좌 벽
  mark(342, 40, 350, 248);   // 우 벽
  const mask = { w: W, h: H, S: 1, dark };

  const reg = P.floodRegion(mask, 200, 150);      // 방 한가운데
  if (!reg) fail('방 안쪽인데 채우기가 실패');
  else if (reg.border > 0) fail(`방 안에서 채웠는데 도면 바깥까지 새어 나감 (border=${reg.border})`);
  else pass(`방 내부 채우기 (${reg.count.toLocaleString()}px · 바깥 유출 없음)`);

  const poly = P.regionPolygon(mask, reg, 8);
  if (!poly) fail('방 윤곽을 만들지 못함');
  else {
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    // 벽 안쪽 면 기준 283 × 191 (59~341, 49~239)
    if (Math.abs(w - 283) > 6 || Math.abs(h - 191) > 6) {
      fail(`인식된 방 크기가 ${w}×${h} (기대 283×191 ±6) — 벽 안쪽 면을 따라가지 않았다`);
    } else pass(`방 윤곽 인식 ${w}×${h}px (벽 안쪽 면 기준, 모서리 ${poly.length}개)`);
  }

  // 벽 위를 누르면 거부해야 한다
  if (P.floodRegion(mask, 54, 150)) fail('벽 위를 눌렀는데 방으로 인식');
  else pass('벽·글씨 위를 누르면 거부');

  // 벽이 끊긴 도면에서는 바깥으로 새어 나가는 것을 감지해야 한다
  for (let y = 100; y < 140; y++) for (let x = 50; x <= 58; x++) dark[y * W + x] = 0;  // 좌 벽에 구멍
  const leak = P.floodRegion(mask, 200, 150);
  if (!leak || leak.border === 0) fail('벽이 끊겼는데 바깥 유출을 감지하지 못함');
  else pass(`벽이 끊긴 도면 — 바깥 유출 감지 (border=${leak.border})`);

  st.items = []; st.walls = [];
}

// ── [13-b] 윤곽 추적 — 안쪽으로 파인 벽을 건너뛰지 않는가 ──
// 예전에는 줄마다 좌·우 끝점만 읽어 계단으로 압축했다. 그러면 ㄱ자·ㄷ자처럼 파인 부분을
// 직선으로 가로질러 **벽이 실제와 다른 자리에 그려졌다.** 방 안으로 튀어나온 벽이나
// 붙박이장·기둥이 있는 실제 도면에서 그대로 사고가 된다.
{
  const W = 300, H = 200;
  const build = (stub) => {
    const m = new Uint8Array(W * H);
    const box = (x0, y0, x1, y1) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * W + x] = 1;
    };
    box(40, 40, 260, 46); box(40, 154, 260, 160);      // 위·아래 벽
    box(40, 40, 46, 160); box(254, 40, 260, 160);      // 좌·우 벽
    stub(box);
    return { w: W, h: H, S: 1, dark: m };
  };
  // 점이 다각형 안에 있는가 (짝홀 판정)
  const inPoly = (poly, x, y) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };

  // ㄷ자 — 오른쪽 벽에서 방 안으로 벽이 튀어나온 형태
  {
    const mask = build((box) => box(150, 90, 254, 110));
    const reg = P.floodRegion(mask, 60, 100);
    const poly = reg && P.regionPolygon(mask, reg, 6);
    if (!poly) fail('ㄷ자 방의 윤곽을 만들지 못함');
    else if (poly.length !== 8) fail(`ㄷ자 방 모서리가 ${poly.length}개 (기대 8개) — 파인 부분을 가로질렀다`);
    else if (inPoly(poly, 200, 100)) fail('방 안으로 튀어나온 벽(200,100)이 방 안쪽으로 잡혔다 — 여기에 가전을 놓게 된다');
    else pass(`ㄷ자 방 윤곽 인식 (모서리 8개 · 튀어나온 벽을 방에서 제외)`);
  }

  // ㄱ자 — 한쪽 모서리가 통째로 잘린 형태
  {
    const mask = build((box) => box(180, 40, 254, 100));
    const reg = P.floodRegion(mask, 60, 130);
    const poly = reg && P.regionPolygon(mask, reg, 6);
    if (!poly) fail('ㄱ자 방의 윤곽을 만들지 못함');
    else if (poly.length !== 6) fail(`ㄱ자 방 모서리가 ${poly.length}개 (기대 6개)`);
    else if (inPoly(poly, 220, 70)) fail('잘려 나간 모서리(220,70)가 방 안쪽으로 잡혔다');
    else pass('ㄱ자 방 윤곽 인식 (모서리 6개)');
  }

  // 1~2px 요철은 도면 표기(치수선·해칭)이므로 흡수해야 한다
  {
    const mask = build((box) => box(120, 47, 123, 49));   // 위 벽에 붙은 2px 돌기
    const reg = P.floodRegion(mask, 150, 100);
    const poly = reg && P.regionPolygon(mask, reg, 6);
    if (!poly) fail('요철이 있는 방의 윤곽을 만들지 못함');
    else if (poly.length !== 4) fail(`2px 돌기 때문에 모서리가 ${poly.length}개가 됨 — 도면 표기를 벽으로 봤다`);
    else pass('작은 요철은 흡수 (모서리 4개)');
  }
}

// ── [14] 도면 정리(벽만 남기기) ──
// 실제 도면에는 가구·글씨가 있고 문 자리가 뚫려 있다. 정리 없이 채우면 복도를 거쳐
// 도면 바깥까지 새어 나가 "방을 못 찾겠다"가 된다 — 실제로 그렇게 실패했다.
{
  const W = 300, H = 200;
  const mk = () => new Uint8Array(W * H);
  const line = (m, x0, y0, x1, y1, t) => {
    for (let y = y0 - t; y <= y1 + t; y++) for (let x = x0 - t; x <= x1 + t; x++) {
      if (x >= 0 && y >= 0 && x < W && y < H) m[y * W + x] = 1;
    }
  };

  // 굵은 벽(반두께 3 → 7px)과 얇은 가구선(반두께 0 → 1px)
  {
    const m = mk();
    line(m, 100, 100, 200, 100, 3);   // 벽
    line(m, 100, 60, 200, 60, 0);     // 가구선
    const cleaned = P.cleanWalls({ w: W, h: H, dark: m }, 1, 0);
    const wallLeft = cleaned.slice(100 * W, 101 * W).some((v) => v);
    const thinGone = !cleaned.slice(60 * W, 61 * W).some((v) => v);
    if (!wallLeft) fail('열기 반경 1px에 굵은 벽(7px)이 지워짐 — 반경이 벽보다 크면 인식이 통째로 실패한다');
    else if (!thinGone) fail('얇은 가구선(1px)이 남음');
    else pass('열기 — 얇은 선 제거 · 굵은 벽 유지');
  }

  // 닫기로 문 자리를 메운다
  {
    const m = mk();
    line(m, 50, 50, 120, 50, 3);      // 벽 앞부분
    line(m, 160, 50, 250, 50, 3);     // 벽 뒷부분 (120~160 = 40px 틈 = 문 자리)
    const before = P.cleanWalls({ w: W, h: H, dark: m }, 1, 0);
    const after  = P.cleanWalls({ w: W, h: H, dark: m }, 1, 25);
    const gapOpen   = !before[50 * W + 140];
    const gapSealed =  after[50 * W + 140];
    if (!gapOpen) fail('닫기 없이도 틈이 메워져 있음 — 테스트 전제가 틀렸다');
    else if (!gapSealed) fail('닫기 반경 25px로 40px 틈이 메워지지 않음');
    else pass('닫기 — 문 자리(40px) 메움');

    // 닫기가 방을 좁히면 안 된다 (팽창 뒤 침식이라 벽 두께가 보존돼야 한다)
    const thickBefore = [...Array(H).keys()].filter((y) => before[y * W + 80]).length;
    const thickAfter  = [...Array(H).keys()].filter((y) => after[y * W + 80]).length;
    if (Math.abs(thickAfter - thickBefore) > 1) {
      fail(`닫기 후 벽 두께가 ${thickBefore} → ${thickAfter}로 변함 — 방 크기가 왜곡된다`);
    } else pass(`닫기 후에도 벽 두께 유지 (${thickAfter}px)`);
  }

  // 문이 뚫린 방도 인식된다
  {
    const m = mk();
    line(m, 40, 40, 260, 40, 3);      // 위
    line(m, 40, 160, 260, 160, 3);    // 아래
    line(m, 40, 40, 40, 160, 3);      // 좌
    line(m, 260, 40, 260, 90, 3);     // 우 위쪽
    line(m, 260, 130, 260, 160, 3);   // 우 아래쪽 (90~130 = 40px 문)
    const raw = { w: W, h: H, S: 1, dark: m };
    const leak = P.floodRegion(raw, 150, 100);
    if (!leak || leak.border === 0) fail('문이 뚫렸는데 원본에서 유출이 감지되지 않음 — 테스트 전제가 틀렸다');
    else pass(`정리 전 — 문으로 유출 (border=${leak.border})`);

    const sealed = { w: W, h: H, S: 1, dark: P.cleanWalls(raw, 1, 25) };
    const reg = P.floodRegion(sealed, 150, 100);
    if (!reg) fail('정리 후 방을 채우지 못함');
    else if (reg.border > 0) fail(`정리 후에도 유출 (border=${reg.border}) — 문이 메워지지 않았다`);
    else pass(`정리 후 — 문이 뚫린 방도 인식 (${reg.count.toLocaleString()}px, 유출 없음)`);
  }

  // 반경 산정: 열기는 화면 픽셀, 닫기는 실제 치수(mm) 기준으로 여러 단계
  {
    const st = P.state;
    const keep = st.mmPerPx;
    st.mmPerPx = 7.35;
    const r = P.cleanRadii({ w: 900, h: 640, S: 0.75 });
    if (r.openR > 2) fail(`열기 반경이 ${r.openR}px — 도면 선 굵기(5~10px)보다 크면 벽이 지워진다`);
    else if (!Array.isArray(r.closeSteps) || r.closeSteps[0] !== 0) {
      fail('닫기 반경이 0(메우지 않음)부터 시작하지 않음 — 큰 반경부터 쓰면 창문·가까운 선이 뭉갠다');
    } else if (r.closeSteps.length < 4) fail(`닫기 단계가 ${r.closeSteps.length}개 — 너무 성기다`);
    else pass(`정리 반경 (열기 ${r.openR}px · 닫기 단계 ${r.closeSteps.join('/')}px — 작은 것부터 시도)`);
    st.mmPerPx = keep;
  }

  // 개구부(문·창) 분류 — 메워서 만든 구간은 벽이 아니라 문·창으로 표시돼야 한다
  {
    const W2 = 300, H2 = 200;
    const m = new Uint8Array(W2 * H2);
    const box = (x0, y0, x1, y1) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * W2 + x] = 1;
    };
    box(40, 40, 260, 46);      // 위 벽
    box(40, 154, 260, 160);    // 아래 벽
    box(40, 40, 46, 160);      // 좌 벽
    box(254, 40, 260, 90);     // 우 벽 위쪽
    box(254, 130, 260, 160);   // 우 벽 아래쪽 → 90~130이 문
    const base = { w: W2, h: H2, S: 1, dark: m };
    // 방 안쪽 사각형(벽 안쪽 면) — 실제 인식 결과와 같은 형태
    const poly = [[47, 47], [47, 153], [253, 153], [253, 47]];
    const edges = P.classifyEdges(poly, base);
    const opens = edges.filter((e) => e.open);
    if (!opens.length) fail('문 자리를 개구부로 분류하지 못함 — 문이 벽으로 인식된다');
    else {
      // 문은 우측 변(x≈253)의 y 90~130 구간이어야 한다
      const o = opens[0];
      const onRight = Math.abs(o.x1 - 253) < 3 && Math.abs(o.x2 - 253) < 3;
      const yMin = Math.min(o.y1, o.y2), yMax = Math.max(o.y1, o.y2);
      if (!onRight) fail(`개구부가 우측 변이 아님 (x=${o.x1.toFixed(0)}~${o.x2.toFixed(0)})`);
      else if (yMin > 95 || yMax < 125) fail(`개구부 구간이 문 위치(90~130)와 어긋남 (${yMin.toFixed(0)}~${yMax.toFixed(0)})`);
      else pass(`문 자리를 개구부로 분류 (우측 변 ${yMin.toFixed(0)}~${yMax.toFixed(0)}px, 총 ${opens.length}곳)`);
    }
    const solids = edges.filter((e) => !e.open);
    if (solids.length < 3) fail(`실제 벽 구간이 ${solids.length}개 — 벽까지 개구부로 본다`);
    else pass(`벽 구간 ${solids.length}개는 벽으로 유지`);
  }
}

// ── [14-b] 개구부 판정 근거 — "메운 자리"로 가른다 ──
// 예전에는 경계에서 바깥으로 7px 훑어 어두운 것이 없으면 개구부로 봤다. 경계선이 몇 px만
// 밀려도 판정이 뒤집혀 **엉뚱한 자리에 주황 점선이 떴다.** 지금은 닫기가 실제로 메운
// 자리인지를 보고, 근거가 없으면 벽으로 둔다(없는 개구부를 만들지 않는다).
{
  const st = P.state;
  const keep = st.mmPerPx;
  const W = 300, H = 200;
  const raw = new Uint8Array(W * H);
  const box = (x0, y0, x1, y1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) raw[y * W + x] = 1;
  };
  box(40, 40, 260, 46); box(40, 154, 260, 160);
  box(40, 40, 46, 160);
  box(254, 40, 260, 90); box(254, 130, 260, 160);       // 우 벽 90~130 = 문(40px)
  const rawMask = { w: W, h: H, S: 1, dark: raw };
  const base   = { w: W, h: H, S: 1, dark: P.cleanWalls(rawMask, 1, 0) };
  const sealed = { w: W, h: H, S: 1, dark: P.cleanWalls(rawMask, 1, 25) };

  st.mmPerPx = 20;   // 1px = 20mm → 개구부 최소 500mm = 25px, 문 40px는 살아남는다

  // ① 경계선이 4px 안쪽으로 밀려 있어도 판정이 유지돼야 한다
  {
    const poly = [[51, 51], [51, 149], [249, 149], [249, 51]];
    const edges = P.classifyEdges(poly, base, sealed);
    const opens = edges.filter((e) => e.open);
    if (opens.length !== 1) {
      fail(`경계선이 4px 밀렸을 때 개구부가 ${opens.length}곳 (기대 1곳) — 판정이 위치에 흔들린다`);
    } else {
      const o = opens[0];
      const onRight = Math.abs(o.x1 - 249) < 3 && Math.abs(o.x2 - 249) < 3;
      const yMin = Math.min(o.y1, o.y2), yMax = Math.max(o.y1, o.y2);
      if (!onRight) fail(`개구부가 우측 변이 아님 (x=${o.x1.toFixed(0)})`);
      else if (yMin > 95 || yMax < 125) fail(`개구부 구간이 문(90~130)과 어긋남 (${yMin.toFixed(0)}~${yMax.toFixed(0)})`);
      else pass(`경계선이 밀려도 문 자리를 정확히 짚음 (${yMin.toFixed(0)}~${yMax.toFixed(0)}px, 1곳)`);
    }
  }

  // ② 한 벽이 여러 줄로 쪼개져 보고되지 않아야 한다 (모서리를 낀 벽은 별개로 센다)
  {
    const poly = [[47, 47], [47, 153], [253, 153], [253, 47]];
    const edges = P.classifyEdges(poly, base, sealed);
    const solids = edges.filter((e) => !e.open);
    // 위·아래·좌 3개 + 문에 잘린 우측 벽 2개 = 5개.
    // 같은 방향으로 이어지는 같은 종류가 두 줄로 남아 있으면 쪼개진 것이다.
    let split = 0, gap = 0;
    for (let i = 0; i < edges.length; i++) {
      const a = edges[i], b = edges[(i + 1) % edges.length];
      if (Math.hypot(b.x1 - a.x2, b.y1 - a.y2) > 0.6) gap++;
      const cr = (a.x2 - a.x1) * (b.y2 - b.y1) - (a.y2 - a.y1) * (b.x2 - b.x1);
      if (a.open === b.open && Math.abs(cr) < 1e-6) split++;
    }
    if (solids.length !== 5) fail(`벽 구간이 ${solids.length}개 (기대 5개)`);
    else if (split) fail(`같은 벽이 ${split}군데에서 두 줄로 쪼개짐`);
    else if (gap) fail(`구간 사이에 ${gap}군데 빈틈 — 방 경계가 닫히지 않는다`);
    else pass(`벽 구간 ${solids.length}개 · 빈틈 없이 이어짐`);
  }

  // ③ 닫기가 실제 벽 옆에 남긴 얇은 테두리를 개구부로 오해하면 안 된다
  //    (ㄱ자 도면에서 멀쩡한 벽 1,300mm가 통째로 개구부로 뜬 실제 사고)
  {
    const halo = sealed.dark.slice();
    for (let y = 47; y <= 153; y++) halo[y * W + 253] = 1;   // 벽 안쪽 면에 1px 테두리
    const poly = [[47, 47], [47, 153], [253, 153], [253, 47]];
    const edges = P.classifyEdges(poly, base, { w: W, h: H, S: 1, dark: halo });
    const wrong = edges.filter((e) => e.open && Math.abs(e.x1 - 253) < 2
      && Math.min(e.y1, e.y2) > 130);                        // 문(90~130) 바깥의 우측 벽
    if (wrong.length) fail('벽에 남은 1px 테두리를 개구부로 판정 — 멀쩡한 벽이 문이 된다');
    else pass('벽 옆 테두리는 벽으로 유지 (테두리를 지나 실제 벽에 닿는지 끝까지 본다)');
  }

  // ③ 문이라기엔 너무 짧은 틈은 개구부로 보고하지 않는다
  {
    const raw2 = raw.slice();
    for (let y = 40; y <= 46; y++) for (let x = 120; x <= 129; x++) raw2[y * W + x] = 0;  // 위 벽에 10px(=200mm) 틈
    const m2 = { w: W, h: H, S: 1, dark: raw2 };
    const b2 = { w: W, h: H, S: 1, dark: P.cleanWalls(m2, 1, 0) };
    const s2 = { w: W, h: H, S: 1, dark: P.cleanWalls(m2, 1, 25) };
    const poly = [[47, 47], [47, 153], [253, 153], [253, 47]];
    const edges = P.classifyEdges(poly, b2, s2);
    const top = edges.filter((e) => e.open && Math.abs(e.y1 - 47) < 3 && Math.abs(e.y2 - 47) < 3);
    if (top.length) fail(`200mm짜리 틈을 개구부로 보고함 — 문·창이 아니다 (${top.length}곳)`);
    else pass('문·창이라기엔 짧은 틈(200mm)은 벽으로 유지');
  }

  st.mmPerPx = keep;
}

// ── [15-b] 도면 범위와 건물 안쪽 ──
// 도면 바깥에는 치수선이 둘러 있고 그 끝 마커는 굵어 열기에도 살아남는다. 이걸 건물로 보면
// 범위가 통째로 커져 **건물 밖으로 새어 나가도 감지하지 못한다** — 실제로 거실이 세대 전체
// 92㎡로 잡히고 인식 영역이 치수선 구역까지 뻗어 나갔다.
{
  const W = 300, H = 240;
  const mk = () => new Uint8Array(W * H);
  const box = (m, x0, y0, x1, y1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * W + x] = 1;
  };
  const ring = (m, x0, y0, x1, y1, t) => {
    box(m, x0, y0, x1, y0 + t); box(m, x0, y1 - t, x1, y1);
    box(m, x0, y0, x0 + t, y1); box(m, x1 - t, y0, x1, y1);
  };

  // 건물(굵은 링) + 도면 바깥 사방의 치수선 마커
  {
    const m = mk();
    ring(m, 60, 50, 240, 190, 5);
    for (const [x, y] of [[20, 30], [280, 30], [20, 210], [280, 210], [150, 20], [150, 220]]) {
      box(m, x - 3, y - 3, x + 3, y + 3);        // 굵은 치수 마커
    }
    const bb = P.structureBox(m, W, H);
    const tight = bb.x0 >= 55 && bb.y0 >= 45 && bb.x1 <= 245 && bb.y1 <= 195;
    if (!tight) fail(`도면 범위가 ${bb.x0},${bb.y0}~${bb.x1},${bb.y1} — 치수선 마커까지 건물로 봤다`);
    else pass(`도면 범위 = 건물만 (${bb.x0},${bb.y0}~${bb.x1},${bb.y1} · 치수 마커 제외)`);
  }

  // 창의 유리선이 살아 있는 원본에서는 외벽 링이 이어져 건물 안쪽이 잡힌다
  {
    const m = mk();
    ring(m, 60, 50, 240, 190, 5);
    for (let x = 120; x <= 180; x++) { for (let y = 50; y <= 55; y++) m[y * W + x] = 0; } // 창 = 벽을 비움
    for (let x = 120; x <= 180; x++) m[52 * W + x] = 1;                                   // 유리선(가는 선)
    const env = P.envelopeMask(m, W, H, 1000);
    if (!env) fail('유리선이 이어져 있는데 건물 안쪽을 못 잡았다 — 창으로 새어 나간다');
    else if (!env[120 * W + 150]) fail('방 안인데 건물 밖으로 봤다');
    else if (env[10 * W + 10]) fail('도면 바깥인데 건물 안으로 봤다');
    else pass('창의 유리선까지 벽으로 보고 건물 안쪽을 잡는다 ("창문까지가 벽")');

    // 외벽이 실제로 뚫린 도면에서는 근거가 없으므로 쓰지 않는다(예전 동작으로 되돌아간다)
    for (let x = 120; x <= 180; x++) m[52 * W + x] = 0;                                   // 유리선까지 제거
    const none = P.envelopeMask(m, W, H, 1000);
    if (none) fail('외벽이 뚫렸는데 건물 안쪽을 잡았다고 한다');
    else pass('외벽이 실제로 뚫린 도면에서는 건물 안쪽 판정을 쓰지 않는다');
  }
}

// ── [15-c] 경계 직접 수정 — 벽을 끌어서 고친다 ──
// 자동 인식은 초안이다. 도면 표기가 관례를 벗어나면 어떤 규칙으로도 정확히 맞출 수 없으므로
// 사용자가 벽을 끌어 고칠 수 있어야 한다. 이것이 마지막 안전망이다.
{
  const st = P.state;
  const rect = (x, y, w, h) => [
    { x1: x, y1: y, x2: x + w, y2: y }, { x1: x + w, y1: y, x2: x + w, y2: y + h },
    { x1: x + w, y1: y + h, x2: x, y2: y + h }, { x1: x, y1: y + h, x2: x, y2: y },
  ];
  st.items = []; st.walls = []; st.rooms = []; st.roomSel = null; st.zoom = 0.1;
  const rm = P.addRoom('침실2', rect(0, 0, 3000, 4000));
  const part = rm.parts[0];

  // 모서리를 끌면 그 점이 움직인다
  {
    const hit = P.hitBoundary(0, 0);
    if (!hit || hit.kind !== 'v') fail(`모서리(0,0)를 못 잡는다 (${hit && hit.kind})`);
    else {
      P.moveVertex(hit, -500, -300);
      const pts = P.partPoints(part);
      const moved = pts[hit.idx];
      if (Math.abs(moved[0] + 500) > 1 || Math.abs(moved[1] + 300) > 1) {
        fail(`모서리가 (${moved[0].toFixed(0)},${moved[1].toFixed(0)})로 갔다 (기대 -500,-300)`);
      } else pass('모서리를 끌면 그 점이 움직인다');
      P.moveVertex(hit, 0, 0);
    }
  }

  // 이웃과 축이 거의 맞으면 맞춰 준다 (도면은 대부분 직각이다)
  {
    const hit = P.hitBoundary(0, 0);
    P.moveVertex(hit, 60, 4000 - 70);                  // 아래 모서리와 x·y가 조금씩 어긋나게
    const pts = P.partPoints(part);
    const nb = pts[(hit.idx - 1 + pts.length) % pts.length];
    const cur = pts[hit.idx];
    if (Math.abs(cur[0] - 0) > 1 && Math.abs(cur[0] - nb[0]) > 1) fail('축 스냅이 걸리지 않았다');
    else pass('모서리를 옮길 때 이웃과 축을 맞춰 준다 (120mm 이내)');
    P.moveVertex(hit, 0, 0);
  }

  // 벽을 끌면 수직 방향으로 밀리고 양옆 벽이 따라 늘어난다
  {
    const before = P.roomArea(rm) / 1e6;
    const hit = P.hitBoundary(1500, 4000);             // 아래 벽 한가운데
    if (!hit || hit.kind !== 'e') fail(`벽을 못 잡는다 (${hit && hit.kind})`);
    else {
      P.moveEdge(hit, 800, 1000);                      // 벽과 나란한 성분(800)은 무시돼야 한다
      const pts = P.partPoints(part);
      const after = P.roomArea(rm) / 1e6;
      const grew = Math.abs(after - (before + 3.0)) < 0.2;   // 3m 폭 × 1m = 3㎡
      const straight = Math.abs(pts[hit.idx][1] - pts[(hit.idx + 1) % pts.length][1]) < 1;
      if (!grew) fail(`벽을 1m 밀었는데 넓이가 ${before.toFixed(1)} → ${after.toFixed(1)}㎡ (기대 +3.0)`);
      else if (!straight) fail('벽을 밀었더니 기울어졌다 — 법선 방향으로만 움직여야 한다');
      else pass(`벽을 끌면 수직으로만 밀린다 (${before.toFixed(1)} → ${after.toFixed(1)}㎡)`);
      P.moveEdge(hit, 0, -1000);
    }
  }

  // 벽을 그냥 누르면 개구부(문·창)로 바뀐다
  {
    const hit = P.hitBoundary(1500, 4000);
    const was = !!part.walls[hit.idx].open;
    P.toggleEdgeOpen(hit);
    if (part.walls[hit.idx].open === was) fail('벽 ↔ 개구부 전환이 안 된다');
    else {
      const synced = P.state.walls.some((w) => w.open);
      if (!synced) fail('개구부로 바꿨는데 전체 경계에 반영되지 않았다 (syncWalls)');
      else pass('벽을 누르면 개구부(문·창)로 바뀐다');
      P.toggleEdgeOpen(hit);
    }
  }
  st.items = []; st.walls = []; st.rooms = []; st.roomSel = null;
}

// ── [16] 방(공간) 모델 — 여러 방 · 이름 · 방별 배치 ──
// 한 세대에는 방이 여럿이고, 가전은 "어느 방에 놓을 것인가"가 정해져 있어야 한다.
// 침실2가 꽉 찼다고 거실까지 못 쓴다고 말하면 안 되고, 냉장고를 침실에 놓아서도 안 된다.
{
  const st = P.state;
  const rect = (x, y, w, h) => [
    { x1: x, y1: y, x2: x + w, y2: y }, { x1: x + w, y1: y, x2: x + w, y2: y + h },
    { x1: x + w, y1: y + h, x2: x, y2: y + h }, { x1: x, y1: y + h, x2: x, y2: y },
  ];
  st.items = []; st.walls = []; st.rooms = []; st.roomSel = null;

  const a = P.addRoom('거실', rect(0, 0, 5000, 4000));
  const b = P.addRoom('침실2', rect(6000, 0, 3000, 3000));
  if (st.rooms.length !== 2) fail(`방이 ${st.rooms.length}개 (기대 2개)`);
  else if (st.walls.length !== 8) fail(`합쳐진 경계가 ${st.walls.length}구간 (기대 8구간) — syncWalls가 안 돌았다`);
  else pass('방 2개 등록 · 경계 합산 (거실 20.0㎡ · 침실2 9.0㎡)');

  if (Math.abs(P.roomArea(a) / 1e6 - 20) > 0.1) fail(`거실 넓이 ${(P.roomArea(a)/1e6).toFixed(1)}㎡ (기대 20.0)`);
  else if (Math.abs(P.roomArea(b) / 1e6 - 9) > 0.1) fail(`침실2 넓이 ${(P.roomArea(b)/1e6).toFixed(1)}㎡ (기대 9.0)`);
  else pass('방별 넓이 계산');

  // 방 판정 — 점이 어느 방에 속하는가
  if (!P.inRoom(a, 2500, 2000) || P.inRoom(a, 7000, 1500)) fail('inRoom이 방 경계를 잘못 본다');
  else if ((P.roomAt(7000, 1500) || {}).name !== '침실2') fail('roomAt이 엉뚱한 방을 돌려준다');
  else pass('점 → 방 판정 (roomAt)');

  // 가전이 자기 방을 벗어나면 그 방 이름으로 경고한다
  const fridge = { id: 'x1', label: '냉장고', room: b.id, w: 900, h: 1850, d: 700,
    clear: { back: 50, side: 0, front: 0 }, bx: 7500, by: 100, a: 0, warn: [] };
  st.items = [fridge];
  if (P.collisionAt(fridge)) fail(`침실2 안인데 막혔다 (${P.collisionAt(fridge)})`);
  else {
    const out = { ...fridge, bx: 2500, by: 2000 };            // 거실 한가운데 = 침실2 밖
    const why = P.collisionAt(out);
    if (!why) fail('다른 방으로 넘어갔는데 막지 않음');
    else if (!/침실2/.test(why)) fail(`경고에 방 이름이 없다 ("${why}")`);
    else pass(`방 밖 판정에 방 이름이 붙는다 ("${why}")`);
  }

  // 자동 배치는 지정한 방 안에서만 자리를 찾는다
  {
    const it = { id: 'x2', label: 'TV', room: a.id, w: 1200, h: 700, d: 300,
      clear: { back: 15, side: 100, front: 0 }, bx: 0, by: 0, a: 0, warn: [] };
    st.items = [];
    const spot = P.findSpot(it, []);
    if (!spot) fail('거실에 자리가 있는데 못 찾음');
    else if (!P.inRoom(a, spot.bx, spot.by)) fail(`거실을 지정했는데 (${spot.bx.toFixed(0)},${spot.by.toFixed(0)})에 놓았다`);
    else pass('자동 배치가 지정한 방 안에서만 자리를 찾는다');
  }

  // 한 방이 여러 조각일 수 있다 — 자동 인식이 절반만 잡았을 때 나머지를 이어 붙인다
  {
    b.parts.push({ walls: rect(6000, 3000, 3000, 2000) });    // 침실2에 발코니 조각을 이어 붙임
    P.syncWalls();
    if (!P.inRoom(b, 7500, 4000)) fail('이어 붙인 조각이 방으로 인정되지 않는다');
    else if (Math.abs(P.roomArea(b) / 1e6 - 15) > 0.1) fail(`이어 붙인 뒤 넓이 ${(P.roomArea(b)/1e6).toFixed(1)}㎡ (기대 15.0)`);
    else pass('방 조각 이어 붙이기 (9.0 + 6.0 = 15.0㎡)');

    const big = { id: 'x3', label: '장롱', room: b.id, w: 2400, h: 2300, d: 600,
      clear: { back: 0, side: 0, front: 0 }, bx: 0, by: 0, a: 0, warn: [] };
    st.items = [];
    const spot = P.findSpot(big, []);
    if (!spot) fail('이어 붙인 조각을 포함하면 자리가 있는데 못 찾음');
    else pass('이어 붙인 조각에서도 자리를 찾는다');
  }

  // 카테고리 → 기본 방 (이름으로 맞춘다)
  {
    st.rooms = [];
    const kitchen = P.addRoom('주방', rect(0, 0, 4000, 3000));
    const bed = P.addRoom('침실1', rect(5000, 0, 3000, 3000));
    if (P.defaultRoomFor('냉장고') !== kitchen.id) fail('냉장고의 기본 방이 주방이 아니다');
    else if (P.defaultRoomFor('에어드레서') !== bed.id) fail('에어드레서의 기본 방이 침실이 아니다');
    else pass('가전 카테고리별 기본 방 (냉장고 → 주방 · 에어드레서 → 침실1)');
  }

  // 방이 없으면 예전 그대로 state.walls만 본다 (직접 그리기 경로)
  {
    st.rooms = []; st.roomSel = null;
    st.walls = rect(0, 0, 4000, 3000);
    const it = { id: 'x4', label: 'TV', w: 1200, h: 700, d: 300,
      clear: { back: 0, side: 0, front: 0 }, bx: 2000, by: 100, a: 0, warn: [] };
    st.items = [it];
    if (P.collisionAt(it)) fail('방 없이 벽만 있을 때 판정이 달라졌다');
    else if (!P.collisionAt({ ...it, bx: 9000 })) fail('방 없이 벽만 있을 때 방 밖 판정이 안 된다');
    else pass('방을 안 만든 경우(직접 그리기)는 예전과 동일하게 동작');
  }
  st.items = []; st.walls = []; st.rooms = []; st.roomSel = null;
}

// ── [15] 자동 배치가 도어 열림·개구부를 고려하는지 ──
{
  const st = P.state;
  const room = (w, h) => [
    { x1: 0, y1: 0, x2: w, y2: 0 }, { x1: w, y1: 0, x2: w, y2: h },
    { x1: w, y1: h, x2: 0, y2: h }, { x1: 0, y1: h, x2: 0, y2: 0 },
  ];
  /*
   * 이 스위트는 벽을 mm 좌표로 **직접 꽂아 넣는다.** 실제 앱에서는 벽이 축척 확정을 거쳐
   * 들어오므로(askWallLength·askScale·단지 불러오기가 scaled 를 세운다) 여기서도 그
   * 플래그를 같이 세워야 앱과 같은 상태가 된다. 안 세우면 "축척 없이는 가전을 올리지
   * 않는다"는 안전장치에 걸려 배치 검사가 통째로 무의미해진다.
   */
  st.scaled = true;
  const pickSbs = () => {
    const r = reps.filter((x) => x.cat === '냉장고').find((x) => x.options.some((o) => /양문형/.test(o.group)));
    const o = r.options.find((q) => /양문형/.test(q.group));
    return { cat: '냉장고', size: r.size, model: o.model, group: o.group, part: o.parts[0] };
  };

  // 넓은 방: 양문형(도어 오픈 좌우 407mm)을 놓아도 주의가 없어야 한다
  st.walls = room(6000, 4000); st.items = [];
  P.autoPlace([pickSbs()]);
  if (!st.items.length) fail('6×4m 방에 양문형을 놓지 못함');
  else if (st.items[0].soft.some((w) => w.includes('도어 오픈'))) {
    fail(`넓은 방인데 도어 오픈 주의가 남음 — 도어 공간을 피해 놓지 않았다: ${st.items[0].soft.join(', ')}`);
  } else pass('자동 배치가 도어 오픈 공간까지 비워 놓음');

  // 개구부(문) 앞에는 놓지 않는다
  st.walls = room(3000, 3000); st.items = [];
  st.walls[0].open = true;                       // 위쪽 벽 전체가 문·창이라고 가정
  P.autoPlace([{ cat: '건조기', size: '', model: 'X', group: '',
    part: { part: '본체', w: 600, h: 1800, d: 600 } }]);
  const onOpening = st.items.some((it) => st.walls.filter((w) => w.open)
    .some((w) => P.segHitsPoly(w, P.corners(it))));
  if (!st.items.length) fail('3×3m 방인데 아무 데도 놓지 못함');
  else if (onOpening) fail('문·창(개구부) 앞에 가전을 붙였다 — 문이 안 열린다');
  else pass('개구부 앞은 피해서 배치');
  st.walls.forEach((w) => { delete w.open; });

  st.items = []; st.walls = [];
}

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
