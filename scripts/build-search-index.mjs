// 허브 통합검색 인덱스 생성기
// 실행: node scripts/build-search-index.mjs  (npm run build:index / npm test 전 자동 실행)
//
// 각 모듈의 실제 데이터는 public/*.html 안의 인라인 <script>에 박혀 있어 허브(React)가
// 직접 읽을 수 없다. 그래서 여기서 정적으로 추출해 public/search-index.json으로 떨궈두고,
// /search 페이지가 그 JSON만 읽어 통합검색을 수행한다.
//
// 주의: 모듈 데이터를 수정하면 이 스크립트를 다시 돌려야 인덱스가 최신화된다.
// scripts/test-search.mjs가 "커밋된 인덱스 == 지금 생성한 인덱스"를 검사해 누락을 막는다.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pub = (f) => path.join(__dirname, '..', 'public', f);
const read = (f) => fs.readFileSync(pub(f), 'utf8');

const entries = [];
const add = (e) => entries.push(e);

// ── 1. 모델파인더: 제품(CE/MX/Harman) + 카테고리 ──
{
  const html = read('finder-app.html');
  const grab = (re) => {
    const m = html.match(re);
    return m ? JSON.parse(m[1]) : [];
  };
  const products = [
    ...grab(/let PRODUCTS = (\[[\s\S]*?\]);/),
    ...grab(/const HARMAN_PRODUCTS = (\[[\s\S]*?\]);/),
  ];
  const cats = new Set();
  for (const p of products) {
    cats.add(p.cat);
    add({
      t: 'product', m: 'finder', title: p.model,
      sub: `${p.cat}${p.group ? ' · ' + p.group : ''}`,
      kw: [p.model, p.cat, p.group, ...(p.on || []), ...(p.fx || []).flat(), ...(p.usp || [])].filter(Boolean).join(' '),
      href: `/finder?q=${encodeURIComponent(p.model)}`,
      // 통합검색에서 카탈로그를 열지 않고 바로 상세 스펙을 펼쳐보기 위한 데이터
      spec: (p.fx || []).filter((f) => f[1]),
      on: p.on || [],
      off: p.off || [],
      price: p.price ?? null,
      note: p.note || '',
      usp: p.usp || [],
      catOk: !!p.cat_ok,
    });
  }
  for (const c of cats) {
    add({ t: 'category', m: 'finder', title: c, sub: '모델파인더 카테고리',
      kw: c, href: `/finder?q=${encodeURIComponent(c)}` });
  }
}

