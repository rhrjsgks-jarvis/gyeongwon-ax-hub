/*
 * 설치환경 가이드 규격도를 우리 저장소로 옮긴다.
 * 실행: node scripts/fetch-install-images.mjs        (npm run fetch:install-img)
 *       node scripts/fetch-install-images.mjs --dry  (받지 않고 무엇을 할지만 본다)
 *
 * ── 왜 옮기는가 ──
 * ① **공유가 화면을 그대로 찍는데(html2canvas) 다른 도메인 이미지는 그 서버가 CORS 를
 *    허용해야 캔버스에 들어간다.** 안 되면 고객에게 나가는 그림에서 규격도 자리가 빈다 —
 *    설치 상담에서 가장 중요한 그림이 빠지는 셈이다.
 * ② **매장 전파가 약해도 열려야 한다.** 서비스워커가 우리 도메인 것만 캐시할 수 있다
 *    (three.js·html2canvas 를 `public/vendor/` 에 둔 것과 같은 이유).
 * ③ 삼성닷컴이 경로를 바꾸면 규격도가 통째로 사라진다. 실제로 지금도 링크가 깨지면
 *    "이미지를 불러올 수 없습니다" 로 떨어질 뿐이다.
 *
 * ── 반드시 로컬에서 돌릴 것 ──
 * 클라우드 세션은 프록시가 외부 호스트를 막는다(`CONNECT tunnel failed, response 403`).
 * 도면 수집이 로컬 전용인 것과 같은 제약이다.
 *
 * ── 원칙 ──
 * **받지 못한 것은 건드리지 않는다.** 실패한 항목은 삼성닷컴 주소 그대로 두고 보고한다 —
 * 빈 파일을 가리키게 만들면 화면에서 규격도가 조용히 사라진다(설치환경 가이드의
 * "확인된 이미지만 쓴다" 원칙과 같다). 원본 주소는 `orig` 로 남겨 출처를 되짚을 수 있다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
/*
 * 경로·호스트를 env 로 바꿀 수 있게 열어 둔 것은 **이 스크립트 자체를 시험하기 위해서다.**
 * 삼성닷컴은 클라우드 세션에서 막혀 있어, 가짜 이미지 서버를 띄우고 사본에 돌려 보는
 * 것 말고는 "정말 제대로 바꿔치기하는가"를 확인할 방법이 없다(`test-install-fetch.mjs`).
 * 평소에는 넷 다 기본값이다.
 */
const HTML = process.env.INSTALL_HTML || path.join(root, 'public', 'install-app.html');
const DIR = process.env.INSTALL_DIR || path.join(root, 'public', 'install-img');
const HOST = process.env.INSTALL_HOST || 'images.samsung.com';
const DRY = process.argv.includes('--dry');

/* 이미 옮긴 것을 다시 받지 않도록 원격 주소만 고른다 */
const RE = new RegExp(`src:'(https?://${HOST.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^']+)'`, 'g');

let html = fs.readFileSync(HTML, 'utf8');
const urls = [...new Set([...html.matchAll(RE)].map((m) => m[1]))];
if (!urls.length) {
  console.log('OK: 남아 있는 외부 이미지가 없습니다 — 이미 전부 옮겼습니다.');
  process.exit(0);
}
console.log(`· 옮길 이미지 ${urls.length}장`);

/* 파일 이름은 원본 경로의 마지막 조각을 쓴다 — 어느 규격도인지 이름으로 알아볼 수 있다.
   겹치면 앞 경로를 붙여 가른다(현재 코퍼스에서는 84장 전부 고유하다). */
const used = new Set(fs.existsSync(DIR) ? fs.readdirSync(DIR) : []);
function nameFor(u) {
  const seg = new URL(u).pathname.split('/').filter(Boolean);
  let n = seg[seg.length - 1];
  for (let i = 2; used.has(n) && i <= seg.length; i++) n = seg.slice(-i).join('-');
  used.add(n);
  return n;
}

/* 받은 것이 정말 이미지인지 본다 — 오류 페이지가 200 으로 오는 경우가 있다 */
const MAGIC = [
  [[0xff, 0xd8, 0xff], 'jpg'],
  [[0x89, 0x50, 0x4e, 0x47], 'png'],
  [[0x47, 0x49, 0x46], 'gif'],
  [[0x52, 0x49, 0x46, 0x46], 'webp'],
];
function sniff(buf) {
  for (const [sig, kind] of MAGIC) {
    if (sig.every((b, i) => buf[i] === b)) return kind;
  }
  return null;
}

if (!DRY) fs.mkdirSync(DIR, { recursive: true });

const done = [];
const failed = [];
let corsSeen = null;

for (const u of urls) {
  const name = nameFor(u);
  const out = path.join(DIR, name);
  if (fs.existsSync(out) && fs.statSync(out).size > 1024) {
    done.push([u, name]);
    console.log(`  = ${name} (이미 있음)`);
    continue;
  }
  if (DRY) { console.log(`  · ${name} ← ${u}`); continue; }
  try {
    const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0' } });
    if (corsSeen === null) corsSeen = r.headers.get('access-control-allow-origin') || '(없음)';
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const kind = sniff(buf);
    if (!kind) throw new Error(`이미지가 아님 (${buf.length}B, ${r.headers.get('content-type')})`);
    if (buf.length < 1024) throw new Error(`너무 작다 (${buf.length}B)`);
    fs.writeFileSync(out, buf);
    done.push([u, name]);
    console.log(`  + ${name} ${(buf.length / 1024).toFixed(0)}KB ${kind}`);
  } catch (e) {
    failed.push([u, e.message]);
    console.log(`  ! 실패 ${name} — ${e.message}`);
  }
}

if (DRY) { console.log('\n(--dry 라 받지 않았습니다)'); process.exit(0); }

/* 받은 것만 상대경로로 바꾼다. 원본 주소는 orig 로 남긴다 — 출처를 되짚을 수 있어야 한다. */
let n = 0;
for (const [u, name] of done) {
  const from = `src:'${u}'`;
  if (!html.includes(from)) continue;
  html = html.split(from).join(`src:'install-img/${name}', orig:'${u}'`);
  n++;
}
fs.writeFileSync(HTML, html);

console.log(`\n받음 ${done.length}장 · 실패 ${failed.length}장 · install-app.html 에서 ${n}곳 교체`);
if (corsSeen !== null) {
  console.log(`참고 — ${HOST} 의 access-control-allow-origin: ${corsSeen}`);
  console.log(corsSeen === '(없음)'
    ? '  → CORS 를 안 주므로 옮기기 전에는 공유 이미지에서 규격도가 비어 있었다.'
    : '  → CORS 를 주고 있었다. 그래도 옮기면 오프라인·경로변경에 강해진다.');
}
if (failed.length) {
  console.log('\n받지 못한 것은 삼성닷컴 주소 그대로 두었습니다 — 원본을 확인하세요:');
  for (const [u, why] of failed) console.log(`  ${why}  ${u}`);
}
console.log('\n다음: npm run build:index && npm test');
