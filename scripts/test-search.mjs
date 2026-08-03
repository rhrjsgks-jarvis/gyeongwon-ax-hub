// 허브 통합검색 회귀 테스트
// 실행: node scripts/test-search.mjs
//
// ① 커밋된 public/search-index.json이 현재 모듈 데이터와 일치하는지(=재생성 누락이 없는지)
// ② 대표 검색어가 기대한 모듈들에서 잡히는지
// ③ 인덱스의 내부 링크가 실제 존재하는 라우트를 가리키는지
// 를 검사한다. 모듈 데이터를 고치고 인덱스를 다시 만들지 않으면 ①에서 걸린다.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const indexPath = path.join(root, 'public', 'search-index.json');

let ok = true;
const fail = (m) => { console.log('ERROR:', m); ok = false; };

// ── ① 인덱스 최신성 ──
if (!fs.existsSync(indexPath)) {
  fail('public/search-index.json이 없음 — `node scripts/build-search-index.mjs` 실행 필요');
} else {
  const committed = fs.readFileSync(indexPath, 'utf8');
  execFileSync('node', [path.join(__dirname, 'build-search-index.mjs')], { stdio: 'pipe' });
  const regenerated = fs.readFileSync(indexPath, 'utf8');
  if (committed !== regenerated) {
    fail('search-index.json이 최신이 아님 — 모듈 데이터를 고친 뒤 `node scripts/build-search-index.mjs`를 다시 실행하고 커밋할 것');
  } else {
    console.log('OK: search-index.json이 현재 모듈 데이터와 일치');
  }
}

const { entries } = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
console.log(`인덱스 항목 수: ${entries.length}`);
if (entries.length < 300) fail(`인덱스 항목이 비정상적으로 적음(${entries.length}) — 추출 로직 확인 필요`);

// ── ② 대표 검색어 → 기대 모듈 매칭 ──
const search = (q) => {
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((e) => tokens.every((t) => e.kw.includes(t)));
};
const CASES = [
  { q: '김치냉장고', modules: ['finder', 'install', 'compare', 'care'] },
  { q: '무풍', modules: ['finder'] },
  { q: 'RM90H91B1W', modules: ['finder'] },
  { q: '에어드레서', modules: ['finder', 'install', 'compare'] },
  { q: '컨시어지', modules: ['hub'] },
  { q: '카탈로그', modules: ['hub'] },
  { q: '퀴즈', modules: ['hub'] },
];
for (const c of CASES) {
  const hits = search(c.q);
  const got = new Set(hits.map((e) => e.m));
  const missing = c.modules.filter((m) => !got.has(m));
  if (!hits.length) fail(`"${c.q}" 검색 결과가 0건`);
  else if (missing.length) fail(`"${c.q}" 검색에서 ${missing.join(', ')} 모듈이 누락됨 (실제: ${[...got].join(', ')})`);
  else console.log(`OK: "${c.q}" → ${hits.length}건 · 모듈 ${[...got].join(', ')}`);
}

// 존재하지 않는 키워드는 0건이어야 함
if (search('존재하지않는키워드zzz').length !== 0) fail('무의미한 키워드가 결과를 반환함');
else console.log('OK: 무의미한 키워드 → 0건');

