/*
 * 공용 평면 라이브러리 합치기 회귀 검사 — `npm run test:library`
 *
 * 이 스크립트가 지키는 것은 **"쓰레기가 공용 목록에 들어가지 않는다"** 하나다.
 * 공용 목록은 배포본에 실려 여러 매장이 함께 쓴다 — 잘못 잡힌 벽이 들어가면 그걸
 * 불러온 다른 상담사가 **틀린 치수로 상담한다.** 그래서 거르는 쪽을 검사한다.
 *
 * 통과만 시키는 검사는 아무것도 지키지 못하므로 **불량 표본을 넣어 물리는지**를 본다.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const MERGE = path.join(__dirname, 'merge-plan-library.mjs');
const LIB = path.join(ROOT, 'public', 'plan-library.json');

let ok = true;
const fail = (m) => { ok = false; console.log('ERROR: ' + m); };
const pass = (m) => console.log('OK: ' + m);

/** 사각형 방 하나 */
const room = (n, w, h) => ({ name: n, parts: [{ walls: [
  { x1: 0, y1: 0, x2: w, y2: 0, open: false }, { x1: w, y1: 0, x2: w, y2: h, open: false },
  { x1: w, y1: h, x2: 0, y2: h, open: false }, { x1: 0, y1: h, x2: 0, y2: 0, open: false },
] }] });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-'));
const write = (name, doc) => { const p = path.join(tmp, name); fs.writeFileSync(p, JSON.stringify(doc)); return p; };
const run = (args) => execFileSync('node', [MERGE, ...args], { encoding: 'utf8', cwd: ROOT });

/* ── ① 불량은 전부 걸러야 한다 ─────────────────────────────────── */
const bad = write('bad.json', { version: 1, entries: [
  { complex: '정상단지', type: '84A', region: '경기 수원', rooms: [room('거실', 5000, 4000)] },
  /* 저작권 자료가 저장소에 들어가면 안 된다 — 이 앱이 도면 이미지를 안 담는 이유다 */
  { complex: '이미지섞임', type: '84B', rooms: [room('거실', 5000, 4000)], thumb: 'data:image/jpeg;base64,AAAA' },
  /* 축척이 틀어지면 이런 값이 나온다 */
  { complex: '거대방', type: '84C', rooms: [room('거실', 50000, 40000)] },
  /* 벽 3개 미만은 방이 아니다 */
  { complex: '벽부족', type: '84D', rooms: [{ name: '거실', parts: [{ walls: [{ x1: 0, y1: 0, x2: 100, y2: 0 }] }] }] },
  /* 이름이 없으면 매장에서 고를 수가 없다 */
  { type: '84E', rooms: [room('거실', 5000, 4000)] },
] });

const out1 = run([bad, '--dry']);
for (const [label, must] of [
  ['이미지 섞임', /이미지\/base64/],
  ['치수 이상', /30m 를 넘는다|사람이 사는 크기가 아니다/],
  ['벽 부족', /방이 아니다/],
  ['단지명 없음', /단지명이 없다/],
]) {
  if (!must.test(out1)) fail(`${label} 항목을 걸러내지 못했다`);
}
if (!/담음 1 · 덮음 0 · 건너뜀 0 · 거른 것 4/.test(out1)) {
  fail(`정상 1 · 불량 4 로 갈리지 않았다:\n${out1.split('\n').filter((l) => /합치기|담음/.test(l)).join(' / ')}`);
} else pass('불량 4종(이미지·치수·벽부족·이름없음)을 전부 걸러내고 정상 1개만 담는다');

/* ── ② --dry 는 파일을 건드리지 않아야 한다 ───────────────────── */
const beforeRaw = fs.readFileSync(LIB, 'utf8');
run([bad, '--dry']);
if (fs.readFileSync(LIB, 'utf8') !== beforeRaw) fail('--dry 인데 공용 목록 파일이 바뀌었다');
else pass('--dry 는 파일을 쓰지 않는다');

/* ── ③ 같은 단지·타입은 덮지 않는다 ──────────────────────────── */
const one = write('one.json', { version: 1, entries: [
  { complex: '중복시험단지', type: '84A', region: '경기 수원', rooms: [room('거실', 5000, 4000)] },
] });
try {
  run([one]);                                   // 한 번 담고
  const after = JSON.parse(fs.readFileSync(LIB, 'utf8'));
  const got = (after.entries || []).find((e) => e.complex === '중복시험단지');
  if (!got) fail('정상 항목이 공용 목록에 담기지 않았다');
  else if (/data:|base64/.test(JSON.stringify(got))) fail('담긴 항목에 이미지가 섞였다');
  else pass('정상 항목이 공용 목록에 담긴다 (벽 좌표만)');

  const out2 = run([one]);                      // 같은 것을 또 담으면
  if (!/건너뜀 1/.test(out2)) fail('같은 단지·타입인데 건너뛰지 않았다 — 남이 확인해 둔 값을 덮는다');
  else pass('같은 단지·타입은 덮지 않고 건너뛴다(--force 로만 덮는다)');
} finally {
  /* 검사가 저장소 파일을 더럽히지 않게 되돌린다 */
  fs.writeFileSync(LIB, beforeRaw);
}
if (fs.readFileSync(LIB, 'utf8') !== beforeRaw) fail('검사 뒤 공용 목록이 원래대로 돌아오지 않았다');

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