// ── 2. 설치환경 가이드: 카테고리 + 드롭다운 검색 키워드(data-kw) ──
{
  const html = read('install-app.html');
  const re = /data-cat="([^"]+)"\s+data-kw="([^"]*)"/g;
  let m;
  while ((m = re.exec(html))) {
    add({ t: 'category', m: 'install', title: m[1], sub: '설치 공간·전기/급배수 요건',
      kw: `${m[1]} ${m[2]} 설치 설치환경`, href: `/install?cat=${encodeURIComponent(m[1])}` });
  }
}

// ── 3. 타사비교: 카테고리 + 삼성 비교 모델명 ──
{
  const html = read('compare-app.html');
  const cats = [...new Set([...html.matchAll(/selectCat\('([^']+)'\)/g)].map((x) => x[1]))];
  for (const c of cats) {
    add({ t: 'category', m: 'compare', title: c, sub: '타사비교 · 스펙 비교표·응대 스크립트',
      kw: `${c} 비교 타사비교 경쟁사`, href: `/compare?cat=${encodeURIComponent(c)}` });
  }
}

// ── 4. AI Care: 케어십 대상 제품 ──
{
  const html = read('care-app.html');
  const m = html.match(/const PRODUCTS = \[([\s\S]*?)\n\];/);
  if (m) {
    const re = /\{key:"([^"]+)",\s*name:"([^"]+)",[^}]*?desc:"([^"]*)"/g;
    let x;
    while ((x = re.exec(m[1]))) {
      add({ t: 'care', m: 'care', title: x[2], sub: `AI Care · ${x[3]}`,
        kw: `${x[2]} ${x[3]} 케어십 구독 care`, href: `/care?cat=${encodeURIComponent(x[1])}` });
    }
  }
}

// ── 5. 허브 모듈·외부 링크 (수동 정의 — 소스가 app/page.tsx라 여기서 별도 관리) ──
// 쿠폰 프로그램 URL만은 app/page.tsx의 COUPON_LINKS에서 직접 읽는다.
// 여기에 URL을 복사해두면 한쪽만 바뀌었을 때 검색 결과가 죽은 링크를 가리키게 된다.
const readSrc = (p) => fs.readFileSync(path.join(__dirname, '..', ...p.split('/')), 'utf8').replace(/\r\n/g, '\n');
function couponHref() {
  const src = readSrc('app/page.tsx');
  const block = src.match(/const COUPON_LINKS = \[([\s\S]*?)\n\]/);
  const m = block && block[1].match(/href:\s*'([^']+)'/);
  if (!m) throw new Error('app/page.tsx의 COUPON_LINKS에서 쿠폰 URL을 찾지 못했습니다');
  return m[1];
}

// 허브 모듈은 손으로 적지 않고 app/page.tsx의 MODULE_GROUPS에서 그대로 뽑는다.
// 손으로 적으면 화면에 보이는 워딩(섹션명·카드 설명)이 인덱스에 빠져 검색이 안 된다
// — 실제로 "교육"을 검색해도 📚 교육 섹션의 레벨업테스트·URL 퀴즈가 안 나왔다.
function hubModulesFromSource() {
  const src = readSrc('app/page.tsx');
  const block = src.match(/const MODULE_GROUPS[^=]*=\s*\[([\s\S]*?)\n\]\n/);
  if (!block) throw new Error('app/page.tsx에서 MODULE_GROUPS를 찾지 못했습니다');
  const body = block[1];
  const groups = [...body.matchAll(/title: '([^']+)',\s*\n\s*modules: \[/g)]
    .map((m) => ({ at: m.index, title: m[1] }));
  const mods = [...body.matchAll(
    /href: '([^']+)',\s*\n\s*icon: '([^']*)',\s*\n\s*title: '([^']+)',\s*\n\s*desc: '([^']+)'/g)];
  if (!groups.length || !mods.length) throw new Error('MODULE_GROUPS 파싱 실패 — 형식이 바뀌었는지 확인할 것');
  const out = mods.map((m) => {
    const group = [...groups].reverse().find((g) => g.at < m.index);
    return { href: m[1], title: m[3], desc: m[4], group: group ? group.title : '' };
  });
  // AX 현황 대시보드는 그룹에 속하지 않고 허브 최하단 별도 섹션에 있어 위 블록에 없다
  const admin = src.match(
    /const ADMIN_MODULE[^=]*=\s*\{\s*\n\s*href: '([^']+)',\s*\n\s*icon: '[^']*',\s*\n\s*title: '([^']+)',\s*\n\s*desc: '([^']+)'/);
  if (!admin) throw new Error('app/page.tsx에서 ADMIN_MODULE을 찾지 못했습니다');
  out.push({ href: admin[1], title: admin[2], desc: admin[3], group: '📊 AX 현황' });
  return out;
}

// 사이드바/하단 내비 라벨과 그 그룹명도 검색어가 되어야 한다
function navLabelsFromSource() {
  const src = readSrc('components/Navigation.tsx');
  const out = new Map(); // href → 라벨·그룹명 모음
  const push = (href, ...words) => out.set(href, [...(out.get(href) || []), ...words]);
  for (const m of src.matchAll(/\{ href: '([^']+)',\s*label: '([^']+)'/g)) push(m[1], m[2]);
  const groups = [...src.matchAll(/title: '([^']+)',\s*\n\s*items: \[([\s\S]*?)\n\s*\],/g)];
  for (const g of groups) {
    for (const i of g[2].matchAll(/href: '([^']+)'/g)) push(i[1], g[1]);
  }
  if (!out.size) throw new Error('components/Navigation.tsx에서 내비 라벨을 찾지 못했습니다');
  return out;
}

const navWords = navLabelsFromSource();
const MODULES = [
  ...hubModulesFromSource().map((m) => ({
    title: m.title, sub: m.desc, href: m.href, ext: /^https?:/.test(m.href),
    // 카드 설명·섹션명·사이드바 라벨을 모두 키워드에 넣어 화면에 보이는 워딩이면 검색되게 한다
    kw: [m.desc, m.group, ...(navWords.get(m.href) || []), m.href.replace(/^\//, '')].join(' '),
  })),
  // 컨시어지는 링크가 3개인 데다 지점 선택을 먼저 해야 해서 허브 카드로 보낸다.
  // 쿠폰은 링크가 하나뿐이라 다른 모듈처럼 검색 결과에서 바로 프로그램이 열리게 한다.
  // (패키지 플래너는 2026-08-03 운영 종료 — 라우트·정적앱·인덱스 항목 모두 제거했다.)
  { title: '컨시어지 프로그램', sub: '매장 대기접수·전광판 (지점 선택 필요)', kw: '컨시어지 대기 접수 전광판 concierge 🏬 매장운영 도구', href: '/#concierge' },
  { title: '쿠폰 배포프로그램', sub: '매장 쿠폰 재고·발급현황', kw: '쿠폰 시크릿쿠폰 coupon 발급 🏬 매장운영 도구', href: couponHref(), ext: true },
];
for (const mod of MODULES) {
  add({ t: 'module', m: 'hub', title: mod.title, sub: mod.sub, kw: `${mod.title} ${mod.kw}`, href: mod.href, ext: !!mod.ext });
}

// 키워드는 소문자로 정규화해 검색 시 비교 비용을 줄인다.
// 같은 토큰이 여러 번 반복되는 경우가 많아(제품 하나에 "지원"이 20번씩) 중복을 없앤다 —
// 검색은 질의를 공백으로 쪼갠 뒤 kw.includes(토큰)로 판정하므로 토큰이 한 번씩만 남아도
// 결과가 동일하고, 인덱스는 90KB 가까이 줄어든다.
for (const e of entries) {
  e.kw = [...new Set(e.kw.toLowerCase().split(/\s+/).filter(Boolean))].join(' ');
}

// ── 인덱스를 "검색용 경량본"과 "상세 스펙"으로 분리해 내보낸다 ──
// /search는 첫 진입에 경량본만 받고, 사용자가 결과를 펼칠 때 상세를 한 번 더 받는다.
// 매장에서 폰으로 쓰는 도구라 첫 로딩에 상세 스펙(160KB 이상)까지 받을 이유가 없다.
// 두 파일의 배열 인덱스가 같은 항목을 가리키므로(i 필드) 순서를 바꾸지 말 것.
const DETAIL_KEYS = ['spec', 'on', 'off', 'price', 'note', 'usp'];
const light = [];
const detail = [];
entries.forEach((e, i) => {
  const d = {};
  for (const k of DETAIL_KEYS) {
    const v = e[k];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    d[k] = v;
  }
  const hasDetail = Object.keys(d).length > 0;
  const l = { i, t: e.t, m: e.m, title: e.title, sub: e.sub, kw: e.kw, href: e.href };
  if (e.ext) l.ext = 1;
  if (e.catOk) l.catOk = 1;
  if (hasDetail) { l.d = 1; detail.push({ i, ...d }); }
  light.push(l);
});

const out = { generatedFrom: 'scripts/build-search-index.mjs', count: entries.length, entries: light };
fs.writeFileSync(pub('search-index.json'), JSON.stringify(out));
fs.writeFileSync(pub('search-detail.json'), JSON.stringify({ count: detail.length, entries: detail }));
const kb = (f) => Math.round(fs.statSync(pub(f)).size / 1024);
console.log(`  경량 인덱스 ${kb('search-index.json')}KB / 상세 ${kb('search-detail.json')}KB (${detail.length}건, 펼칠 때 지연 로드)`);

const byModule = {};
for (const e of entries) byModule[e.m] = (byModule[e.m] || 0) + 1;
console.log(`search-index.json 생성: ${entries.length}건`, JSON.stringify(byModule));
