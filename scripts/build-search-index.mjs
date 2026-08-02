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
function couponHref() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'page.tsx'), 'utf8');
  const block = src.match(/const COUPON_LINKS = \[([\s\S]*?)\n\]/);
  const m = block && block[1].match(/href:\s*'([^']+)'/);
  if (!m) throw new Error('app/page.tsx의 COUPON_LINKS에서 쿠폰 URL을 찾지 못했습니다');
  return m[1];
}

const MODULES = [
  { title: '모델파인더', sub: '키워드로 전 제품 검색', kw: '모델파인더 제품검색 키워드 finder', href: '/finder' },
  { title: '모바일 카탈로그', sub: '삼성스토어 제품 카탈로그', kw: '카탈로그 catalog 모바일카탈로그 삼성스토어', href: 'https://www.samsungstore.com/event/catalog.sesc?menu=w110', ext: true },
  { title: 'AI Care 검색기', sub: '구독케어 항목·조건 조회', kw: 'aicare 케어십 구독 care', href: '/care' },
  { title: '타사비교', sub: '비교표·셀링포인트·응대 스크립트', kw: '타사비교 경쟁사 비교 compare', href: '/compare' },
  { title: '설치환경 가이드', sub: '설치 공간·전기/급배수 요건', kw: '설치환경 설치 install 치수', href: '/install' },
  { title: '레벨업테스트', sub: '제품 전문가 역량 평가', kw: '레벨업테스트 시험 평가 test 문제', href: '/test' },
  { title: 'URL 퀴즈 생성', sub: '직원 평가용 퀴즈 자동 생성', kw: 'url퀴즈 퀴즈 quiz 문제생성', href: '/quiz' },
  { title: '패키지 플래너', sub: '평형별 패키지 구성·견적', kw: '패키지 플래너 견적 혼수 신혼 planner 평형', href: '/planner' },
  { title: 'AX 현황 대시보드', sub: '사용 현황·통계·CSV', kw: '대시보드 통계 admin 현황', href: '/admin' },
  // 컨시어지는 링크가 3개인 데다 지점 선택을 먼저 해야 해서 허브 카드로 보낸다.
  // 쿠폰은 링크가 하나뿐이라 다른 모듈처럼 검색 결과에서 바로 프로그램이 열리게 한다.
  { title: '컨시어지 프로그램', sub: '매장 대기접수·전광판 (지점 선택 필요)', kw: '컨시어지 대기 접수 전광판 concierge', href: '/#concierge' },
  { title: '쿠폰 배포프로그램', sub: '매장 쿠폰 재고·발급현황', kw: '쿠폰 시크릿쿠폰 coupon 발급', href: couponHref(), ext: true },
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
