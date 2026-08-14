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
// 색인과 질의는 **같은 정규화**를 거쳐야 한다 — 한쪽만 쉼표를 지우면
// "1,853"으로 색인되고 "1853"으로 찾아 영영 안 걸린다. 그래서 규칙을 한 파일에 둔다.
// (그래서 이 스크립트는 --experimental-strip-types 로 돈다 — package.json 참고)
import { normalize } from '../lib/searchTerms.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pub = (f) => path.join(__dirname, '..', 'public', f);
const read = (f) => fs.readFileSync(pub(f), 'utf8');

const entries = [];
/*
 * **화면에 보이는 제목은 반드시 검색어에 들어간다.**
 *
 * 각 절이 kw 를 손으로 짓다 보니 AS 묶음 107건만 제목이 빠져 있었다 — 화면에는
 * `김치냉장고 보증기간` 이라고 적혀 있는데 kw 에는 `보증` 만 있어 **그 제목 그대로 쳐도
 * 0건**이었다(`로열블루`도 같은 이유로 0건). 화면에 적힌 말로 못 찾는 것은 검색이 아니다.
 *
 * 절마다 고치면 다음 모듈에서 또 빠지므로 **여기 한 곳에서** 붙인다.
 * `test-search.mjs` 가 전 항목에 대해 이 불변식을 검사한다.
 */
const add = (e) => entries.push({ ...e, kw: `${e.kw} ${e.title}` });

/*
 * ── 1. 제품 상세검색: **제품만** ──
 * **분류(카테고리)·제목은 넣지 않는다**(2026-08-11 사용자 요청: *"제품상세검색 항목은
 * 제품관련만 검색되도록 해주세요. 다른 제목이나 분류가 검색되면 안 됩니다. 말 그대로
 * 가전제품(CE+MX+B2B)만 검색입니다"*).
 *
 * 예전에는 카테고리 줄(`t:'category'`)도 함께 넣어, "냉장고"를 치면 제품 108종 사이에
 * **"냉장고"라는 분류 줄**이 끼어 있었다. 분류로 찾는 일은 설치환경·타사비교 묶음이 하고,
 * 이 묶음은 **제품 그 자체**만 담는다. `/finder` 화면은 원래부터 제품 카드만 렌더한다.
 */
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
  for (const p of products) {
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
}

/*
 * 미니앱 안의 객체 리터럴을 그대로 꺼내 쓴다.
 * JSON 이 아니라 홑따옴표·주석·후행 쉼표가 섞인 JS 리터럴이라 JSON.parse 로는 안 되고,
 * 정규식으로 필드를 하나씩 긁으면 원문이 조금만 바뀌어도 **조용히 빈 값이 된다**
 * (그러면 그 모듈이 통째로 검색에서 사라지는데 화면에는 아무 표시도 안 난다).
 * 우리 저장소의 우리 소스라 평가해서 읽는 편이 훨씬 안전하다 — 못 찾으면 던진다.
 */
function literal(html, re, label) {
  const m = html.match(re);
  if (!m) throw new Error(`${label} 를 찾지 못했습니다 — 원문 형식이 바뀌었는지 확인할 것`);
  return (0, eval)(`(${m[1]})`);
}
/* 중첩 객체·배열을 통째로 한 줄 키워드로 편다(값만 쓰고 키 이름은 버린다) */
function flatten(v, out = []) {
  if (v == null) return out;
  if (Array.isArray(v)) { for (const x of v) flatten(x, out); return out; }
  if (typeof v === 'object') { for (const k of Object.keys(v)) flatten(v[k], out); return out; }
  out.push(String(v));
  return out;
}

