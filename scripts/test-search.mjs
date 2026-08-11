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
const detailPath = path.join(root, 'public', 'search-detail.json');

let ok = true;
const fail = (m) => { console.log('ERROR:', m); ok = false; };

// ── ① 인덱스 최신성 ──
if (!fs.existsSync(indexPath)) {
  fail('public/search-index.json이 없음 — `node scripts/build-search-index.mjs` 실행 필요');
} else {
  const committed = fs.readFileSync(indexPath, 'utf8');
  // lib/searchTerms.ts 를 가져오므로 타입 스트리핑이 필요하다(구 Node 에서는 기본이 아니다)
  execFileSync('node', ['--experimental-strip-types', path.join(__dirname, 'build-search-index.mjs')], { stdio: 'pipe' });
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

// ── 경량 인덱스 / 상세 스펙 분리 회귀 ──
// /search는 첫 진입에 경량본만 받고 펼칠 때 상세를 따로 받는다. 두 파일이 `i`로 연결되므로
// 정렬이 어긋나면 엉뚱한 제품의 스펙이 뜬다 — 실제로 상담 사고가 될 수 있어 강하게 검사한다.
{
  if (!fs.existsSync(detailPath)) {
    fail('public/search-detail.json이 없음 — `node scripts/build-search-index.mjs` 실행 필요');
  } else {
    const detail = JSON.parse(fs.readFileSync(detailPath, 'utf8')).entries;
    const kb = (f) => Math.round(fs.statSync(f).size / 1024);
    console.log(`  경량 ${kb(indexPath)}KB / 상세 ${kb(detailPath)}KB (${detail.length}건, 지연 로드)`);

    // 첫 진입 로딩량 가드 — 상세 스펙이 다시 경량본으로 새어 들어오면 여기서 걸린다
    const DETAIL_KEYS = ['spec', 'on', 'off', 'price', 'note', 'usp'];
    const leaked = entries.find((e) => DETAIL_KEYS.some((k) => e[k] !== undefined));
    if (leaked) fail(`경량 인덱스에 상세 필드가 섞임(${leaked.title}) — 첫 로딩량이 다시 늘어난다`);
    else console.log('OK: 경량 인덱스에 상세 스펙 필드가 없음');

    // i 정합성: 상세의 i가 경량본의 같은 자리를 가리켜야 한다
    const byI = new Map(entries.map((e) => [e.i, e]));
    const bad = detail.find((d) => !byI.has(d.i));
    if (bad) fail(`search-detail.json의 i=${bad.i}에 대응하는 경량 인덱스 항목이 없음`);
    else if (entries.some((e, idx) => e.i !== idx)) fail('경량 인덱스의 i가 배열 순서와 어긋남 — 두 파일 연결이 깨진다');
    else console.log('OK: 경량↔상세 인덱스(i) 정합성');

    // d 플래그와 상세 존재가 일치해야 "상세 ▼" 버튼이 헛돌지 않는다
    const detailIds = new Set(detail.map((d) => d.i));
    const flagged = entries.filter((e) => e.d).map((e) => e.i);
    const mismatch = flagged.filter((i) => !detailIds.has(i))
      .concat([...detailIds].filter((i) => !flagged.includes(i)));
    if (mismatch.length) fail(`d 플래그와 상세 데이터 불일치 ${mismatch.length}건 (예: i=${mismatch[0]})`);
    else console.log(`OK: 상세 보유 표시(d) ${flagged.length}건이 상세 파일과 일치`);
  }
}

// 서비스워커 — 매장 전파 불량 대비 오프라인 캐시
{
  const sw = path.join(root, 'public', 'sw.js');
  if (!fs.existsSync(sw)) fail('public/sw.js가 없음 — 오프라인 캐시가 동작하지 않는다');
  else {
    const src = fs.readFileSync(sw, 'utf8');
    if (!/search-\(index\|detail\)/.test(src)) fail('sw.js가 검색 인덱스를 캐시 대상에 넣지 않음');
    else if (!src.includes("startsWith('/api/')")) fail('sw.js가 /api 요청을 캐시에서 제외하지 않음 — 로그·인증이 굳는다');
    else console.log('OK: 서비스워커 캐시 규칙(인덱스 포함 / API 제외)');
    const reg = fs.readFileSync(path.join(root, 'components', 'ServiceWorker.tsx'), 'utf8');
    if (!reg.includes("register('/sw.js')")) fail('ServiceWorker.tsx가 sw.js를 등록하지 않음');
    else console.log('OK: 서비스워커 등록 컴포넌트');
  }
}

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
  const pageSrc = fs.readFileSync(path.join(root, 'app', 'page.tsx'), 'utf8').replace(/\r\n/g, '\n');
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

// ── ⑤ 용어 세분화 — 상담사가 쓰는 말로 찾아지는가 ──
// 데이터에 적힌 말과 매장에서 부르는 말이 다르다. "식세기"로 쳤는데 0건이면 상담이 거기서 멈춘다.
// 이 구간이 지키는 것은 **그 말로 검색하면 나온다**는 사실 하나다.
{
  const { parseQuery, hits, SYNONYM_GROUPS, expandToken } = await import('../lib/searchTerms.ts');
  const find = (q) => {
    const cs = parseQuery(q);
    return entries.filter((e) => cs.every((c) => hits(e.kw, c)));
  };

  // 줄여 부르는 말 → 정식 명칭이 걸려야 한다
  for (const [q, needle] of [
    ['식세기', '식기세척기'],
    ['김냉', '김치냉장고'],
    ['로청', '로봇청소기'],
    ['에어콘', '에어컨'],
    ['전자렌지', '전자레인지'],
  ]) {
    const hit = find(q);
    if (!hit.length) fail(`"${q}" 검색 0건 — 동의어 확장이 동작하지 않는다`);
    else if (!hit.some((e) => (e.title + e.sub + e.kw).includes(needle))) {
      fail(`"${q}" 검색 결과에 "${needle}" 가 하나도 없다`);
    } else console.log(`OK: "${q}" → "${needle}" 로 확장돼 ${hit.length}건`);
  }

  // 단위 표기 — 65형과 65인치는 같은 말이라 결과가 같아야 한다
  const a = find('65인치').map((e) => e.i).sort().join(',');
  const b = find('65형').map((e) => e.i).sort().join(',');
  if (a !== b || !a) fail('"65인치" 와 "65형" 의 결과가 다르다 — 단위 표기 확장을 확인할 것');
  else console.log(`OK: 65인치 = 65형 (${find('65인치').length}건)`);

  // **단위를 뗀 맨숫자까지 확장하면 안 된다.** '20kg' → '20' 을 넣었더니 567건이 나온 적이 있다.
  if (expandToken('20kg').includes('20')) fail("expandToken('20kg') 에 맨숫자 '20' 이 들어 있다 — 조건이 아무거나 문다");
  else console.log('OK: 단위를 뗀 맨숫자는 확장하지 않는다');

  // 한 글자 표기는 kw.includes 판정에서 어디에나 걸린다 — 표에 들어가면 안 된다
  const tiny = SYNONYM_GROUPS.flat().filter((w) => w.length < 2);
  if (tiny.length) fail(`동의어 표에 한 글자 표기가 있다: ${tiny.join(', ')}`);
  else console.log('OK: 동의어 표에 한 글자 표기 없음');

  /* **자연어로 물어도 걸려야 한다.** 조사·어미가 붙은 조각이 섞여도 답이 나와야 하고,
     0건인 조건은 빼고 찾는다(app/search/page.tsx). 여기서는 그 규칙을 그대로 흉내 낸다. */
  const ask = (q) => {
    const cs = parseQuery(q);
    const live = cs.filter((c) => entries.some((e) => hits(e.kw, c)));
    return live.length ? entries.filter((e) => live.every((c) => hits(e.kw, c))) : [];
  };
  for (const [q, needle] of [
    ['냉장고 컴프레서 몇 년이야', /냉장고/],
    ['수원은 어느 물류센터야', /평택TC/],
    ['안동 IT 이전설치 어디서 하나요', /다존텍/],
    ['후드 이전설치 어디로 문의하죠', /후드/],
    ['65인치 TV 있나요', /./],
  ]) {
    const hit = ask(q);
    if (!hit.length) fail(`자연어 질의 "${q}" → 0건`);
    else if (!needle.test(hit[0].title + hit[0].sub)) {
      fail(`자연어 질의 "${q}" 첫 결과가 "${hit[0].title}" — ${needle} 이어야 한다`);
    } else console.log(`OK: 자연어 "${q}" → ${hit.length}건 (${hit[0].title})`);
  }

  // 앱 안에 아무 말도 없으면 0건이어야 한다 — 아무거나 무는 검색은 없느니만 못하다
  if (ask('없는말없는말 또없는말').length) fail('전부 없는 말인데 결과가 나온다');
  else console.log('OK: 전부 없는 말 → 0건');

  // 조건 AND — 조건을 더하면 결과는 반드시 줄거나 같아야 한다
  const one = find('에어컨').length, two = find('무풍 에어컨').length, three = find('무풍 에어컨 1등급').length;
  if (!(one >= two && two >= three && three > 0)) {
    fail(`조건을 겹칠수록 좁아져야 한다 — 에어컨 ${one} / 무풍 에어컨 ${two} / +1등급 ${three}`);
  } else console.log(`OK: 다조건 AND — 에어컨 ${one} → 무풍 ${two} → 1등급 ${three}`);

  // 색인·질의가 같은 정규화를 거치는가 — 쉼표 있는 치수를 쉼표 없이 찾을 수 있어야 한다
  if (!find('1853').length) fail('"1853" 로 치수(912×1,853)가 안 찾아진다 — 쉼표 정규화가 한쪽만 걸린 것');
  else console.log(`OK: 쉼표 없는 숫자로 치수 검색 (${find('1853').length}건)`);

  /* 제품 상세검색 묶음은 **제품만** 담는다 — 분류·제목이 섞이면 안 된다(사용자 요청) */
  const nonProduct = entries.filter((e) => e.m === 'finder' && e.t !== 'product');
  if (nonProduct.length) {
    fail(`'제품·모델' 묶음에 제품이 아닌 것이 ${nonProduct.length}건 (${nonProduct.slice(0, 3).map((e) => e.title).join(', ')})`);
  } else console.log(`OK: 제품 묶음은 제품만 (${entries.filter((e) => e.m === 'finder').length}종)`);
}

// ── ⑥ 전 모듈이 색인에 들어 있는가 ──
// 모듈을 새로 만들고 색인 생성기에 넣지 않으면 **통합검색에서 통째로 사라지는데 아무 표시도 안 난다.**
{
  const want = { finder: 300, install: 20, compare: 30, care: 10, as: 80, place: 50, hub: 10 };
  const got = {};
  for (const e of entries) got[e.m] = (got[e.m] || 0) + 1;
  for (const [m, min] of Object.entries(want)) {
    if (!got[m] || got[m] < min) fail(`색인에 '${m}' 모듈이 ${got[m] || 0}건뿐 — 최소 ${min}건은 있어야 한다`);
  }
  if (ok) console.log(`OK: 전 모듈 색인 ${JSON.stringify(got)}`);

  // AS 앱에서만 확인할 수 있는 것들 — 물류센터·이전설치가 허브 검색에서도 잡혀야 한다
  const { parseQuery, hits } = await import('../lib/searchTerms.ts');
  const find = (q) => { const cs = parseQuery(q); return entries.filter((e) => cs.every((c) => hits(e.kw, c))); };
  for (const [q, m, what] of [
    ['김해', 'as', '물류센터·이전설치 관할'],
    ['싱크대 리폼', 'as', '싱크장 리폼 협력사'],
    ['컴프레서 10년', 'as', '핵심부품 무상기간'],
    ['안동 다존텍', 'as', 'B2B IT 관할'],
    ['031-270-3813', 'as', '센터 운영 연락처'],
    ['스마트로지텍', 'as', '상황실 협력사'],
    ['정수기 이전설치', 'as', '품목별 전국 담당'],
    ['광주지사', 'as', '중앙에너지 설치 지사'],
    ['에어컨 이격거리', 'place', '배치 시뮬레이터 이격'],
  ]) {
    const hit = find(q).filter((e) => e.m === m);
    if (!hit.length) fail(`"${q}" 로 ${what}(${m})가 안 잡힌다`);
    else console.log(`OK: "${q}" → ${m} ${hit.length}건 (${what})`);
  }

  /*
   * ── ⑦ 화면에 보이는 제목으로 반드시 찾아진다 ──
   *
   * AS 묶음 107건만 제목이 kw 에서 빠져 있어 `김치냉장고 보증기간`(화면에 그렇게 적혀 있다)이
   * **0건**이었다. 절마다 kw 를 손으로 지으니 다음 모듈에서 또 빠진다 — 불변식으로 지킨다.
   */
  // kw 는 토큰 단위로 중복 제거되므로 **낱말 단위**로 본다(검색도 토큰 AND 이라 기준이 같다)
  const noTitle = entries.filter((e) => {
    const words = String(e.title || '').toLowerCase()
      .replace(/(\d),(?=\d)/g, '$1').replace(/[×✕х]/g, 'x')
      .split(/\s+/).filter((w) => w.length > 1);
    return words.some((w) => !e.kw.includes(w));
  });
  if (noTitle.length) {
    fail(`제목의 낱말이 검색어에 없는 항목 ${noTitle.length}건 — 화면에 적힌 말로 못 찾는다`
      + ` (예: ${noTitle.slice(0, 3).map((e) => `${e.m}/${e.title}`).join(', ')})`);
  } else console.log(`OK: 전 항목(${entries.length}건) 제목의 낱말이 검색어에 포함됨`);

  /* ── ⑧ 앞선 실사용 시뮬레이션에서 0건이던 질의들 ── */
  for (const [q, m, what] of [
    ['김치냉장고 보증기간', 'as', '제목 그대로 친 경우'],
    ['로열블루', 'as', '멤버십 등급 연장'],
    ['드럼세탁기 dd모터', 'as', 'DD모터(원문은 영문 DD MOTOR)'],
    ['안방 에어드레서', 'place', '방 이름으로 찾기'],
    ['침실1 공기청정기', 'place', '도면 표기(침실1)로 찾기'],
    ['주방 식기세척기', 'place', '주방 가전'],
    ['안방에 놓을 에어드레서 크기가 어떻게 되죠', 'place', '용언 활용형이 섞인 자연어'],
  ]) {
    const hit = find(q).filter((e) => e.m === m);
    if (!hit.length) fail(`"${q}" 로 ${what}(${m})가 안 잡힌다`);
    else console.log(`OK: "${q}" → ${m} ${hit.length}건 (${what})`);
  }

  // 방 이름은 ROOM_PLAN 에서 파생시킨다 — 손으로 적으면 화면과 어긋난다
  const roomTagged = entries.filter((e) => e.m === 'place' && /(안방|침실1)/.test(e.kw)).length;
  if (roomTagged < 5) fail(`배치 시뮬레이터에 방 이름이 붙은 항목이 ${roomTagged}건뿐 — ROOM_PLAN 파싱이 깨졌는지 확인할 것`);
}

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
