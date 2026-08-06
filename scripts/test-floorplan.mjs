// 도면 배치 시뮬레이터 회귀 테스트
// 실행: node scripts/test-floorplan.mjs   (npm run test:floorplan)
//
// 인식 엔진(FP)은 캔버스를 쓰지 않는 순수 함수라, 합성 도면(직접 그린 비트맵)으로
// 결정적으로 검증할 수 있다. 실제 분양 도면은 인식률 튜닝이 필요하지만, 알고리즘이
// 무너지는 회귀(외벽이 깎여 방이 안 잡힘, 개구부 오분류, 오목한 방 라벨이 밖으로 나감 등)는
// 여기서 전부 잡힌다.
//
// PART A 배치 DB 최신성   — 커밋된 placement-db.json == 지금 재생성한 것
// PART B 이격규칙 근거     — 모든 수치가 INSTALL_DB 원문에 존재
// PART C 인식 엔진        — 합성 도면으로 벽·개구부·방·라벨·벽면 검증
// PART D 배치 판정        — 치수·이격으로 되고 안 되는 것이 갈리는지

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DB_PATH = path.join(ROOT, 'public', 'placement-db.json');

let ok = true;
const fail = (msg) => { console.log('ERROR:', msg); ok = false; };

// ── 엔진 로드 ──────────────────────────────────────────────────────────────
// floorplan-app.html 의 인라인 스크립트를 jsdom 으로 실행해 전역 FP 를 꺼낸다
// (다른 모듈 테스트와 같은 패턴).
const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'public', 'floorplan-app.html'), 'utf8'), {
  runScripts: 'dangerously', url: 'https://example.com/',
});
const FP = dom.window.FP;
const ROOM_TYPES = dom.window.ROOM_TYPES;
if (!FP) { fail('floorplan-app.html 에서 FP 엔진을 로드하지 못함'); process.exit(1); }

// ── PART A. 배치 DB 최신성 ─────────────────────────────────────────────────
// install-app.html·finder-app.html 을 고치고 재생성을 잊으면 배치가 옛 치수로 돌아간다.
// test-search.mjs 가 검색 인덱스에 대해 하는 것과 같은 검사다.
console.log('── PART A. 배치 DB 최신성 ──');
{
  const committed = fs.readFileSync(DB_PATH, 'utf8');
  execFileSync('node', [path.join(__dirname, 'build-placement.mjs')], { cwd: ROOT, stdio: 'pipe' });
  const rebuilt = fs.readFileSync(DB_PATH, 'utf8');
  // generatedAt 은 실행일이라 날짜만 다른 것은 차이로 보지 않는다
  const strip = (s) => s.replace(/"generatedAt":\s*"[^"]*"/, '');
  if (strip(committed) !== strip(rebuilt)) {
    fs.writeFileSync(DB_PATH, committed, 'utf8');   // 테스트가 커밋본을 덮어쓰지 않도록 복원
    fail('placement-db.json 이 최신이 아님 — npm run build:placement 후 커밋할 것');
  } else {
    console.log('OK: placement-db.json 이 install-app/finder-app 과 동기화됨');
  }
}

const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