// ── 2. 설치환경 가이드: 카테고리 + 검색어 + **본문 전체** ──
// 예전에는 data-kw 만 담았는데, 그러면 "이격거리 50mm"·"천장고"·"전용 콘센트"처럼
// 상담에서 실제로 묻는 말이 하나도 안 걸렸다. 본문(공간·설비·체크리스트·주의)까지 넣는다.
//
// **검색어는 `CAT_KW` 에서 읽는다.** 카테고리 고르기를 심벌 타일로 바꾸면서(2026-08-12)
// 타일을 `INSTALL_DB` 에서 세워 그리게 됐고, 그때 옛 `data-kw` 속성이 HTML 에서 사라졌다.
// 정규식으로 속성을 긁던 코드가 **조용히 빈 값**이 되어 '키친핏'·'사이드바이사이드' 같은
// 검색어 21건이 색인에서 통째로 빠졌다(재생성 대조 검사가 잡아냈다).
// `literal()` 로 평가해 읽으므로 이제는 못 찾으면 조용히 넘어가지 않고 **던진다.**
{
  const html = read('install-app.html');
  const DBI = literal(html, /const INSTALL_DB = (\{[\s\S]*?\n\});/, 'install-app.html 의 INSTALL_DB');
  const KWI = literal(html, /const CAT_KW = (\{[\s\S]*?\n\});/, 'install-app.html 의 CAT_KW');
  for (const [cat, d] of Object.entries(DBI)) {
    add({ t: 'category', m: 'install', title: cat, sub: d.subtitle || '설치 공간·전기/급배수 요건',
      kw: [cat, KWI[cat] || '', '설치 설치환경 이격 치수',
        ...flatten([d.subtitle, d.types, d.space, d.utility, d.checklist, d.cautions])].join(' '),
      href: `/install?cat=${encodeURIComponent(cat)}` });
  }
}

// ── 3. 타사비교: 카테고리 + 삼성 비교 모델 + 셀링포인트 ──
// 카테고리 이름만 담아 뒀더니 "Micro RGB"·"무풍" 같은 셀링포인트로는 안 걸렸다.
{
  const html = read('compare-app.html');
  const DBC = literal(html, /\nconst DB = (\{[\s\S]*?\n\});/, 'compare-app.html 의 DB');
  for (const [cat, d] of Object.entries(DBC)) {
    const sams = d.samsung || [];
    add({ t: 'category', m: 'compare', title: cat, sub: '타사비교 · 스펙 비교표·응대 스크립트',
      kw: [cat, '비교 타사비교 경쟁사 lg', ...flatten(d)].join(' '),
      href: `/compare?cat=${encodeURIComponent(cat)}` });
    for (const s of sams) {
      add({ t: 'product', m: 'compare', title: s.name, sub: `${cat} · 타사비교 삼성 대표모델`,
        kw: [s.name, cat, '타사비교 비교 경쟁사', ...flatten([s.on, s.specs, s.grade])].join(' '),
        href: `/compare?cat=${encodeURIComponent(cat)}` });
    }
  }
}

// ── 4. AI구독 케어: 대상 제품 + 케어 내용 ──
{
  const html = read('care-app.html');
  const m = html.match(/const PRODUCTS = \[([\s\S]*?)\n\];/);
  const DATA = literal(html, /\nconst DATA = (\{[\s\S]*?\n\});/, 'care-app.html 의 DATA');
  /*
   * **모바일 구독은 DATA 에 없다** — 회차 구조가 없어 별도 객체(`MX_SUB`)로 둔다.
   * 그것까지 담지 않으면 화면에 크게 적힌 '잔존가 보장'·'Samsung Care+'·'민팃' 으로
   * 검색해도 0건이 된다. 화면에 적힌 말로 못 찾는 것은 검색이 아니다(AS 묶음에서 이미
   * 같은 실수를 했다). 방문케어 관련 말은 넣지 않는다 — 모바일에는 없는 개념이다.
   */
  const MX = literal(html, /\nconst MX_SUB = (\{[\s\S]*?\n\});/, 'care-app.html 의 MX_SUB');
  const mxKw = flatten(MX).join(' ') + ' 모바일 구독 갤럭시 구독클럽 자급제 스마트폰 구독';
  if (m) {
    const re = /\{key:"([^"]+)",\s*name:"([^"]+)",[^}]*?desc:"([^"]*)"[^}]*?st:"([^"]*)"/g;
    let x;
    while ((x = re.exec(m[1]))) {
      const isMx = x[4] === 'mx';
      add({ t: 'care', m: 'care', title: x[2], sub: `AI구독 케어 · ${x[3]}`,
        kw: [x[2], x[3],
          isMx ? mxKw : '케어십 구독 care 방문케어 자가관리 무상수리',
          ...(isMx ? [] : flatten(DATA[x[1]]))].join(' '),
        href: `/care?cat=${encodeURIComponent(x[1])}` });
    }
  }
}