// ── ③ 내부 링크가 실제 라우트를 가리키는지 ──
const routes = new Set(
  fs.readdirSync(path.join(root, 'app'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'api')
    .map((d) => '/' + d.name)
);
routes.add('/');
for (const e of entries) {
  if (e.ext) continue;
  const base = e.href.split('?')[0].split('#')[0] || '/';
  if (!routes.has(base)) { fail(`인덱스 링크가 존재하지 않는 라우트를 가리킴: ${e.href} (${e.title})`); break; }
}
console.log('OK: 인덱스 내부 링크가 모두 실제 라우트를 가리킴');

// ── ③-1 화면에 보이는 워딩으로 검색되는지 ──
// 인덱스가 모듈 이름만 담고 섹션명·카드 설명을 빠뜨려 "교육"을 검색해도 📚 교육 섹션의
// 레벨업테스트·URL 퀴즈가 안 나오던 문제가 있었다. 허브 화면의 모든 모듈과 섹션명이
// 인덱스에 들어갔는지 소스와 직접 대조한다.
{
  const pageSrc = fs.readFileSync(path.join(root, 'app', 'page.tsx'), 'utf8');
  const gb = pageSrc.match(/const MODULE_GROUPS[^=]*=\s*\[([\s\S]*?)\n\]\n/);
  if (!gb) fail('app/page.tsx에서 MODULE_GROUPS를 찾지 못함 — 인덱스 생성기도 함께 확인할 것');
  else {
    const hubHrefs = new Set(entries.filter((e) => e.m === 'hub').map((e) => e.href));
    for (const m of gb[1].matchAll(/href: '([^']+)',\s*\n\s*icon: '[^']*',\s*\n\s*title: '([^']+)'/g)) {
      if (!hubHrefs.has(m[1])) fail(`허브 카드 "${m[2]}"(${m[1]})가 검색 인덱스에 없음`);
    }
    // 섹션명(📚 교육 등)의 한글 부분으로 검색이 되어야 한다
    for (const g of gb[1].matchAll(/title: '([^']+)',\s*\n\s*modules: \[/g)) {
      // 이모지·기호를 뺀 한글 단어 단위로 본다(공백까지 지우면 "제품상담도구"가 되어 오탐)
      const words = g[1].match(/[가-힣]+/g) || [];
      if (!words.length) continue;
      const missing = words.filter((w) => !entries.some((e) => e.m === 'hub' && e.kw.includes(w.toLowerCase())));
      if (missing.length) fail(`섹션명 "${g[1]}"의 "${missing.join(', ')}"로 검색되는 허브 항목이 없음 — 그룹명이 kw에 빠졌는지 확인`);
      else console.log(`OK: 섹션명 "${words.join(' ')}"으로 허브 항목 검색됨`);
    }
  }
}

// ── ③-2 앵커 링크(/#coupon 등)가 실제로 그 위치로 이동하는지 ──
// 위 ③은 해시를 잘라내고 라우트만 보므로, 앵커가 깨져도 통과한다(실제로 "쿠폰" 검색 결과를
// 눌러도 아무 일이 없던 버그를 놓쳤다). 앵커는 ①대상 id가 존재하고 ②그 id가 속한 섹션을
// 자동으로 펼치도록 등록돼 있어야 한다 — 모바일은 섹션이 접힌 채 시작해 대상이 hidden이면
// 브라우저가 스크롤 대상으로 잡지 못하기 때문이다.
{
  const pageSrc = fs.readFileSync(path.join(root, 'app', 'page.tsx'), 'utf8');
  const anchors = [...new Set(entries.filter((e) => !e.ext && e.href.includes('#'))
    .map((e) => e.href.split('#')[1]).filter(Boolean))];
  if (anchors.length === 0) fail('앵커 링크가 하나도 없음 — 인덱스 생성기가 바뀌었는지 확인할 것');
  for (const a of anchors) {
    if (!pageSrc.includes(`id="${a}"`)) fail(`앵커 대상이 없음: /#${a} — app/page.tsx에 id="${a}" 요소가 필요`);
    else if (!new RegExp(`\\b${a}:\\s*'`).test(pageSrc)) {
      fail(`앵커 "${a}"가 ANCHOR_SECTION에 없음 — 모바일에서 섹션이 접혀 있으면 이동이 동작하지 않음`);
    } else console.log(`OK: 앵커 /#${a} — 대상 id 존재 + 섹션 자동 펼침 등록됨`);
  }
}

// ── ④ 딥링크 파라미터 처리기가 각 모듈에 실제로 붙어 있는지 ──
const deepLinks = [
  ['finder-app.html', "get('q')"],
  ['install-app.html', "get('cat')"],
  ['compare-app.html', "get('cat')"],
];
for (const [file, needle] of deepLinks) {
  const html = fs.readFileSync(path.join(root, 'public', file), 'utf8');
  if (!html.includes(needle)) fail(`${file}에 딥링크 처리(${needle})가 없음 — 검색 결과 클릭 시 해당 화면으로 이동하지 않음`);
  else console.log(`OK: ${file} 딥링크 처리 확인`);
}

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
