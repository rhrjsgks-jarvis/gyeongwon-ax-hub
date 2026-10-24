/*
 * 화면 규칙 통일 — 글자 크기 6단 · 모서리 4단 · 글자색 회색 4단 + 삼성 블루
 * (2026-10-25 사장님 「모두반영」 · 전후 사진 artifact 2GUvv3TRdrVoCyCcznwiaS · 굵기는 unify-weights.mjs)
 *
 *   글자 크기  12 · 13.5 · 15 · 17 · 22 · 27px — 가장 가까운 단으로(30px 넘는 큰 표시 글자는 둔다)
 *   모서리     6(배지) · 10(버튼·입력) · 14(카드) · 알약(40px 넘는 값은 그대로)
 *   글자색     회색은 제목 #0B1220 · 본문 #374151 · 설명 #5B6476 · 흐린 글 #9CA3AF 중 가까운 것,
 *              짙은 파랑은 삼성 블루 #1428A0. 초록·빨강·주황(뜻이 있는 색)·옅은 글자(어두운 바탕 위)는 그대로
 *
 * 멱등이다 — 새 화면을 만든 뒤 한 번 돌리면 정리된다.
 *   node scripts/unify-tokens.mjs          고친다
 *   node scripts/unify-tokens.mjs --check  규칙 밖의 값을 센다(npm test 안 · 남았으면 exit 1)
 *
 * 빼는 것: poster-app.html(A4 인쇄 포스터 — 화면이 아니다) · 캔버스 글꼴 문자열(배치 시뮬레이터 그림은
 * 크기가 도면 배율로 정해진다) · SVG 의 font-size 속성 · sw.js · SamsungWordmark.tsx · tools/
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

export const SIZES = [12, 13.5, 15, 17, 22, 27];
export function snapSize(v) {
  if (!(v > 0) || v > 30) return v;
  return SIZES.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
}
export function snapRadius(v) {
  if (!(v > 0) || v > 40) return v;
  return v <= 7 ? 6 : v <= 12 ? 10 : 14;
}
const GRAYS = [[11, 18, 32, '#0B1220'], [55, 65, 81, '#374151'], [91, 100, 118, '#5B6476'], [156, 163, 175, '#9CA3AF']];
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
function hexRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
export function snapColor(hex) {
  const c = hexRgb(hex); if (!c) return hex;
  const [r, g, b] = c, L = lum(r, g, b), mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (L > 200) return hex;                                        // 옅은 글자 — 어두운 바탕 위 흰 글 등
  if (mx - mn < 40) {
    const best = GRAYS.reduce((a, o) => (Math.abs(lum(...o) - L) < Math.abs(lum(...a) - L) ? o : a));
    return keepCase(hex, best[3]);
  }
  if (b > r + 40 && b > g && L < 120) return keepCase(hex, '#1428A0');
  return hex;                                                     // 뜻이 있는 색은 둔다
}
function keepCase(orig, next) { return orig === orig.toLowerCase() ? next.toLowerCase() : next; }
const num = (s) => +(+s).toFixed(2);
const fmt = (v) => String(+v.toFixed(2));

/* Tailwind 기본 눈금 → px */
const TW_TEXT = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30 };
const TW_ROUND = { sm: 2, '': 4, md: 6, lg: 8, xl: 12, '2xl': 16, '3xl': 24 };
const TW_GRAY = {
  gray: { 300: '#d1d5db', 400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151', 800: '#1f2937', 900: '#111827' },
  slate: { 300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a' },
};
function twText(px) { const s = snapSize(px); for (const [k, v] of Object.entries(TW_TEXT)) if (v === s) return 'text-' + k; return `text-[${fmt(s)}px]`; }
function twRound(px) { const r = snapRadius(px); for (const [k, v] of Object.entries(TW_ROUND)) if (v === r) return k ? 'rounded-' + k : 'rounded'; return `rounded-[${fmt(r)}px]`; }

const RULES = [
  /* 글자 크기 — CSS · font 줄임 · React · Tailwind */
  [/(font-size\s*:\s*)(\d+(?:\.\d+)?)px/g, (m, a, v) => a + fmt(snapSize(num(v))) + 'px'],
  [/(\bfont\s*:\s*(?:[1-9]00\s+)?)(\d+(?:\.\d+)?)px/g, (m, a, v) => a + fmt(snapSize(num(v))) + 'px'],
  [/(fontSize\s*:\s*)(\d+(?:\.\d+)?)(?=\s*[,}\n])/g, (m, a, v) => a + fmt(snapSize(num(v)))],
  [/(fontSize\s*:\s*['"])(\d+(?:\.\d+)?)px/g, (m, a, v) => a + fmt(snapSize(num(v))) + 'px'],
  [/(^|[\s"'`:])text-\[(\d+(?:\.\d+)?)px\]/g, (m, a, v) => a + twText(num(v))],
  [/(^|[\s"'`:])text-(sm|base|lg|xl|2xl|3xl)(?=[\s"'`])/g, (m, a, k) => a + twText(TW_TEXT[k])],
  /* 모서리 */
  [/(border-radius\s*:\s*)([^;}"'\n]+)/g, (m, a, v) => a + v.replace(/(\d+(?:\.\d+)?)px/g, (q, n) => fmt(snapRadius(num(n))) + 'px')],
  [/(borderRadius\s*:\s*)(\d+(?:\.\d+)?)(?=\s*[,}\n])/g, (m, a, v) => a + fmt(snapRadius(num(v)))],
  [/(^|[\s"'`:])rounded(?:-(sm|md|lg|xl|2xl|3xl))?(?=[\s"'`])/g, (m, a, k) => a + twRound(TW_ROUND[k || ''])],
  [/(^|[\s"'`:])rounded-\[(\d+(?:\.\d+)?)px\]/g, (m, a, v) => a + twRound(num(v))],
  /* 글자색 — color 속성 · 글자색 변수 · React color · Tailwind 글자색 */
  [/((?:^|[\s;{"'`])color\s*:\s*)(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\b/g, (m, a, h) => a + snapColor(h)],
  [/(--(?:ink|sub|text|txt|muted|mute|fg|dim|title|body)[\w-]*\s*:\s*)(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\b/g, (m, a, h) => a + snapColor(h)],
  [/(\bcolor\s*:\s*['"])(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})(?=['"])/g, (m, a, h) => a + snapColor(h)],
  [/(^|[\s"'`:])text-\[(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\]/g, (m, a, h) => a + `text-[${snapColor(h)}]`],
  [/(^|[\s"'`:])text-(gray|slate)-(300|400|500|600|700|800|900)(?=[\s"'`])/g, (m, a, f, n) => a + `text-[${snapColor(TW_GRAY[f][n])}]`],
];

function files() {
  const out = [];
  const walk = (d, ok) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!/^(vendor|_split|plans|install-img|apt|models|icons)$/.test(e.name)) walk(p, ok); }
      else if (ok(e.name) && !/^(SamsungWordmark\.tsx|sw\.js|poster-app\.html)$/.test(e.name)) out.push(p);
    }
  };
  walk(path.join(root, 'public'), (n) => /\.(html|js)$/.test(n));
  walk(path.join(root, 'app'), (n) => /\.(tsx|ts|css)$/.test(n));
  walk(path.join(root, 'components'), (n) => /\.(tsx|ts)$/.test(n));
  return out;
}

function transform(src) {
  let s = src, n = 0;
  for (const [re, fn] of RULES) s = s.replace(re, (...a) => { const r = fn(...a); if (r !== a[0]) n++; return r; });
  return [s, n];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let total = 0;
  for (const f of files()) {
    const src = fs.readFileSync(f, 'utf8');
    const [s, n] = transform(src);
    if (!n) continue;
    total += n;
    if (CHECK) console.log(`규칙 밖 ${n}  ${path.relative(root, f)}`);
    else { fs.writeFileSync(f, s); console.log(`${String(n).padStart(4)}  ${path.relative(root, f)}`); }
  }
  if (CHECK) { console.log(total ? `글자 크기·모서리·글자색 규칙 밖 ${total}곳 — node scripts/unify-tokens.mjs 로 정리` : 'OK: 글자 크기 6단 · 모서리 4단 · 글자색 규칙 안'); process.exit(total ? 1 : 0); }
  console.log(`바꾼 곳 ${total}`);
}
