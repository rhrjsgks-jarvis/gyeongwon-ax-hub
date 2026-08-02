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
  { q: '김치냉장고', modules: ['finder', 'install', 'compare', 'care', 'planner'] },
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
