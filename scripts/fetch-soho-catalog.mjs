/* # SOHO몰(B2B) 제품 목록 수집 — `npm run fetch:soho`
 *
 * 2026-08-25 사장님 지시 — *"두 개의 사이트 정보를 추가하면 시험문제의 다양성을
 * 확보할 수 있을 것 같은데 확인 부탁드립니다"* → 확인 결과 **205종이 우리에게 없다.**
 *
 * ## 왜 B2B 를 따로 받는가
 * 삼성닷컴 현행 목록(`sec-catalog.json`)은 **B2C 만** 담는다. 그래서 B2B 상품이
 * "현행 목록에 없다"로 나와 **단종으로 오판**했다 — 공기청정기 벽걸이
 * `AX99N4020WWD` 가 실제로 그랬고 사장님이 *"B2B 상품으로 단종은 아닙니다"* 로 잡아 줬다.
 * 이제 "현행 목록에 없다"의 원인이 셋이다 — **색상 변형 · 단종 · B2B**.
 *
 * ## robots — 받기 전에 확인했다 (2026-08-25)
 *   · `samsungebiz.com` : 금지는 검색 결과 지면 3개뿐이고 `/sohomall/` 은 허용
 *   · `www.samsung.com` : `Disallow: /sec/` 는 **Yandex 그룹**(77행부터) 것이다.
 *     우리 그룹이 막는 것은 검색 결과 지면(sec search · business search)뿐.
 *   자이에서 데인 순서를 지킨다 — robots 확인 → 구조 → 검증 → 수집.
 *
 * ## 구조는 B2C 와 같다
 * `GET /sohomall/cxhr/pf/goodsList?dispClsfNo={번호}&sortType=10&page=1&rows=500`
 * **`dispClsfNo` 를 손으로 적지 않는다** — 목록 지면을 열면 그 안에 들어 있다.
 *
 * ## 목록 API 가 셀링포인트까지 준다
 * `uspDescList` 가 제품당 3줄쯤 온다. 타사비교의 `on[]` 과 같은 모양이라
 * **제품 지면을 건별로 방문하지 않고도 문항을 만들 수 있다.**
 *
 * ## 가격은 담지 않는다
 * 이 저장소의 규칙이다(가격 표기는 타사비교에서 출고가로만 한다).
 * 응답에 `curPrice` 등 가격 필드가 잔뜩 오지만 **버린다.**
 *
 * ## 업종 카테고리는 "새 제품"이 아니라 "추천 조합"이다
 * 코인세탁·산후조리원·미용실·헬스장 등 9개를 갈라 세니 **업종에만 있는 제품은 12종**이고
 * 나머지는 같은 제품의 재분류였다. 그래서 제품마다 **어느 업종에 걸렸는지**를 함께 담는다 —
 * 그 자체가 상담 시나리오이고 시험 소재다. */
import fs from 'node:fs';

const BASE = 'https://www.samsungebiz.com';
const OUT = 'scripts/fixtures/soho-catalog.json';
const UA = { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ko-KR,ko;q=0.9' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 업종 카테고리 — 제품군이 아니라 "어느 업소에 파는가" 다 */
const BIZ = new Set(['restaurant', 'accomodation', 'retail', 'education',
  'postpartum-care-center', 'coin-laundry', 'hairdressing', 'fitness-facility']);

/** 대기열(Queue-it)에 걸린 지면은 **우회하지 않는다.** 신제품 예약판매 때 순서를
 *  지키라고 둔 장치라 뚫는 것은 규칙 위반이다. 사유를 정확히 남겨 다음에 다시
 *  시도할 근거를 만든다 — `fetch failed` 로 적으면 원인을 잃는다
 *  (도면 수집에서 "이미지 없음"과 "받기 거부됨"을 뭉갰다가 38곳을 놓친 것과 같다). */
class Queued extends Error {}

async function get(url, referer) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: referer ? { ...UA, Referer: referer } : UA, redirect: 'manual' });
      const loc = r.headers.get('location') || '';
      if (/queue-it\.net/.test(loc)) throw new Queued('대기열(Queue-it) — 우회하지 않는다');
      if (r.status >= 300 && r.status < 400 && loc) return await get(new URL(loc, url).href, referer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r;
    } catch (e) {
      if (e instanceof Queued || i === 2) throw e;
      await sleep(1200 * (i + 1));            /* 남의 서버다 — 물러섰다가 다시 */
    }
  }
}

