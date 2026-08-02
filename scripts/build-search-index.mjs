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
      kw: [p.model, p.cat, p.group, ...(p.on || []), ...(p.fx || []).flat()].filter(Boolean).join(' '),
      href: `/finder?q=${encodeURIComponent(p.model)}`,
      // 통합검색에서 카탈로그를 열지 않고 바로 상세 스펙을 펼쳐보기 위한 데이터
      spec: (p.fx || []).filter((f) => f[1]),
      on: p.on || [],
      off: p.off || [],
      price: p.price ?? null,
      note: p.note || '',
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
const readSrc = (p) => fs.readFileSync(path.join(__dirname, '..', ...p.split('/')), 'utf8');
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
  // 패키지 플래너는 /planner 라우트가 살아 있으나 허브 카드·사이드바 어디에도 링크가 없어
  // 통합검색이 유일한 진입로다. 화면 워딩을 뽑아올 곳이 없으므로 여기서 직접 정의한다.
  { title: '패키지 플래너', sub: '평형별 패키지 구성·견적 (허브 카드에는 없는 모듈)', kw: '패키지 플래너 견적 혼수 신혼 planner 평형 구성', href: '/planner' },
  { title: '컨시어지 프로그램', sub: '매장 대기접수·전광판 (지점 선택 필요)', kw: '컨시어지 대기 접수 전광판 concierge 🏬 매장운영 도구', href: '/#concierge' },
  { title: '쿠폰 배포프로그램', sub: '매장 쿠폰 재고·발급현황', kw: '쿠폰 시크릿쿠폰 coupon 발급 🏬 매장운영 도구', href: couponHref(), ext: true },
];
for (const mod of MODULES) {
  add({ t: 'module', m: 'hub', title: mod.title, sub: mod.sub, kw: `${mod.title} ${mod.kw}`, href: mod.href, ext: !!mod.ext });
}

// ── 6. 패키지 플래너 카테고리 ──
{
  const html = read('package-planner.html');
  const block = html.match(/const DB=\{([\s\S]*?)\n\};/);
  const KO = { fridge: '냉장고', washer: '세탁기', dryer: '건조기', tv: 'TV', aircon: '에어컨',
    dishwasher: '식기세척기', airdresser: '에어드레서', robot: '로봇청소기', vacuum: '청소기',
    kimchi: '김치냉장고', induction: '인덕션', airpurifier: '공기청정기', microwave: '전자레인지',
    soundbar: '사운드바', laptop: '노트북', tablet: '태블릿', phone: '스마트폰', wearable: '웨어러블' };
  if (block) {
    for (const k of [...new Set([...block[1].matchAll(/^\s+(\w+):\[/gm)].map((x) => x[1]))]) {
      const ko = KO[k] || k;
      add({ t: 'category', m: 'planner', title: ko, sub: '패키지 플래너 · 평형별 구성·견적',
        kw: `${ko} ${k} 패키지 견적 혼수`, href: '/planner' });
    }
  }
}

// 키워드는 소문자로 정규화해 검색 시 비교 비용을 줄인다
for (const e of entries) e.kw = e.kw.toLowerCase();

const out = { generatedFrom: 'scripts/build-search-index.mjs', count: entries.length, entries };
fs.writeFileSync(pub('search-index.json'), JSON.stringify(out));

const byModule = {};
for (const e of entries) byModule[e.m] = (byModule[e.m] || 0) + 1;
console.log(`search-index.json 생성: ${entries.length}건`, JSON.stringify(byModule));
