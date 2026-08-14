/*
 * 견적 한 장이 쓰는 **품목별 무상보증 요약**을 만든다 → `public/warranty.json`
 * 실행: node scripts/build-warranty.mjs   (npm run build:warranty)
 *
 * ── 왜 생성물인가 ──
 * 원본은 `public/as-app.html` 의 `DB` 하나뿐이고, 그 값은 삼성전자서비스 원문 표에서만
 * 온다(AS 기간은 틀리면 그대로 고객 분쟁이다). 견적은 `finder-app.html` 에서 그리는데
 * 두 미니앱은 서로의 데이터를 못 읽으므로, **손으로 옮겨 적는 대신 뽑아 쓴다.**
 * 손으로 옮기면 한쪽만 고쳤을 때 조용히 어긋난다 — 이 저장소가 여러 번 겪은 사고다
 * (`test-consistency.mjs` 가 존재하는 이유).
 *
 * `test-as.mjs` 가 원본을 지키고, `test-warranty` 구간이 "커밋된 생성물 == 지금 다시
 * 만든 것"을 검사한다. as-app 을 고치면 이 스크립트를 다시 돌려 커밋해야 한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'public', 'as-app.html'), 'utf8');

/* 정규식으로 필드를 긁으면 원문이 조금만 바뀌어도 조용히 빈 값이 된다 — 평가해서 읽는다 */
function literal(re, label) {
  const m = html.match(re);
  if (!m) throw new Error(`${label} 를 찾지 못했습니다 — as-app.html 형식이 바뀌었는지 확인할 것`);
  return (0, eval)(`(${m[1]})`);
}
const DB = literal(/\nconst DB = (\{[\s\S]*?\});\n/, 'as-app.html 의 DB');

const out = {};
for (const [cat, d] of Object.entries(DB)) {
  const rec = { base: d.base };
  /*
   * 핵심부품은 **기간이 base 보다 긴 것만** 싣는다. 견적 한 장은 고객이 보는 종이라
   * 줄이 길어지면 정작 중요한 것이 안 읽힌다 — "컴프레서 10년"처럼 말이 되는 것만 남긴다.
   * 조건이 붙은 항목(제조 시기·형식)은 조건까지 함께 옮긴다. 조건을 떼면 틀린 약속이 된다.
   */
  const core = (d.core || [])
    .map(([part, term, cond]) => ({ part, term, cond: cond || '' }))
    .filter((c) => c.term && c.term !== d.base);
  if (core.length) rec.core = core;
  out[cat] = rec;
}

const dest = path.join(root, 'public', 'warranty.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 1) + '\n');
console.log(`warranty.json 생성: ${Object.keys(out).length}품목 · 핵심부품이 있는 품목 ${Object.values(out).filter((x) => x.core).length}개`);
