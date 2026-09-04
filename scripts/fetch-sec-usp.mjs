#!/usr/bin/env node
/**
 * 삼성닷컴 공식 셀링포인트(USP)를 전 카테고리에서 받는다. **로컬 세션 전용** —
 * 클라우드 세션은 프록시가 samsung.com 을 막는다(도면 수집과 같은 제약).
 *
 *   node scripts/fetch-sec-usp.mjs           (전 카테고리)
 *   node scripts/fetch-sec-usp.mjs tvs       (한 카테고리만)
 *
 * ## 왜 이 자료인가
 *
 * `uspDescList` 는 **삼성이 제품마다 공식으로 싣는 셀링포인트 세 줄**이다. 지면을
 * 해석해 지어낸 문장이 아니라 **상담사가 그대로 읽어도 되는 말**이고, 브라우저로 열면
 * 제품 지면 제목으로 그대로 렌더된다. 우리가 문장을 만들면 근거를 대야 하지만
 * 이것은 제조사 공식 문구라 그 부담이 없다.
 *
 * **목록 API 한 번에 딸려 온다** — 카테고리당 1회, 전부 23회면 끝난다. 사양 API 를
 * 제품마다 두드리는 것(1,896회)과 견주면 사실상 공짜다.
 *
 * ## 담는 것과 안 담는 것
 *
 * - 담는다: 모델코드 · 제품명 · **USP 3줄** · 고객 평점/리뷰 수 · 카테고리
 * - **가격은 담지 않는다**(2026-08-17 사용자 결정). 응답에 `curPrice`·`salePrice` 가
 *   있지만 가격 표기는 타사비교에서 출고가로만 한다.
 * - 개인정보성 필드(등록자 이름 해시 등 `sysRegr*`)도 담지 않는다. **뽑아 담는
 *   화이트리스트 방식**이라 응답에 새 필드가 생겨도 새지 않는다(지우는 방식이면
 *   필드가 하나 늘 때마다 조용히 뚫린다 — 서비스센터 수집에서 세운 규칙 그대로다).
 *
 * ## 함정
 *
 * - **`Referer` 를 붙여야 하는 카테고리가 있다.** TV 등은 해당 카테고리 지면을
 *   Referer 로 주지 않으면 JSON 대신 HTML 이 온다.
 * - **`rows` 를 크게 줘야 한 번에 온다.** 응답의 `count` 와 받은 수가 다르면
 *   그 카테고리는 **담지 않고 보고한다** — 반쪽을 담으면 「이 제품은 USP 가 없다」가
 *   거짓이 된다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAT_FILE = path.join(ROOT, 'scripts', 'fixtures', 'sec-catalog.json');
const OUT = path.join(ROOT, 'scripts', 'fixtures', 'sec-usp.json');

const only = process.argv[2] || '';
const cat = JSON.parse(fs.readFileSync(CAT_FILE, 'utf8'));
const cats = (cat.categories || []).filter((c) => !only || c.cat === only);
if (!cats.length) {
  console.error('카테고리를 못 찾았습니다:', only || '(전체)');
  process.exit(1);
}

const BASE = 'https://www.samsung.com/sec';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchCat(c) {
  const url = BASE + '/cxhr/pf/goodsList?dispClsfNo=' + c.dispClsfNo + '&sortType=10&page=1&rows=500';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      /* 카테고리 지면을 Referer 로 준다 — 없으면 일부 카테고리가 HTML 을 돌려준다 */
      Referer: BASE + '/' + c.cat + '/',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const txt = await res.text();
  if (txt.trim().startsWith('<')) throw new Error('JSON 이 아니라 HTML 이 왔습니다 (Referer 문제)');
  return JSON.parse(txt);
}

const items = [];
const report = [];
for (const c of cats) {
  let j = null, err = '';
  for (let try_ = 0; try_ < 3 && !j; try_++) {
    try { j = await fetchCat(c); }
    catch (e) { err = String(e.message || e); await sleep(1500); }
  }
  if (!j) { report.push({ cat: c.cat, ok: false, why: err }); console.log('  ✗', c.cat, err); continue; }

  const prods = j.products || [];
  /* **받은 수가 count 와 다르면 담지 않는다** — 반쪽이면 「USP 가 없는 제품」과
     「덜 받은 제품」이 뭉개진다(이 저장소가 「없음/미공개」를 가르는 그 규칙). */
  if (typeof j.count === 'number' && prods.length < j.count) {
    report.push({ cat: c.cat, ok: false, why: '덜 받음 ' + prods.length + '/' + j.count });
    console.log('  ✗', c.cat, '덜 받음', prods.length + '/' + j.count);
    continue;
  }

  let withUsp = 0;
  for (const p of prods) {
    const usp = Array.isArray(p.uspDescList) ? p.uspDescList.filter((x) => x && String(x).trim()) : [];
    if (usp.length) withUsp++;
    const row = { cat: c.cat, code: String(p.mdlCode || ''), name: String(p.goodsNm || '') };
    if (usp.length) row.usp = usp.map((x) => String(x).trim());
    /* 평점은 상담에서 근거로 쓸 수 있는 공개 정보다. 0 이면 담지 않는다
       (리뷰가 없는 것과 평점이 0 인 것은 다른 말이다). */
    const g = Number(p.reviewGrade || 0), n = Number(p.reviewCount || 0);
    if (g > 0 && n > 0) { row.grade = Math.round(g * 100) / 100; row.reviews = n; }
    items.push(row);
  }
  report.push({ cat: c.cat, ok: true, n: prods.length, usp: withUsp });
  console.log('  ✓', c.cat.padEnd(28), String(prods.length).padStart(4) + '종', '· USP', String(withUsp).padStart(4) + '종');
  await sleep(700);
}

const okCats = report.filter((r) => r.ok);
const out = {
  _note: '삼성닷컴 공식 셀링포인트(uspDescList). 제조사가 제품마다 싣는 문구라 상담사가 그대로 읽어도 된다. 가격은 담지 않는다.',
  _source: BASE + '/cxhr/pf/goodsList?dispClsfNo={번호}&rows=500',
  _tool: 'scripts/fetch-sec-usp.mjs (로컬 전용)',
  collectedAt: new Date().toISOString().slice(0, 10),
  cats: report,
  items,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));

const wu = items.filter((x) => x.usp).length;
const wg = items.filter((x) => x.grade).length;
console.log();
console.log('카테고리 ' + okCats.length + '/' + cats.length + ' · 제품 ' + items.length + '종');
console.log('  USP 있음 : ' + wu + '종 (' + Math.round(wu / Math.max(1, items.length) * 100) + '%)');
console.log('  평점 있음: ' + wg + '종');
console.log('  →', path.relative(ROOT, OUT), Math.round(fs.statSync(OUT).size / 1024) + 'KB');
if (report.some((r) => !r.ok)) {
  console.log();
  console.log('못 받은 카테고리 — 다시 돌리면 그 칸만 채워집니다:');
  report.filter((r) => !r.ok).forEach((r) => console.log('  ', r.cat, '·', r.why));
}
