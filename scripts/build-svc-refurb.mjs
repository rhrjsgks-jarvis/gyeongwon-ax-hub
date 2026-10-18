/*
 * 삼성전자서비스 리퍼부품 가격 → public/svc-refurb.json
 *   node scripts/build-svc-refurb.mjs <수집본 refurb-all.json>
 *
 * 원본은 「요금안내 → 리퍼부품 가격검색」(https://www.samsungsvc.co.kr/info/fee?tab=price)이
 * 부르는 API(svcRecycleList)다. 브라우저 세션(jwt)이 있어야 응답하므로 수집은 로컬 브라우저에서
 * 하고(.scratch/svcfee/refurb2.mjs), 여기서는 화면이 쓰는 칸만 골라 담는다.
 *
 * 칸 뜻은 원문 표 머리와 대조했다 — 「부품가(원, 부가세 포함) · 신품 | 리퍼부품」.
 * customPrice1 = 신품, customPrice2 = 리퍼부품. etc(비고)의 「반납가」는 고장 부품을 반납할 때 값이다.
 * **값을 고치지 않는다** — 쉼표·공백만 걷어 숫자로 바꾼다. 숫자가 아니면 null(가격 없음)로 둔다.
 */
import fs from 'node:fs';

const src = process.argv[2];
if (!src) { console.error('사용법: node scripts/build-svc-refurb.mjs <refurb-all.json>'); process.exit(1); }
const raw = JSON.parse(fs.readFileSync(src, 'utf8'));

const KINDS = ['휴대폰', '컴퓨터', 'TV/모니터'];
const num = (v) => {
  const t = String(v == null ? '' : v).replace(/[\s,]/g, '');
  return /^\d+$/.test(t) ? Number(t) : null;
};
const rows = [];
for (const k of KINDS) {
  for (const r of raw.items[k] || []) {
    rows.push([
      KINDS.indexOf(k),
      String(r.stanModel || r.servModel || '').trim(),
      String(r.bdId || '').trim(),
      String(r.bdWri || '').trim(),
      String(r.partName || '').trim(),
      num(r.customPrice1) || null,   // 신품가도 0 으로 온 줄이 1건 있다 — 가격 없음
      num(r.customPrice2) || null,   // 원문에 0 으로 온 3건 — 리퍼부품 가격이 없다는 뜻이다(0원이 아니다)
      r.etc ? String(r.etc).trim() : '',
    ]);
  }
}
if (rows.length < 1000) throw new Error('리퍼부품이 ' + rows.length + '건뿐이다 — 수집이 덜 됐다');

const out = {
  _about: '삼성전자서비스 리퍼부품 가격검색 원문(부품가, 원, 부가세 포함). 칸: [제품, 모델명, 구분, 부품번호, 부품명, 신품가, 리퍼부품가, 비고]',
  src: 'https://www.samsungsvc.co.kr/info/fee?tab=price',
  collectedAt: String(raw.collectedAt || '').slice(0, 10),
  kinds: KINDS,
  rows,
};
fs.writeFileSync('public/svc-refurb.json', JSON.stringify(out));
console.log('리퍼부품 ' + rows.length + '건 → public/svc-refurb.json (' + Math.round(fs.statSync('public/svc-refurb.json').size / 1024) + 'KB)');
