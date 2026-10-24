/*
 * 글씨 굵기 체계 — 제목·강조 700 / 나머지 400 (2026-10-24 사장님 승인: 「모든 규칙을 통일합니다」)
 *
 * 한 화면에 굵기가 400·500·600·700·800·900 여섯 가지 섞여 있었다. 600 이상은 700, 그 아래는 400.
 * 크기·색·자리는 건드리지 않는다. 다시 돌려도 결과가 같다(멱등) — 새 화면을 만든 뒤 돌리면 정리된다.
 *   node scripts/unify-weights.mjs          고친다
 *   node scripts/unify-weights.mjs --check  남은 것을 세기만 한다(검사용, 남았으면 exit 1)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const to = (w) => (+w >= 600 ? '700' : '400');

/* 화면에 나가는 파일만 — 허브(app·components·globals.css)와 미니앱(public 의 html·js) */
function files() {
  const out = [];
  const walk = (d, ok) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!/^(vendor|_split|plans|install-img|apt|models|icons)$/.test(e.name)) walk(p, ok); }
      else if (ok(e.name) && e.name !== 'SamsungWordmark.tsx') out.push(p);   // 워드마크 주석은 「font-black 으로 친 글자는 로고가 아니다」는 설명이라 둔다
    }
  };
  walk(path.join(root, 'public'), (n) => /\.(html|js)$/.test(n) && n !== 'sw.js');
  walk(path.join(root, 'app'), (n) => /\.(tsx|ts|css)$/.test(n));
  walk(path.join(root, 'components'), (n) => /\.(tsx|ts)$/.test(n));
  return out;
}

const RULES = [
  /* CSS · 인라인 style · SVG 속성 */
  [/(font-weight\s*:\s*)([1-9]00|650)\b/g, (m, a, w) => a + to(w)],
  [/(font-weight\s*=\s*["'])([1-9]00)(["'])/g, (m, a, w, b) => a + to(w) + b],
  /* font 줄임(font:800 14px …) */
  [/(\bfont\s*:\s*)([1-9]00)(\s)/g, (m, a, w, b) => a + to(w) + b],
  /* React style 객체 fontWeight: 800 / '800' */
  [/(fontWeight\s*:\s*['"]?)([1-9]00)\b/g, (m, a, w) => a + to(w)],
  /* 캔버스 글꼴 문자열 '800 13px …' */
  [/(['"`])([1-9]00)(\s+\d+(?:\.\d+)?px)/g, (m, q, w, b) => q + to(w) + b],
  /* Tailwind 굵기 클래스 */
  [/\bfont-(?:semibold|extrabold|black)\b/g, () => 'font-bold'],
  [/\bfont-(?:thin|extralight|light|medium)\b/g, () => 'font-normal'],
];
const LEFT = /font-weight\s*:\s*(?!400\b|700\b)[1-9]00\b|font-weight\s*:\s*650|fontWeight\s*:\s*['"]?(?!400\b|700\b)[1-9]00\b|\bfont-(?:semibold|extrabold|black|medium|light|thin|extralight)\b|\bfont\s*:\s*(?!400\b|700\b)[1-9]00\s/g;

let changed = 0, left = 0;
for (const f of files()) {
  const src = fs.readFileSync(f, 'utf8');
  if (CHECK) {
    const n = (src.match(LEFT) || []).length;
    if (n) { left += n; console.log(`남음 ${n}  ${path.relative(root, f)}`); }
    continue;
  }
  let s = src, n = 0;
  for (const [re, fn] of RULES) s = s.replace(re, (...a) => { const r = fn(...a); if (r !== a[0]) n++; return r; });
  if (s !== src) { fs.writeFileSync(f, s); changed += n; console.log(`${String(n).padStart(4)}  ${path.relative(root, f)}`); }
}
if (CHECK) { console.log(left ? `굵기 700/400 밖 ${left}곳 — node scripts/unify-weights.mjs 로 정리` : 'OK: 굵기 700/400 두 가지뿐'); process.exit(left ? 1 : 0); }
console.log(`바꾼 곳 ${changed}`);