// ── PART B. 이격규칙 근거 ──────────────────────────────────────────────────
// build-placement.mjs 가 근거 문자열을 대조하고 실패 시 exit 1 하므로 PART A 에서
// 이미 통과했지만, 규칙 자체가 배치에 쓸 수 있는 모양인지 여기서 한 번 더 본다.
console.log('\n── PART B. 이격규칙 ──');
{
  if (db.clearance.length < 15) fail(`이격규칙이 ${db.clearance.length}종뿐 — 최소 15종 유지`);
  let bad = 0;
  for (const r of db.clearance) {
    if (!r.verify || !r.verify.length) { fail(`${r.category}: 근거 문자열(verify)이 없음`); bad++; continue; }
    if (!r.note) { fail(`${r.category}: 값 선택 근거(note)가 없음`); bad++; continue; }
    const nums = ['rear', 'side', 'front', 'top', 'bottom', 'minDepth', 'doorSwing'].filter((k) => typeof r[k] === 'number');
    if (!nums.length && !r.faucetMainMax && !r.doorAngle) { fail(`${r.category}: 숫자 규칙이 하나도 없음`); bad++; }
  }
  if (!bad) console.log(`OK: 이격규칙 ${db.clearance.length}종 전부 근거·수치 보유`);

  // 방 타입이 지목하는 규칙이 실제로 존재해야 한다(오타·이름 변경 감지)
  const known = new Set(db.clearance.map((c) => c.category));
  for (const t of ROOM_TYPES) {
    const missing = t.rules.filter((r) => !known.has(r));
    if (missing.length) fail(`방 타입 "${t.name}" 이 없는 규칙을 가리킴: [${missing.join(', ')}]`);
  }
  // 규칙마다 배치할 제품이 실제로 있어야 한다
  for (const c of db.clearance) {
    const n = db.products.filter((p) => p.rule === c.category).length;
    if (n === 0 && ROOM_TYPES.some((t) => t.rules.includes(c.category))) {
      fail(`"${c.category}" 은 방 타입에 배정돼 있는데 치수 보유 제품이 0종`);
    }
  }
  console.log(`OK: 방 타입 ${ROOM_TYPES.length}종의 규칙 참조와 제품 매칭 정합`);
}