const home = await (await get(BASE + '/sohomall/')).text();
const cats = [...new Set([...home.matchAll(/\/sohomall\/([a-z0-9-]+)\/(all-[a-z0-9-]+)\//g)]
  .map(m => ({ key: m[1], path: `${m[1]}/${m[2]}` })).map(o => JSON.stringify(o)))].map(s => JSON.parse(s));
console.log(`카테고리 ${cats.length}개`);

const byCode = new Map();
const failed = [];

for (const { key, path } of cats) {
  const page = `${BASE}/sohomall/${path}/`;
  let got = 0;
  try {
    const html = await (await get(page)).text();
    const no = (html.match(/dispClsfNo\s*[:=]\s*'?(\d{6,})/) || [])[1];
    if (!no) throw new Error('dispClsfNo 를 못 찾았다');
    const j = await (await get(
      `${BASE}/sohomall/cxhr/pf/goodsList?dispClsfNo=${no}&sortType=10&page=1&rows=500`, page)).json();
    const ps = j.products || [];
    /* `rows=500` 으로 한 번에 다 와야 한다 — 모자라면 조용히 빠뜨린 것이다 */
    if (typeof j.count === 'number' && ps.length < j.count)
      failed.push({ key, why: `${j.count}종 중 ${ps.length}종만 왔다` });
    for (const p of ps) {
      const code = p.mdlCode;
      if (!code) continue;
      if (!byCode.has(code)) byCode.set(code, {
        code,
        name: p.goodsNm || p.mdlNm || '',
        usp: (p.uspDescList || []).map(s => String(s).trim()).filter(Boolean),
        url: p.goodsDetailUrl || p.pdpUrl || '',
        cats: [], biz: [],
      });
      const e = byCode.get(code);
      (BIZ.has(key) ? e.biz : e.cats).includes(key) || (BIZ.has(key) ? e.biz : e.cats).push(key);
    }
    got = ps.length;
  } catch (e) {
    failed.push({ key, why: String(e.message || e).slice(0, 60) });
  }
  console.log(`  ${path.padEnd(46)} ${String(got).padStart(3)}종`);
  await sleep(250);
}

const items = [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
const out = {
  _note: 'SOHO몰(삼성 B2B) 현행 판매 모델 목록. 시험 문항의 재료이며 앱에 실리지 않는다. '
       + '가격은 담지 않는다(가격 표기는 타사비교에서 출고가로만 한다). '
       + 'usp 는 목록 API 의 uspDescList — 타사비교 on[] 과 같은 셀링포인트다.',
  _source: BASE + '/sohomall/  ·  /sohomall/cxhr/pf/goodsList',
  _robots: 'samsungebiz.com robots 는 검색 결과 지면 3개만 금지하고 /sohomall/ 은 허용 (2026-08-25 확인). '
         + '자동 갱신 경로가 있으므로 npm run fetch:soho 로 다시 받을 것.',
  collectedAt: new Date().toISOString().slice(0, 10),
  categories: cats.map(c => c.key),
  bizCategories: [...BIZ],
  count: items.length,
  failed,
  items,
};
fs.mkdirSync('scripts/fixtures', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));

console.log(`\n합계 ${items.length}종 → ${OUT}`);
console.log(`셀링포인트가 있는 것 ${items.filter(i => i.usp.length).length}종 · 업종 태그가 붙은 것 ${items.filter(i => i.biz.length).length}종`);
if (failed.length) console.log('⚠ 못 받은 카테고리:', failed.map(f => `${f.key}(${f.why})`).join(' · '));
