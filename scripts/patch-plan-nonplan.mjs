#!/usr/bin/env node
/**
 * 평면도가 아닌 이미지에 색인 표시(np:1)를 붙인다 — `node scripts/patch-plan-nonplan.mjs`
 *
 * 목록은 scripts/fixtures/plans-nonplan.json(사람이 눈으로 확인한 것). 배포 이미지의 md5 로
 * 대조하므로 색인을 다시 만들어 파일 이름이 밀려도 같은 그림에 붙는다. build-plan-index 도
 * 같은 목록을 읽으므로 이 스크립트는 **색인을 다시 만들지 않고 따라잡을 때** 쓴다.
 */
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IDX = path.join(ROOT, 'public', 'plan-index.json');
const NP = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'fixtures', 'plans-nonplan.json'), 'utf8')).items.map((x) => x.md5));
const idx = JSON.parse(fs.readFileSync(IDX, 'utf8'));
let on = 0, off = 0; const found = new Set();
for (const c of idx.complexes) for (const p of c.plans) {
  const f = path.join(ROOT, 'public', p.file);
  const hit = fs.existsSync(f) && NP.has(crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex'));
  if (hit) { p.np = 1; on++; found.add(crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex')); } else if (p.np) { delete p.np; off++; }
}
fs.writeFileSync(IDX, JSON.stringify(idx, null, 1) + String.fromCharCode(10));
console.log(`평면도 아님 표시 ${on}장 (풀린 것 ${off}장) — 목록 ${NP.size}건`);
/* 같은 그림이 여러 주택형에 들어 있어 장수 ≥ 목록 수다. 목록이 하나라도 안 붙으면 이미지가 바뀐 것 */
if (found.size !== NP.size) { console.error(`목록 ${NP.size}건 중 ${found.size}건만 붙었다 — 이미지가 바뀌었는지 확인할 것`); process.exit(1); }
