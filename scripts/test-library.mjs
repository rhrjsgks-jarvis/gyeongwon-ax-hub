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

/*
 * **정상 표본은 타입 숫자와 넓이가 맞아야 한다.** `84A` 라고 적어 놓고 방 합계가
 * 20㎡ 면 그건 정상 표본이 아니라 "집이 반의 반만 잡힌 것"이다 — 실제로 그런 표본을
 * 정상으로 두고 있었고, 크기 관문을 넣자 걸렸다. 42 + 42 = 84㎡ 로 맞춘다.
 */
const good84 = [room('거실', 7000, 6000), room('침실1', 6000, 7000)];

/* ── ① 불량은 전부 걸러야 한다 ─────────────────────────────────── */
const bad = write('bad.json', { version: 1, entries: [
  { complex: '정상단지', type: '84A', region: '경기 수원', rooms: good84 },
  /* 주택형을 못 읽은 도면은 `T1` 로 적힌다 — 숫자가 없으니 크기로 잴 수 없고, 통과해야 한다 */
  { complex: '주택형미상단지', type: 'T1', region: '강원 원주', rooms: [room('거실', 5000, 4000)] },
  /* 저작권 자료가 저장소에 들어가면 안 된다 — 이 앱이 도면 이미지를 안 담는 이유다 */
  { complex: '이미지섞임', type: '84B', region: '경기 수원', rooms: good84, thumb: 'data:image/jpeg;base64,AAAA' },
  /* 축척이 틀어지면 이런 값이 나온다 */
  { complex: '거대방', type: '84C', region: '경기 수원', rooms: [room('거실', 50000, 40000)] },
  /* 벽 3개 미만은 방이 아니다 */
  { complex: '벽부족', type: '84D', region: '경기 수원', rooms: [{ name: '거실', parts: [{ walls: [{ x1: 0, y1: 0, x2: 100, y2: 0 }] }] }] },
  /* 이름이 없으면 매장에서 고를 수가 없다 */
  { type: '84E', region: '경기 수원', rooms: good84 },
  /*
   * 타입 이름과 실제 넓이가 어긋난 것 — **양쪽 방향을 다 물려야 한다.**
   * 위: 주택형 OCR 이 숫자만 읽어 뭉갠 자리(자이 헤리티지 `23` 인데 158㎡).
   * 아래: 인식이 절반만 된 것(자이 `85-2` 인데 47㎡).
   */
  { complex: '타입작음', type: '23', region: '경기 용인', rooms: [room('거실', 10000, 8000), room('침실1', 10000, 8000)] },
  { complex: '타입큼', type: '85-2', region: '경기 화성', rooms: [room('거실', 5000, 4000)] },
  /*
   * 이름이 엉뚱한 방에 붙은 것 — 실측으로 `원주역 우미 린 더 스카이 T1` 이
   * **거실 7.8㎡ · 침실2 23.2㎡** 였다. 벽선은 멀쩡한데 이름만 어긋난 경우인데,
   * 라이브러리는 이미지 없이 이름만 남으므로 화면에서 바로잡을 근거가 없다.
   */
  { complex: '이름뒤바뀜', type: '84F', region: '강원 원주',
    rooms: [room('거실', 3000, 2600), room('침실2', 5000, 4640), room('주방', 3000, 2400),
            room('침실1', 4000, 3000), room('안방', 4000, 3500)] },
] });

const out1 = run([bad, '--dry']);
for (const [label, must] of [
  ['이미지 섞임', /이미지\/base64/],
  ['치수 이상', /30m 를 넘는다|사람이 사는 크기가 아니다/],
  ['벽 부족', /방이 아니다/],
  ['단지명 없음', /단지명이 없다/],
  ['타입보다 큼', /타입 23㎡ 의 [\d.]+배 — 타입 이름이나 인식이 틀렸다/],
  ['타입보다 작음', /타입 85㎡ 의 [\d.]+배 — 집이 반만 잡혔다/],
  ['이름 뒤바뀜', /가장 넓은 [\d.]+㎡ 가 "침실2" 이다/],
]) {
  if (!must.test(out1)) fail(`${label} 항목을 걸러내지 못했다`);
}
if (!/담음 2 · 덮음 0 · 건너뜀 0 · 거른 것 7/.test(out1)) {
  fail(`정상 2 · 불량 7 로 갈리지 않았다:\n${out1.split('\n').filter((l) => /합치기|담음/.test(l)).join(' / ')}`);
} else pass('불량 7종(이미지·치수·벽부족·이름없음·타입 큼/작음·이름 뒤바뀜)을 걸러내고 정상 2개만 담는다 (숫자 없는 `T1` 은 통과)');

/* ── ② --dry 는 파일을 건드리지 않아야 한다 ───────────────────── */
const beforeRaw = fs.readFileSync(LIB, 'utf8');
run([bad, '--dry']);
if (fs.readFileSync(LIB, 'utf8') !== beforeRaw) fail('--dry 인데 공용 목록 파일이 바뀌었다');
else pass('--dry 는 파일을 쓰지 않는다');

/* ── ③ 같은 단지·타입은 덮지 않는다 ──────────────────────────── */
const one = write('one.json', { version: 1, entries: [
  { complex: '중복시험단지', type: '84A', region: '경기 수원', rooms: good84 },
] });
/*
 * **단지명은 전국에서 유일하지 않다.** 도면 색인에 `자이 헤리티지`가 경기 화성과
 * 경기 용인 두 곳에 있다(서로 다른 집이다). 키에 지역이 빠지면 한쪽이 다른 쪽을
 * "이미 있다"로 밀어내거나 `--force` 에 조용히 덮여 **엉뚱한 집 벽선으로 상담한다.**
 */
const twin = write('twin.json', { version: 1, entries: [
  { complex: '중복시험단지', type: '84A', region: '경기 용인', rooms: good84 },
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

  const out3 = run([twin, '--dry']);             // 이름은 같은데 지역이 다르면
  if (!/담음 1/.test(out3)) fail('단지명·타입이 같아도 지역이 다르면 다른 집이다 — 건너뛰면 안 된다');
  else pass('같은 이름이라도 지역이 다르면 따로 담는다 (`자이 헤리티지`가 화성·용인 두 곳)');
} finally {
  /* 검사가 저장소 파일을 더럽히지 않게 되돌린다 */
  fs.writeFileSync(LIB, beforeRaw);
}
if (fs.readFileSync(LIB, 'utf8') !== beforeRaw) fail('검사 뒤 공용 목록이 원래대로 돌아오지 않았다');

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
