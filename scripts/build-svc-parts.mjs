/*
 * 삼성전자서비스 휴대폰·태블릿 부품 가격 → public/svc-parts.json
 *   node scripts/build-svc-parts.mjs <수집본 selfparts-all.json>
 *
 * 원본은 소모품샵 「고객 자가수리」(https://www.samsungsvc.co.kr/shop/product?category=175707397)가
 * 부르는 API(smItemApi/list)다. 서비스센터 유상수리에 쓰는 것과 같은 정품 부품이고, 원문이
 * *"수리용 자재/공구는 전국 서비스센터에서도 동일하게 구매 가능"* 이라고 적는다.
 * 브라우저 세션이 있어야 응답해 수집은 로컬 브라우저에서 한다(.scratch/svcfee/selfparts2.mjs).
 *
 * 칸 뜻은 상품 상세 지면과 대조했다(S20+ 디스플레이 GH81-23705A):
 *   price       = 「판매가격」 301,000 원
 *   returnPrice = 「반납/확인 후 최종가격」 235,000 원 (사용불량 부품을 반납하면 이 값)
 * **값을 고치지 않는다.** 반납가가 없는 부품은 null(반납 환급 없음)이다.
 */
import fs from 'node:fs';

const src = process.argv[2];
if (!src) { console.error('사용법: node scripts/build-svc-parts.mjs <selfparts-all.json>'); process.exit(1); }
const raw = JSON.parse(fs.readFileSync(src, 'utf8'));

const KINDS = ['스마트폰(S, A)', '스마트폰(폴더블)', '태블릿'];
const num = (v) => (typeof v === 'number' && v > 0 ? v : null);
// 부품명에서 부품번호 꼬리(「 / GH81-…」)와 「,SELF KIT」 를 걷는다 — 부품번호는 따로 싣는다
// 「,SELF KIT」 뒤에 적용 모델이 한 번 더 붙은 이름도 있다(「…PBA_,SELF KIT, SM-F976N」)
const clean = (s) => String(s || '').replace(/\s*\/\s*GH[0-9A-Z-]+\s*$/, '').replace(/,?\s*SELF(\s+KIT)?.*$/i, '').replace(/_+$/, '').trim();
const rows = [];
for (const k of KINDS) {
  for (const r of raw.items[k] || []) {
    rows.push([
      KINDS.indexOf(k),
      String(r.series || '').trim(),
      String(r.svcModel || '').trim(),
      String(r.part || '').trim(),
      clean(r.name),
      num(r.price),
      num(r.returnPrice),
      r.status === '정상' ? 0 : 1,   // 1 = 일시품절
    ]);
  }
}
if (rows.length < 800) throw new Error('부품이 ' + rows.length + '건뿐이다 — 수집이 덜 됐다');
if (rows.some((r) => r[5] == null)) throw new Error('판매가가 없는 줄이 있다');

const out = {
  _about: '삼성전자서비스 소모품샵 「고객 자가수리」 정품 부품 가격(원). 칸: [구분, 시리즈, 적용모델, 부품번호, 부품명, 판매가, 반납 후 최종가, 일시품절]',
  src: 'https://www.samsungsvc.co.kr/shop/product?category=175707397',
  collectedAt: String(raw.collectedAt || '').slice(0, 10),
  kinds: KINDS,
  rows,
};
fs.writeFileSync('public/svc-parts.json', JSON.stringify(out));
console.log('부품 ' + rows.length + '건 → public/svc-parts.json (' + Math.round(fs.statSync('public/svc-parts.json').size / 1024) + 'KB)');
