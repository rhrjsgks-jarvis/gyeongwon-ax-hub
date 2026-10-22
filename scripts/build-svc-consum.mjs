/*
 * 삼성전자서비스 가전 소모품 가격 → public/svc-consum.json
 *   node scripts/build-svc-consum.mjs <수집본 consum-all.json>   (수집: scripts/collect-svc-consum.mjs)
 *
 * 수리비 탭 「가전 소모품가」 칸이 읽는다(2026-10-22 사장님 승인 — 유상 수리 대상 「소모성」의 실제 값).
 * 판매가(price)만 싣는다 — 소모품샵 가전 소모품에는 반납가가 없다. **값을 고치지 않는다.**
 * 적용 모델은 해외 지역 꼬리(「/EN」·「/XD」)를 떼고 겹치는 것을 지운다 — 국내 모델코드로 찾게.
 */
import fs from 'node:fs';

const src = process.argv[2];
if (!src) { console.error('사용법: node scripts/build-svc-consum.mjs <consum-all.json>'); process.exit(1); }
const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
const KINDS = ['에어컨·공기청정기', '세탁기·건조기·에어드레서', '청소기', '냉장고', '주방가전', 'TV·모니터', '프린터·복합기'];
/* 줄 순서를 고정한다 — API 가 매번 다른 순서로 주어, 그대로면 값이 같아도 주간 점검이 「바뀜」으로 잡는다 */
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
const num = (v) => (typeof v === 'number' && v > 0 ? v : null);
/* 「공기청정기 헤파 필터 / DB94-07195F」 — 부품번호 꼬리는 따로 싣는다 */
const clean = (s) => String(s || '').replace(/\s*\/\s*[0-9A-Z][0-9A-Z-]{5,}\s*$/, '').replace(/ {2,}/g, ' ').trim();
const models = (s) => [...new Set(String(s || '').split(',').map((m) => m.trim().replace(/\/[A-Z0-9]{2,3}$/, '')).filter(Boolean))].join(',');
const rows = [];
for (const k of KINDS) {
  for (const r of raw.items[k] || []) {
    const sub = (r.dirs || []).slice(1).filter((d) => !/^[0-9]+$/.test(d)).join(' · ');   // 「병꽂이 · 10773」 — 번호만 있는 분류는 이름이 아니다
    rows.push([KINDS.indexOf(k), sub, clean(r.name), String(r.part || '').trim(), num(r.price), r.status === '정상' ? 0 : 1, models(r.svcModel)]);
  }
}
rows.sort((a, b) => a[0] - b[0] || cmp(a[1], b[1]) || cmp(a[3], b[3]) || cmp(a[2], b[2]));
for (const k of KINDS) if (!rows.some((r) => r[0] === KINDS.indexOf(k))) throw new Error(k + ' 갈래가 비었다 — 수집이 덜 됐다');
if (rows.length < 300) throw new Error('소모품이 ' + rows.length + '건뿐이다 — 수집이 덜 됐다');
const noPrice = rows.filter((r) => r[4] == null).length;
const out = {
  _about: '삼성전자서비스 소모품샵 가전 소모품 정품 가격(원). 칸: [구분, 하위분류, 품명, 부품번호, 판매가, 일시품절, 적용모델]',
  src: 'https://www.samsungsvc.co.kr/shop/product?category=10422',
  // 한국 날짜로 — UTC 로 자르면 오전 9시 전 수집이 전날로 적힌다(백업 폴더 이름에서 데인 그 함정)
  collectedAt: raw.collectedAt ? new Date(new Date(raw.collectedAt).getTime() + 9 * 3600e3).toISOString().slice(0, 10) : '',
  kinds: KINDS,
  rows,
};
fs.writeFileSync('public/svc-consum.json', JSON.stringify(out));
console.log('소모품 ' + rows.length + '건(가격 없음 ' + noPrice + ') → public/svc-consum.json (' + Math.round(fs.statSync('public/svc-consum.json').size / 1024) + 'KB)');