// ── PART B-2. 유사 치수 통합 ───────────────────────────────────────────────
// 통합은 추천 목록에서 사실상 같은 제품이 여러 줄로 뜨는 것을 막는다. 다만 잘못 묶으면
// 실재하지 않는 치수로 판정하게 되므로 불변식을 못박아 둔다.
console.log('\n── PART B-2. 유사 치수 통합 ──');
{
  const TOL = db.consolidation.dimToleranceMm;
  const PCT = db.consolidation.dimTolerancePct || 0;
  const axisTol = (v) => Math.max(TOL, PCT * v);
  if (!(TOL > 0)) fail('통합 허용오차가 기록돼 있지 않음');
  if (!(db.consolidation.after < db.consolidation.before)) {
    fail(`통합이 실제로 줄이지 못함 (${db.consolidation.before} → ${db.consolidation.after})`);
  } else {
    console.log(`OK: ${db.consolidation.before}종 → ${db.consolidation.after}종으로 통합 (허용오차 ${TOL}mm)`);
  }

  let bad = 0;
  for (const p of db.products) {
    if (!p.repDims) { fail(`${p.model}: 대표 모델 실측치(repDims)가 없음`); bad++; continue; }
    // 판정용 dims 는 대표 실측치보다 작으면 안 된다(작으면 안 들어가는 걸 된다고 하게 된다)
    if (p.dims.some((v, i) => v < p.repDims[i])) {
      fail(`${p.model}: 판정 치수가 대표 실측치보다 작음 ${p.dims} < ${p.repDims}`); bad++; continue;
    }
    // 그렇다고 허용오차를 넘게 부풀려도 안 된다(들어가는 걸 안 된다고 하게 된다)
    if (p.dims.some((v, i) => v - p.repDims[i] > axisTol(v))) {
      fail(`${p.model}: 판정 치수가 실측치보다 허용오차 넘게 큼 ${p.dims} vs ${p.repDims}`); bad++; continue;
    }
    if (!p.mergedModels || p.mergedModels.length !== p.mergedCount) {
      fail(`${p.model}: 통합된 모델 목록이 개수와 안 맞음`); bad++;
    }
  }
  if (!bad) console.log(`OK: 제품 ${db.products.length}종 전부 판정치수 ≥ 실측치수 이고 초과분이 ${TOL}mm 이내`);

  // 완전 연결 군집화는 "클러스터 안의 모든 쌍이 허용오차 이내"를 보장하지만,
  // "서로 다른 클러스터의 모든 쌍이 허용오차 밖"까지 보장하지는 않는다(경계에 걸친 항목은
  // 어느 한쪽에만 들어간다). 그러므로 클러스터 간 중복 부재를 요구하면 안 되고,
  // 대신 통합이 실제로 목록을 의미 있게 줄였는지를 본다.
  const ratio = db.consolidation.after / db.consolidation.before;
  if (ratio > 0.6) fail(`통합 효과가 약함 — ${db.consolidation.before}종 중 ${db.consolidation.after}종이 남음`);
  else console.log(`OK: 목록이 ${Math.round((1 - ratio) * 100)}% 줄어 추천에 같은 크기가 반복되지 않음`);

  // 사용자의 원래 불만은 "같은 크기가 여러 줄로 뜬다"였다. 그러니 개수 상한이 아니라
  // "용량 클래스 하나당 대표가 몇 개냐"를 봐야 한다. TV 처럼 같은 화면크기에 벽걸이형·
  // 스탠드형(The Serif)이 공존하는 정당한 경우가 있으므로 클래스당 3종까지는 허용한다.
  const byRule = {};
  for (const p of db.products) (byRule[p.rule] ??= []).push(p);
  // 단, 용량을 못 뽑는 카테고리(에어컨은 냉방면적 ㎡, 공기청정기도 마찬가지)에서는
  // 클래스 수가 의미가 없으므로 이 검사를 적용하지 않는다. 대부분 용량이 있는 규칙만 본다.
  let fatRule = null;
  let ruleChecked = 0;
  for (const [rule, list] of Object.entries(byRule)) {
    const withCap = list.filter((p) => p.capacity);
    if (withCap.length < list.length * 0.8) continue;
    ruleChecked++;
    const n = Math.max(1, new Set(withCap.map((p) => p.capacity.value)).size);
    if (list.length > n * 3) fatRule = `${rule}: 용량 클래스 ${n}종인데 대표가 ${list.length}종`;
  }
  if (fatRule) fail(`같은 크기가 여러 줄로 남아 있음 — ${fatRule}`);
  else console.log(`OK: 용량이 확인되는 ${ruleChecked}개 설치유형에서 클래스당 대표 3종 이하 (같은 크기 반복 없음)`);

  // 폼팩터가 다른 것을 억지로 합치지 않았는지 — 김치냉장고 490L 은 폭 799/950 두 계열이 공존한다
  const kim490 = db.products.filter((p) => p.rule === '김치냉장고' && p.capacity && p.capacity.value === 490);
  if (kim490.length < 2) {
    fail('김치냉장고 490L 이 하나로 합쳐짐 — 폭 799 계열과 950 계열은 다른 폼팩터라 합치면 실재하지 않는 치수가 된다');
  } else {
    console.log(`OK: 김치냉장고 490L 은 폼팩터별로 ${kim490.length}종 유지 (폭 ${kim490.map((p) => p.dims[0]).join(' / ')})`);
  }

  // 용량 추출이 엉뚱한 항목을 집지 않았는지 — 식기세척기 "물 사용량 1.1L" 를 용량으로 오인한 적이 있다
  const dish = db.products.filter((p) => p.rule === '식기세척기' && p.capacity);
  const badUnit = dish.filter((p) => p.capacity.unit === 'L');
  if (badUnit.length) {
    fail(`식기세척기 용량이 L 로 잡힘 (${badUnit.map((p) => p.model + ':' + p.capacity.value + 'L').join(', ')}) — 물 사용량을 용량으로 오인한 것`);
  } else {
    console.log('OK: 식기세척기 용량에 물 사용량(L)이 섞이지 않음');
  }
}

// ── 합성 도면 만들기 ───────────────────────────────────────────────────────
/**
 * 흰 바탕에 검은 선으로 평면도를 그린다. 반환값은 FP.binarize 가 받는 형태.
 * 벽 두께 3px, 이미지 120×80.
 */
