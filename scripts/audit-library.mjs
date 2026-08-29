/*
 * 공용 벽선(public/plan-library.json)의 **방 이름이 제자리에 붙어 있는가**.
 *
 * 매장이 그대로 불러 쓰는 자료라 이름이 틀리면 **냉장고가 거실에 놓인다** — 상담에서
 * 바로 티가 나고, 화면은 아무 말도 하지 않는다(2026-08-30 실물에서 발견).
 *
 * **막지 않고 보고만 한다.** 넓이 범위는 상식이지 규격이 아니고, 트인 거실 안의 주방을
 * 따로 잡는 것처럼 **일부러 그렇게 둔 것**도 걸린다(CLAUDE.md). 사람이 도면을 열어
 * 확인할 후보를 좁혀 주는 것이 이 도구의 일이다.
 *
 *   npm run audit:library
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const L = JSON.parse(fs.readFileSync(path.join(root, 'public', 'plan-library.json'), 'utf8'));
const arr = Array.isArray(L) ? L : (L.entries || L.list || []);
const idx = JSON.parse(fs.readFileSync(path.join(root, 'public', 'plan-index.json'), 'utf8'));
const cxs = Array.isArray(idx) ? idx : (idx.complexes || idx.list || []);

/* 다각형 넓이 — 벽 목록에서 고리를 만든다 */
const areaOf = (walls) => {
  if (!walls || walls.length < 3) return 0;
  let a = 0;
  for (const w of walls) a += w.x1 * w.y2 - w.x2 * w.y1;
  return Math.abs(a) / 2;
};
const roomArea = (r) => (r.parts || []).reduce((s, q) => s + areaOf(q.walls), 0);

/* 상식 범위 (㎡) — 넘으면 이름이 자리와 안 맞는 것으로 본다 */
const SANE = {
  거실: [12, 45], 주방: [4, 30], 침실1: [6, 25], 안방: [7, 25], 침실2: [5, 20], 침실3: [5, 20],
  욕실1: [2, 9], 욕실2: [2, 9], 욕실: [2, 9], 현관: [1.5, 12], 드레스룸: [2, 15],
  세탁실: [1, 10], 발코니: [1, 20], 팬트리: [0.5, 8], 서재: [4, 20], 알파룸: [3, 20],
};

console.log('공용 벽선', arr.length, '건 검사\n');
let bad = 0;
for (const e of arr) {
  const rooms = (e.rooms || []).map((r) => ({ name: r.name, m2: roomArea(r) / 1e6 }));
  if (!rooms.length) { console.log('· ' + e.complex + ' ' + e.type + ' — 방 없음'); continue; }
  rooms.sort((a, b) => b.m2 - a.m2);
  const total = rooms.reduce((s, r) => s + r.m2, 0);
  /* 색인에서 전용면적을 찾는다 */
  let excl = null;
  for (const c of cxs) if (c.complex === e.complex) for (const pl of (c.plans || [])) if (pl.type === e.type && pl.exclusiveM2) excl = pl.exclusiveM2;

  const issues = [];
  const top = rooms[0];
  if (!/거실|알파|주방/.test(top.name)) issues.push(`가장 넓은 방이 ${top.name}(${top.m2.toFixed(1)}㎡)`);
  rooms.forEach((r) => {
    const k = Object.keys(SANE).find((s) => r.name.replace(/\s/g, '').startsWith(s));
    if (!k) return;
    const [lo, hi] = SANE[k];
    if (r.m2 < lo || r.m2 > hi) issues.push(`${r.name} ${r.m2.toFixed(1)}㎡ (보통 ${lo}~${hi})`);
  });
  if (excl && (total > excl * 1.6 || total < excl * 0.35)) issues.push(`합계 ${total.toFixed(0)}㎡ vs 전용 ${excl}㎡`);

  const mark = issues.length ? '✘' : '✔';
  if (issues.length) bad++;
  console.log(`${mark} ${e.complex} ${e.type} — 방 ${rooms.length}곳 · 합계 ${total.toFixed(1)}㎡${excl ? ' (전용 ' + excl + ')' : ''}`);
  console.log('    ' + rooms.map((r) => `${r.name} ${r.m2.toFixed(1)}`).join(' · '));
  issues.forEach((i) => console.log('    → ' + i));
}
console.log('\n의심 ' + bad + ' / ' + arr.length + '건');

process.exit(0);   /* 보고만 한다 — 막는 것은 merge:library 의 관문이 한다 */
