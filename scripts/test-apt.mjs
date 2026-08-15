/*
 * 단지 목록(`public/apt/`) 회귀 검사 — `npm run test:apt`
 *
 * 도면이 있는 단지는 139곳뿐이라, 상담은 대부분 **이 목록에서 시작한다**
 * (*"어느 단지 사세요"*). 여기가 비거나 어긋나면 상담이 그 자리에서 막히는데
 * 화면에는 "단지 0곳"으로만 보여 원인을 못 찾는다.
 *
 * 실제로 만들면서 걸린 것들을 그대로 검사로 옮겼다:
 *  · **한글 파일명이 404 였다** — URL 인코딩·서비스워커 캐시에서 조용히 깨진다
 *  · **select 안내 문구가 단지로 섞였다** — `검색 결과가 없습니다`(강릉 강동면)
 *  · **자치구가 있는 시가 통째로 빠졌다** — `수원권선구` 를 `수원` 으로 못 읽어
 *    경기가 2,969 → 986 이 됐다
 *  · **강원을 넣었더니 춘천·원주까지 '경기'가 됐다** — 지역명이 `'경기 ' + 시` 였다
 */
import fs from 'node:fs';
import path from 'node:path';

let ok = true;
const fail = (m) => { ok = false; console.log('ERROR: ' + m); };

const DIR = 'public/apt';
const IDX = path.join(DIR, 'index.json');

/* ── [1] 목차가 있고 앞뒤가 맞는가 ── */
if (!fs.existsSync(IDX)) {
  fail(`${IDX} 가 없다 — \`node scripts/build-apt-index.mjs\` 를 돌리고 커밋할 것`);
  process.exit(1);
}
const idx = JSON.parse(fs.readFileSync(IDX, 'utf8'));
const cities = idx.cities || [];
const sum = cities.reduce((s, c) => s + c.n, 0);
if (idx.total !== sum) fail(`목차 total ${idx.total} ≠ 시별 합계 ${sum}`);
else console.log(`[1] 목차 ${cities.length}개 시·군 · 합계 ${sum.toLocaleString()}곳 OK`);

/* ── [2] 관할이 다 들어 있는가 ──
 * 경원 관할은 **경기 12개 시 + 강원 전역 18개 시·군**이다(CLAUDE.md).
 * 시 하나가 목록에서 사라지면 상담사에게는 *"우리는 그 지역을 안 다룬다"* 로 읽히는데
 * 그건 사실이 아니다 — 실제로 하남이 도면 0장이라 통째로 빠져 있었다. */
const GG = ['수원', '성남', '용인', '화성', '평택', '오산', '안성', '이천', '광주', '안양', '광명', '하남'];
const GW = ['춘천', '원주', '강릉', '동해', '태백', '속초', '삼척', '홍천', '횡성', '영월',
  '평창', '정선', '철원', '화천', '양구', '인제', '고성', '양양'];
for (const [sido, want] of [['경기', GG], ['강원', GW]]) {
  const have = cities.filter((c) => c.sido === sido).map((c) => c.city);
  const miss = want.filter((c) => !have.includes(c));
  if (miss.length) fail(`${sido} 관할 ${miss.length}곳이 목록에 없다: ${miss.join(' ')}`);
  const extra = have.filter((c) => !want.includes(c));
  if (extra.length) fail(`${sido} 관할 밖이 섞였다: ${extra.join(' ')}`);
}
if (ok) console.log(`[2] 관할 경기 ${GG.length} + 강원 ${GW.length} = ${GG.length + GW.length}개 시·군 전부 있음 OK`);

/* ── [3] 파일명은 영문이어야 한다 ── */
{
  const bad = cities.filter((c) => !c.key || !/^[a-z]+$/.test(c.key));
  if (bad.length) fail(`파일명이 영문이 아니다(한글 경로는 URL 인코딩·서비스워커에서 깨진다): `
    + bad.map((c) => `${c.city}=${c.key}`).join(' '));
  else console.log(`[3] 파일명 ${cities.length}개 전부 영문 OK`);
}