function makePlan({ withWindow = true, withDoor = true, lShaped = false } = {}) {
  const w = 120, h = 80;
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  const set = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = (y * w + x) * 4;
    data[p] = data[p + 1] = data[p + 2] = 0; data[p + 3] = 255;
  };
  const rect = (x0, y0, x1, y1, t) => {
    for (let k = 0; k < t; k++) {
      for (let x = x0; x <= x1; x++) { set(x, y0 + k); set(x, y1 - k); }
      for (let y = y0; y <= y1; y++) { set(x0 + k, y); set(x1 - k, y); }
    }
  };
  const vline = (x, y0, y1, t) => { for (let k = 0; k < t; k++) for (let y = y0; y <= y1; y++) set(x + k, y); };

  rect(4, 4, w - 5, h - 5, 3);            // 외벽
  vline(58, 4, h - 5, 3);                  // 가운데 세로 칸막이 → 방 2개

  // 칸막이에 문(빈 틈) — 벽을 지운다
  if (withDoor) {
    for (let k = 0; k < 3; k++) for (let y = 34; y <= 44; y++) {
      const p = (y * w + (58 + k)) * 4;
      data[p] = data[p + 1] = data[p + 2] = 255;
    }
    // 문 열림 호를 성기게 그린다(잉크비가 낮아 'door' 로 분류돼야 함)
    for (let a = 0; a < 90; a += 12) {
      const rad = (a * Math.PI) / 180;
      set(Math.round(58 + 10 * Math.cos(rad)), Math.round(34 + 10 * Math.sin(rad)));
    }
  }
  // 위쪽 외벽에 창문 — 벽을 지우고 그 자리에 이중선을 촘촘히 넣는다(잉크비가 높아 'window')
  if (withWindow) {
    for (let k = 0; k < 3; k++) for (let x = 20; x <= 34; x++) {
      const p = ((4 + k) * w + x) * 4;
      data[p] = data[p + 1] = data[p + 2] = 255;
    }
    for (let x = 20; x <= 34; x++) { set(x, 4); set(x, 6); }
  }
  // 왼쪽 방 한가운데에 기둥을 세운다. 방이 기둥을 감싸는 고리 모양이 되어
  // 무게중심은 기둥 안(= 방 바깥)에 떨어진다 — 라벨 위치 로직의 진짜 시험대다.
  if (lShaped) {
    for (let y = 24; y <= 58; y++) for (let x = 16; x <= 46; x++) set(x, y);
  }
  return { w, h, data };
}

// ── PART C. 인식 엔진 ──────────────────────────────────────────────────────
console.log('\n── PART C. 인식 엔진 (합성 도면) ──');

// 닫힘 반경 r 은 폭 2r 까지만 메운다. 문 틈 11px 를 메우기에 r=7 이면 충분하고,
// 창문(15px)은 닫힘이 아니라 bridgeLines 로 잡히므로 r 을 키울 필요가 없다.
// 이 값으로 통과한다는 것 자체가 "창문은 닫힘에 의존하지 않는다"는 증거다.
const GAP_R = 7;