// ── 5. AS 관련 정보: 품목별 보증 · 물류센터 · 이전설치 협력사 ──
// 상담에서 "수원은 어느 센터죠"·"컴프레서 몇 년이죠"는 허브 검색창에도 그대로 들어온다.
{
  const html = read('as-app.html');
  /*
   * **`?q=` 는 AS 앱 안의 항목 제목이어야 한다** — 화면에 적히는 제목이 아니다.
   *
   * 108건이 전부 맨 `/as` 로 가던 것을 고친 것인데(2026-08-12), 앱이 그 값으로
   * 자기 목록에서 항목을 찾아 `go()` 를 부르므로 **제목이 한 글자라도 다르면
   * 조용히 검색 결과만 뜬다.** 그래서 화면 제목(`냉장고 보증기간`)이 아니라
   * 앱 제목(`냉장고`)을 넣는다. 어긋나면 `test-search.mjs` 가 잡는다.
   */
  const asLink = (title) => `/as?q=${encodeURIComponent(title)}`;
  const DBA = literal(html, /\nconst DB = (\{[\s\S]*?\});\n/, 'as-app.html 의 DB');
  const CEN = literal(html, /\nconst CENTERS = (\[[\s\S]*?\n\]);/, 'as-app.html 의 CENTERS');
  const OPS = literal(html, /\nconst OPS = (\{[\s\S]*?\n\});/, 'as-app.html 의 OPS');
  const VOCHQ = literal(html, /\nconst VOC_HQ = (\{[\s\S]*?\});/, 'as-app.html 의 VOC_HQ');
  const B2B = literal(html, /\nconst B2B = (\[[\s\S]*?\n\]);/, 'as-app.html 의 B2B');
  const IT = literal(html, /\nconst B2B_IT = (\[[\s\S]*?\n\]);/, 'as-app.html 의 B2B_IT');
  const SINK = literal(html, /\nconst SINK = (\[[\s\S]*?\n\]);/, 'as-app.html 의 SINK');
  const NAT = literal(html, /\nconst B2B_NATION = (\[[\s\S]*?\n\]);/, 'as-app.html 의 B2B_NATION');
  const MID = literal(html, /\nconst MID = (\[[\s\S]*?\n\]);/, 'as-app.html 의 MID');
  const ROYAL = literal(html, /\nconst ROYAL = (\{[\s\S]*?\});\n/, 'as-app.html 의 ROYAL');

  // 멤버십 등급 연장 — 화면에는 있는데 색인에 없어 '로열블루'가 0건이었다
  add({ t: 'category', m: 'as', title: `멤버십 ${ROYAL.grade}`, sub: ROYAL.benefit,
    kw: [...flatten(ROYAL), '멤버십 등급 연장 무상수리 로열'].join(' '), href: asLink(`멤버십 ${ROYAL.grade}`) });

  for (const [cat, d] of Object.entries(DBA)) {
    add({ t: 'category', m: 'as', title: `${cat} 보증기간`,
      sub: `무상보증 ${d.base}${d.hold ? ` · 부품보유 ${d.hold}년` : ''}`,
      kw: [cat, 'as 보증 무상보증 무상수리 부품보유 내용연수 핵심부품', ...flatten(d)].join(' '),
      href: asLink(cat) });
  }
  for (const c of CEN) {
    add({ t: 'contact', m: 'as', title: `${c.t} (물류센터)`, sub: `${c.n} · ${c.a}`,
      kw: [c.t, c.code, c.n, c.b, c.a, ...c.kw, ...flatten(OPS[c.code]),
        '물류센터 배송 설치 관할 tc 상황실 운영 voc'].join(' '), href: asLink(c.t) });
  }
  add({ t: 'contact', m: 'as', title: '물류 VOC 본사 창구', sub: `${VOCHQ.n} · 배송·설치 VOC 접수`,
    kw: [VOCHQ.n, ...flatten(VOCHQ.x), 'voc 물류 본사 접수 불만 배송 설치'].join(' '), href: asLink('물류 VOC 본사 창구') });
  for (const c of B2B) {
    add({ t: 'contact', m: 'as', title: `${c.p} · ${c.c} (빌트인 이전설치)`, sub: `${c.n} · ${c.a}`,
      kw: [c.p, c.c, c.code, c.n, ...flatten(c.x), c.a, '이전설치 빌트인 b2b 관할 협력사'].join(' '),
      href: asLink(`${c.p} · ${c.c}`) });
  }
  for (const c of IT) {
    add({ t: 'contact', m: 'as', title: `${c.p} · ${c.c} (IT 이전설치)`, sub: `${c.n} · ${c.a}`,
      kw: [c.p, c.c, c.code, c.n, c.d || '', c.a, '이전설치 it b2b 관할 협력사 노트북 모니터 프린터'].join(' '),
      href: asLink(`${c.p} · ${c.c}`) });
  }
  for (const s of SINK) {
    add({ t: 'contact', m: 'as', title: `${s.p} (싱크장 리폼)`, sub: `${s.n} · ${s.a}`,
      kw: [s.p, s.n, s.n2 || '', ...flatten(s.x), s.a, '싱크대 싱크장 리폼 식기세척기 식세기 빌트인 이전설치'].join(' '),
      href: asLink(s.p) });
  }
  for (const x of NAT) {
    add({ t: 'contact', m: 'as', title: `${x.t} 이전설치`, sub: `${x.p} · ${x.n} · ${x.d}`,
      kw: [x.p, x.t, x.n, x.d, ...flatten(x.x), '이전설치 전국 담당'].join(' '), href: asLink(`${x.t} 이전설치`) });
  }
  // 중앙에너지 설치 지사 — "우리 동네는 어디서 나오나"(접수는 본사콜 하나)
  for (const m of MID) {
    add({ t: 'contact', m: 'as', title: `${m.g} (중앙에너지)`, sub: `${m.tc} · ${m.a}`,
      kw: [m.g, m.tc, m.a, '중앙에너지 인덕션 정수기 후드 지사 설치 관할'].join(' '), href: asLink(`${m.g} (중앙에너지)`) });
  }
}