/* ── [4] 시별 파일이 실재하고 건수가 목차와 같은가 ── */
{
  let checked = 0;
  for (const c of cities) {
    const f = path.join(DIR, c.key + '.json');
    if (!fs.existsSync(f)) { fail(`${c.sido} ${c.city} — ${f} 가 없다`); continue; }
    const list = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!Array.isArray(list)) { fail(`${f} 가 배열이 아니다`); continue; }
    if (list.length !== c.n) fail(`${c.sido} ${c.city} — 목차 ${c.n}곳 ≠ 파일 ${list.length}곳`);
    checked += list.length;
  }
  if (ok) console.log(`[4] 시별 파일 ${cities.length}개 · 단지 ${checked.toLocaleString()}곳 — 목차와 일치 OK`);
}

/* ── [5] 안내 문구가 단지로 섞이지 않았는가 ──
 * K-apt 의 `<select>` 는 결과가 없으면 `검색 결과가 없습니다` 를 option 으로 넣는다.
 * 그대로 담으면 목록에서는 **단지처럼 보인다.** 실제로 두 도에서 한 건씩 들어왔다. */
{
  const BOGUS = /검색\s*결과|없습니다|^\s*(선택|전체)\s*$/;
  const bad = [];
  for (const c of cities) {
    const f = path.join(DIR, c.key + '.json');
    if (!fs.existsSync(f)) continue;
    for (const a of JSON.parse(fs.readFileSync(f, 'utf8')))
      if (!a.n || BOGUS.test(a.n)) bad.push(`${c.city} "${a.n}"`);
  }
  if (bad.length) fail(`안내 문구가 단지로 섞였다 ${bad.length}건: ${bad.slice(0, 5).join(' / ')}`);
  else console.log('[5] 안내 문구 섞임 0건 OK');
}

/* ── [6] 앱이 목차의 시·도·파일명을 그대로 쓰는가 ──
 * 표를 앱에도 두면 한쪽만 고치게 된다. 강원을 넣을 때 실제로 그랬다 —
 * 앱이 `'경기 ' + 시` 로 지역명을 만들어 **춘천·원주까지 경기**가 됐다. */
{
  /* **주석은 빼고 본다.** "예전에는 `'경기 ' + 시` 였다"는 설명이 주석에 남아 있어
     그대로 검사하면 고쳐 놓고도 실패한다(실제로 그랬다). */
  const app = fs.readFileSync('public/place-app.html', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  if (/'경기 '\s*\+/.test(app)) fail(`place-app.html 이 지역명에 '경기' 를 박아 두고 있다 — 목차의 sido 를 쓸 것`);
  if (/var\s+APT_KEY\s*=/.test(app)) fail('place-app.html 에 APT_KEY 표가 남아 있다 — 목차(index.json)의 key 를 쓸 것');
  if (!/apt\/index\.json/.test(app)) fail('place-app.html 이 apt/index.json 을 읽지 않는다');
  if (ok) console.log('[6] 앱이 목차의 sido·key 를 그대로 씀 OK');
}

/* ── [7] 커밋된 것이 지금 재생성한 것과 같은가 ──
 * 원본(.scratch)이 있는 로컬에서만 검사한다 — 수집은 로컬 전용이라 CI 에는 원본이 없다. */
{
  const src = ['.scratch/kapt-names.json', '.scratch/kapt-gy.full.json', '.scratch/kapt-gw.json'];
  if (!src.every((f) => fs.existsSync(f))) {
    console.log('[7] SKIP — 수집 원본(.scratch)이 없다(수집은 로컬 전용)');
  } else {
    const before = Object.fromEntries(cities.map((c) => [c.key, c.n]));
    const { execFileSync } = await import('node:child_process');
    execFileSync(process.execPath, ['scripts/build-apt-index.mjs'], { stdio: 'pipe' });
    const after = JSON.parse(fs.readFileSync(IDX, 'utf8'));
    const now = Object.fromEntries((after.cities || []).map((c) => [c.key, c.n]));
    const diff = [...new Set([...Object.keys(before), ...Object.keys(now)])]
      .filter((k) => before[k] !== now[k]).map((k) => `${k} ${before[k] ?? '-'}→${now[k] ?? '-'}`);
    if (diff.length) fail(`커밋된 목록이 최신이 아니다 — \`node scripts/build-apt-index.mjs\` 후 커밋할 것: ${diff.join(' ')}`);
    else console.log('[7] 커밋된 목록 = 지금 재생성한 것 OK');
  }
}

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