{
  const img = makePlan();
  const ink = FP.binarize(img);
  const wall = FP.detectWalls(ink, img.w, img.h, { thin: 1 });

  if (!wall.some((v) => v)) fail('벽 검출 결과가 비어 있음');
  else console.log('OK: 3px 벽이 열림 연산 후에도 살아남음');

  const { openings } = FP.findOpenings(wall, ink, img.w, img.h, { gapR: GAP_R });
  const types = openings.map((o) => o.type).sort();
  const win = openings.filter((o) => o.type === 'window').length;
  const door = openings.filter((o) => o.type === 'door').length;
  if (win < 1) fail(`창문을 인식하지 못함 (검출된 개구부: ${JSON.stringify(types)})`);
  else console.log(`OK: 창문 ${win}개를 가상벽으로 인식 (이중선 잉크비로 판정)`);
  if (door < 1) fail(`문을 인식하지 못함 (검출된 개구부: ${JSON.stringify(types)})`);
  else console.log(`OK: 문 ${door}개를 가상벽으로 인식 (열림 호 잉크비로 판정)`);

  const sealed = FP.sealWalls(wall, openings, img.w, img.h);
  const rooms = FP.detectRooms(sealed, img.w, img.h, { minAreaPx: 60 });
  if (rooms.length !== 2) fail(`방이 2개여야 하는데 ${rooms.length}개 검출 — 가상벽 폐합 실패 가능`);
  else console.log('OK: 가상벽으로 폐합해 방 2개 검출');

  // 가상벽 없이 flood fill 하면 방이 뭉개지는지 — 요구사항 1의 근거가 성립하는지 확인
  const rawRooms = FP.detectRooms(wall, img.w, img.h, { minAreaPx: 60 });
  if (rawRooms.length >= 2) {
    fail('가상벽 없이도 방이 2개로 분리됨 — 합성 도면의 개구부가 실제로 벽을 끊지 않았다는 뜻');
  } else {
    console.log(`OK: 가상벽 없이는 방이 ${rawRooms.length}개로 뭉개짐 — 폐합이 실제로 필요함을 확인`);
  }
}

// 오목한 방에서 라벨이 방 안에 찍히는지 (무게중심을 썼다면 실패한다)
{
  const img = makePlan({ lShaped: true });
  const ink = FP.binarize(img);
  const wall = FP.detectWalls(ink, img.w, img.h, { thin: 1 });
  const { openings } = FP.findOpenings(wall, ink, img.w, img.h, { gapR: GAP_R });
  const sealed = FP.sealWalls(wall, openings, img.w, img.h);
  const rooms = FP.detectRooms(sealed, img.w, img.h, { minAreaPx: 60 });

  let checked = 0;
  for (const room of rooms) {
    const lp = FP.labelPoint(room, img.w, img.h);
    if (!room.mask[lp.y * img.w + lp.x]) {
      fail(`ㄱ자 방의 라벨 위치(${lp.x},${lp.y})가 방 바깥 — 무게중심을 쓰면 나는 증상`);
    } else checked++;
    // 무게중심을 계산해 비교: 오목 방에서는 둘이 달라야 의미가 있다
  }
  if (checked === rooms.length && rooms.length > 0) {
    console.log(`OK: 오목(ㄱ자) 방 ${rooms.length}개 전부 라벨 위치가 방 내부`);
  }

}

// 무게중심을 쓰면 안 되는 이유를 기하만으로 분리 검증한다.
// CV 파이프라인을 거치면 닫힘 반경이 기둥과 벽 사이를 메워버려 의도한 모양이 안 나오므로,
// 방 마스크를 직접 만들어 "최대 내접원 중심은 방 안, 무게중심은 방 밖"임을 보인다.
{
  const W = 80, H = 80;
  const mask = new Uint8Array(W * H);
  const cells = [];
  // 가운데 기둥을 감싸는 고리 모양 방 (아파트 평면도의 기둥·ㄷ자 구조에 해당)
  for (let y = 10; y <= 69; y++) {
    for (let x = 10; x <= 69; x++) {
      const inPillar = x >= 25 && x <= 54 && y >= 25 && y <= 54;
      if (inPillar) continue;
      mask[y * W + x] = 1;
      cells.push(y * W + x);
    }
  }
  const ring = { id: 0, mask, cells, area: cells.length, bbox: { minX: 10, maxX: 69, minY: 10, maxY: 69 } };

  let sx = 0, sy = 0;
  for (const i of cells) { sx += i % W; sy += (i / W) | 0; }
  const cx = Math.round(sx / cells.length), cy = Math.round(sy / cells.length);
  const lp = FP.labelPoint(ring, W, H);

  if (mask[cy * W + cx]) {
    fail('고리 모양 방인데 무게중심이 방 안 — 대비 사례가 성립하지 않아 테스트가 무의미해짐');
  } else if (!mask[lp.y * W + lp.x]) {
    fail(`최대 내접원 중심(${lp.x},${lp.y})이 방 바깥 — labelPoint 가 깨졌다`);
  } else {
    console.log(`OK: 고리 모양 방에서 무게중심(${cx},${cy})은 방 밖, 최대 내접원 중심(${lp.x},${lp.y})은 방 안`);
  }
}