// ── 6. 배치 시뮬레이터: 사이즈별 대표 규격 ──
// "냉장고 4도어가 몇 mm 죠"가 검색으로 바로 나와야 한다. 숨김 항목(`hidden`)은 넣지 않는다 —
// 목록·추천·대안이 같은 목록을 봐야 한다는 규칙과 같다(CLAUDE.md 공기청정기 벽걸이 건).
{
  const reps = JSON.parse(fs.readFileSync(pub('size-reps.json'), 'utf8'));
  /*
   * **방 이름으로도 찾을 수 있어야 한다** — 상담에서 나오는 말이 *"안방에 놓을 에어드레서"*
   * 이지 *"에어드레서 규격"* 이 아니다. 동의어표에 `안방 ↔ 침실1` 을 넣어 두고도 색인에
   * 두 표기가 **한 건도 없어** 그 질의가 통째로 0건이었다.
   *
   * 방↔가전 대응은 배치 시뮬레이터의 `ROOM_PLAN` 이 이미 들고 있다(가전 선택 시트의 방
   * 드롭다운 기본값이 이 표에서 나온다). **여기서 새로 짓지 않고 그 표를 읽는다** —
   * 따로 적으면 한쪽만 고쳤을 때 화면과 검색이 어긋난다.
   */
  const ROOM_PLAN = literal(read('place-app.html'), /\nconst ROOM_PLAN = (\{[\s\S]*?\n\});/,
    'place-app.html 의 ROOM_PLAN');
  // 도면 표기가 '침실1'인 곳이 절반이고 상담에서는 '안방'이라 부른다(CLAUDE.md 실측 120장)
  const ROOM_ALIAS = { 침실: ['침실', '안방', '침실1', '침실2', '침실3', '주침실'] };
  const roomsFor = (cat) => Object.entries(ROOM_PLAN)
    .filter(([, cats]) => cats.includes(cat))
    .flatMap(([use]) => ROOM_ALIAS[use] || [use]);

  for (const r of reps) {
    if (r.hidden) continue;
    const p = (r.parts || [])[0];
    add({ t: 'size', m: 'place', title: `${r.cat} ${r.size}`,
      sub: p ? `${p.raw} (${p.label})` : r.sizeLabel || '',
      kw: [r.cat, r.size, r.group, r.sizeLabel, r.note, '배치 시뮬레이터 치수 규격 사이즈 이격',
        ...roomsFor(r.cat),
        ...flatten(r.specs), ...flatten((r.parts || []).map((x) => [x.part, x.raw]))].join(' '),
      /*
       * **누르면 그 사이즈가 골라진 채로 열려야 한다.** 예전에는 70건이 전부 맨 `/place`
       * 라 앱 첫 화면만 열렸다(2026-08-12 사용자 지적). 카테고리와 사이즈를 `|` 로 잇는다 —
       * 카테고리만 넘기면 "건조기 폭 600mm"가 아니라 대표 사이즈가 잡힌다.
       */
      href: `/place?pick=${encodeURIComponent(`${r.cat}|${r.size}`)}` });
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
  e.kw = [...new Set(normalize(e.kw).split(/\s+/).filter(Boolean))].join(' ');
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
