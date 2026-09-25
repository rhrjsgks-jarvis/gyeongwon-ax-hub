#!/usr/bin/env node
/**
 * three.js 트리셰이킹 빌드가 앱과 어긋나지 않았는가 — `npm run test:three`
 *
 * 트리셰이킹은 "쓰는 것만 담는다"라서, 앱이 새 클래스를 쓰기 시작했는데 빌드를 다시 안 돌리면
 * **3D 를 여는 순간** `THREE.X is not a constructor` 로 죽는다. 화면을 열기 전에는 아무도 모른다.
 *
 *   ① 앱이 쓰는 THREE.이름 이 전부 코어에서 나가는가
 *   ② 로더가 './three.js' 에서 가져가는 이름이 전부 코어에서 나가는가(한 몸 유지)
 *   ③ 앱이 옛 파일(three.module.min.js · vendor/GLTFLoader.js)을 부르지 않는가
 *   ④ 커밋된 빌드 == 지금 다시 만든 빌드 (search-index · size-reps 와 같은 방식)
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { usedSymbols } from './build-three.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'public', 'vendor', 'three');
let ok = true;
const fail = (m) => { ok = false; console.log('ERROR: ' + m); };
const pass = (m) => console.log('OK: ' + m);

/* 코어가 내보내는 이름 — esbuild 는 끝에 `export{a as X,b as Y}` 한 덩어리를 쓴다 */
function exportsOf(src) {
  const m = src.match(/export\s*\{([^}]*)\}\s*;?\s*$/);
  if (!m) return new Set();
  return new Set(m[1].split(',').map((p) => p.trim().split(/\s+as\s+/).pop()).filter(Boolean));
}
function importsFromCore(src) {
  const out = new Set();
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']\.\/three\.js["']/g)) {
    for (const p of m[1].split(',')) { const n = p.trim().split(/\s+as\s+/)[0]; if (n) out.add(n); }
  }
  return out;
}

const core = fs.readFileSync(path.join(DIR, 'three.js'), 'utf8');
const loader = fs.readFileSync(path.join(DIR, 'GLTFLoader.js'), 'utf8');
const ex = exportsOf(core);
if (ex.size < 30) fail(`코어가 내보내는 이름이 ${ex.size}개뿐이다 — 내보내기 구문을 못 읽었거나 빌드가 비었다`);

const used = usedSymbols();
const miss = used.filter((n) => !ex.has(n));
if (miss.length) fail(`앱이 쓰는데 코어에 없다: ${miss.join(', ')} — npm run build:three 를 다시 돌릴 것`);
else pass(`① 앱이 쓰는 THREE 이름 ${used.length}개가 전부 코어에 있다`);

const li = importsFromCore(loader);
if (!li.size) fail('로더가 ./three.js 에서 가져가는 것이 없다 — three.js 사본을 따로 품고 있을 수 있다(한 몸이 깨진다)');
else {
  const lm = [...li].filter((n) => !ex.has(n));
  if (lm.length) fail(`로더가 가져가는데 코어가 안 내보낸다: ${lm.join(', ')}`);
  else pass(`② 로더가 가져가는 ${li.size}개가 전부 코어에 있다 — 같은 three.js 한 벌을 나눠 쓴다`);
}

const app = fs.readFileSync(path.join(ROOT, 'public', 'place-app.html'), 'utf8');
if (/three\.module\.min\.js|vendor\/GLTFLoader\.js/.test(app)) fail('앱이 아직 옛 three.js 파일을 부른다');
else if (!app.includes("import('./vendor/three/three.js')")) fail('앱이 트리셰이킹 코어를 부르지 않는다');
else pass('③ 앱이 vendor/three/ 의 새 빌드를 부른다');

/* ④ 신선도 — 다시 만들어 바이트로 견준다(esbuild 출력은 결정적이다) */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-'));
const backup = path.join(tmp, 'bak');
fs.cpSync(DIR, backup, { recursive: true });
try {
  execFileSync('node', [path.join(ROOT, 'scripts', 'build-three.mjs')], { cwd: ROOT, stdio: 'pipe' });
  const stale = ['three.js', 'GLTFLoader.js'].filter((f) =>
    !fs.readFileSync(path.join(DIR, f)).equals(fs.readFileSync(path.join(backup, f))));
  if (stale.length) fail(`커밋된 빌드가 낡았다(${stale.join(', ')}) — npm run build:three 후 커밋할 것`);
  else pass('④ 커밋된 빌드 == 지금 다시 만든 빌드');
} finally {
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.cpSync(backup, DIR, { recursive: true });
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