// 벽면 구간에 창문·문이 표시되는지
{
  const img = makePlan();
  const ink = FP.binarize(img);
  const wall = FP.detectWalls(ink, img.w, img.h, { thin: 1 });
  const { openings } = FP.findOpenings(wall, ink, img.w, img.h, { gapR: GAP_R });
  const sealed = FP.sealWalls(wall, openings, img.w, img.h);
  const rooms = FP.detectRooms(sealed, img.w, img.h, { minAreaPx: 60 });

  const allRuns = rooms.flatMap((r) => FP.wallRuns(r, openings, img.w, img.h));
  const kinds = new Set(allRuns.map((r) => r.type));
  if (!kinds.has('wall')) fail('벽면 구간에 실벽이 하나도 없음');
  if (!kinds.has('window')) fail('벽면 구간에서 창문에 맞닿은 구간을 구분하지 못함 — 창문 앞에 가전을 붙이게 된다');
  if (kinds.has('wall') && kinds.has('window')) {
    console.log(`OK: 벽면 구간이 종류별로 구분됨 [${[...kinds].join(', ')}]`);
  }
}

// ── PART D. 배치 판정 ──────────────────────────────────────────────────────
console.log('\n── PART D. 배치 판정 ──');
{
  const img = makePlan({ withWindow: false });
  const ink = FP.binarize(img);
  const wall = FP.detectWalls(ink, img.w, img.h, { thin: 1 });
  const { openings } = FP.findOpenings(wall, ink, img.w, img.h, { gapR: GAP_R });
  const sealed = FP.sealWalls(wall, openings, img.w, img.h);
  const rooms = FP.detectRooms(sealed, img.w, img.h, { minAreaPx: 60 });
  const room = rooms.sort((a, b) => b.area - a.area)[0];
  const runs = FP.wallRuns(room, openings, img.w, img.h);

  const rule = db.clearance.find((c) => c.category === '냉장고 4도어 프리스탠딩');
  const bigFridge = { dims: [916, 1853, 683] };

  // 축척을 크게 잡으면(1px=60mm) 방이 넉넉해 들어가고, 작게 잡으면(1px=8mm) 못 들어간다.
  const roomy = runs.map((r) => FP.fitProduct(bigFridge, rule, r, room, 60, img.w, img.h)).some((f) => f.ok);
  const tight = runs.map((r) => FP.fitProduct(bigFridge, rule, r, room, 8, img.w, img.h)).some((f) => f.ok);

  if (!roomy) fail('넉넉한 축척(1px=60mm)에서도 냉장고가 배치되지 않음 — 판정이 과하게 보수적');
  else console.log('OK: 넉넉한 방에는 4도어 프리스탠딩 배치 가능 판정');
  if (tight) fail('좁은 축척(1px=8mm)에서도 배치 가능으로 나옴 — 치수 판정이 동작하지 않음');
  else console.log('OK: 좁은 방에는 배치 불가 판정 (치수·이격이 실제로 걸림)');

  // 실패 사유가 사람이 읽을 수 있는 형태여야 한다 — 상담에서 "왜 안 되는지"를 말해야 하기 때문
  const reason = runs.map((r) => FP.fitProduct(bigFridge, rule, r, room, 8, img.w, img.h)).find((f) => !f.ok);
  if (!reason || !/mm/.test(reason.reason || '')) fail('배치 불가 사유에 실제 치수가 담기지 않음');
  else console.log(`OK: 불가 사유에 치수 포함 — "${reason.reason}"`);

  // 도어 오픈 시 전체폭이 실제로 판정에 쓰이는지.
  // 본체(683mm)만 보고 통과시키면 실제로는 문이 안 열린다. 이 조건만 단독으로 걸리는
  // 상황을 만들려면 "폭은 아주 넓고 깊이는 어중간한" 방이 필요해서, 합성 평면도 대신
  // 방 마스크를 직접 만들어 검증한다.
  if (!rule.doorSwing) fail('4도어 프리스탠딩 규칙에 doorSwing 이 없음');
  else {
    const W2 = 220, H2 = 140;
    const mask = new Uint8Array(W2 * H2);
    const cells = [];
    for (let y = 5; y <= 114; y++) for (let x = 5; x <= 214; x++) { mask[y * W2 + x] = 1; cells.push(y * W2 + x); }
    const wideRoom = { id: 0, mask, cells, area: cells.length, bbox: { minX: 5, maxX: 214, minY: 5, maxY: 114 } };
    // 위쪽 벽면 전체를 한 구간으로 본다. 1px=10mm 이면 벽면 2,100mm·깊이 1,100mm 다.
    const wideRun = { orient: 'h', side: 'top', a: 5, b: 214, at: 5, lenPx: 210, type: 'wall' };
    const f = FP.fitProduct(bigFridge, rule, wideRun, wideRoom, 10, W2, H2);
    // 벽면 2,100 ≥ 필요 1,506 통과 · 깊이 1,100 ≥ 683+50 통과 · 그러나 도어 오픈 1,498 미달
    if (f.ok) fail('깊이 1,100mm 인 방에 도어 오픈 1,498mm 가 필요한 냉장고가 통과됨 — 문이 안 열린다');
    else if (!/도어 오픈/.test(f.reason)) fail(`도어 오픈이 아닌 다른 사유로 걸림: ${f.reason}`);
    else console.log(`OK: 본체는 들어가지만 도어가 안 열리는 경우를 별도로 차단 — "${f.reason}"`);
  }

  // 추천이 실제로 모델을 돌려주는지
  const kitchen = ROOM_TYPES.find((t) => t.key === 'kitchen');
  const rec = FP.recommend(room, runs, db, kitchen.rules, 60, img.w, img.h);
  const okRec = rec.filter((r) => r.ok);
  if (!okRec.length) fail('주방 추천 결과가 하나도 없음');
  else console.log(`OK: 주방 추천 ${okRec.length}종 (예: ${okRec[0].rule} → ${okRec[0].product.model})`);

  // 공간 최대활용 기준이므로, 추천 모델은 그 규칙에서 들어가는 것 중 가장 큰 것이어야 한다.
  // 단위가 섞여 있으면(L 과 kg 을 나란히 비교하는 꼴) 용량 비교가 무의미하므로 엔진은 부피로
  // 대체한다. 검증도 같은 규칙을 따라야 한다.
  let capChecked = 0;
  for (const r of okRec) {
    const cands = db.products.filter((p) => p.rule === r.rule);
    const units = new Set(cands.filter((p) => p.capacity).map((p) => p.capacity.unit));
    const byCapacity = units.size === 1 && cands.every((p) => p.capacity);
    const rule = db.clearance.find((c) => c.category === r.rule);
    const fits = cands.filter((p) => runs.some((run) => FP.fitProduct(p, rule, run, room, 60, img.w, img.h).ok));
    if (!fits.length) continue;
    const score = (p) => (byCapacity ? p.capacity.value : p.dims[0] * p.dims[1] * p.dims[2]);
    const max = Math.max(...fits.map(score));
    if (score(r.product) < max) {
      fail(`${r.rule}: 추천이 최대(${byCapacity ? '용량' : '부피'})가 아님 — 추천 ${score(r.product)} < 가능 최대 ${max}`);
    }
    capChecked++;
  }
  console.log(`OK: 추천 ${capChecked}종 전부 배치 가능한 것 중 최대 (용량 우선, 단위가 섞이면 부피)`);
}

console.log('\n' + (ok ? 'ALL PASS' : 'SOME FAILED'));
process.exit(ok ? 0 : 1);
