#!/usr/bin/env node
/**
 * three.js 트리셰이킹 빌드 — `npm run build:three`
 *
 * 예전에는 three.module.min.js(687KB)를 통째로 `import()` 했다. 네임스페이스로 통째로
 * 부르면 번들러가 쓰지 않는 것을 가려낼 수 없어 **렌더러·로더·애니메이션·후처리 전부**가
 * 매장 폰으로 내려갔다. 배치 시뮬레이터가 실제로 쓰는 것은 30개 남짓이다.
 *
 * 지키는 것
 *   · **쓰는 목록을 손으로 적지 않는다.** place-app.html 에서 `THREE.이름` 을 읽어 만든다.
 *     손으로 적으면 새 클래스를 쓰는 순간 빌드에 빠져 3D 가 **그 자리에서** 죽는다.
 *   · **GLTFLoader 와 한 몸이어야 한다.** 따로 묶으면 로더가 three.js 사본을 하나 더 들고 와
 *     `instanceof Mesh` 같은 판정이 서로 다른 클래스를 보게 된다. 그래서 코어가 로더가 쓰는
 *     이름까지 내보내고, 로더는 'three' 를 ./three.js 로 가리킨다.
 *   · 예전 GLTFLoader.js 는 `../utils/BufferGeometryUtils.js` 를 불렀는데 그 파일이 없었다
 *     (자산 등록부가 비어 있어 한 번도 안 불렸을 뿐이다). 번들러가 빌드 때 해결한다.
 *   · three 버전은 package.json 에 **고정**(0.169.0)한다 — 벤더 파일과 같은 판이다.
 *
 * 결과: public/vendor/three/{three.js, GLTFLoader.js}
 * place-app.html 을 고쳐 새 THREE 클래스를 쓰면 이 빌드를 다시 돌릴 것(test-three 가 잡는다).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'public', 'place-app.html');
const OUT = path.join(ROOT, 'public', 'vendor', 'three');

export function usedSymbols(src = fs.readFileSync(APP, 'utf8')) {
  return [...new Set([...src.matchAll(/\bTHREE\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))].sort();
}

/** GLTFLoader(와 그것이 부르는 유틸)가 'three' 에서 가져가는 이름 — 코어가 함께 내보내야 한 몸이 된다 */
export function loaderSymbols() {
  const dir = path.join(ROOT, 'node_modules', 'three', 'examples', 'jsm');
  const out = new Set();
  for (const f of ['loaders/GLTFLoader.js', 'utils/BufferGeometryUtils.js']) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'three'/g)) {
      for (const n of m[1].split(',')) { const t = n.trim().split(/\s+as\s+/)[0]; if (t) out.add(t); }
    }
  }
  return [...out].sort();
}

async function main() {
  const used = usedSymbols(), extra = loaderSymbols();
  const names = [...new Set([...used, ...extra])].sort();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'three-'));
  const entry = path.join(tmp, 'three.js');
  fs.writeFileSync(entry, `export { ${names.join(', ')} } from 'three';\n`);
  const loader = path.join(tmp, 'GLTFLoader.js');
  fs.writeFileSync(loader, `export { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';\n`);
  fs.rmSync(OUT, { recursive: true, force: true });
  const common = { bundle: true, format: 'esm', minify: true, legalComments: 'inline', logLevel: 'warning',
    nodePaths: [path.join(ROOT, 'node_modules')], absWorkingDir: ROOT, metafile: true };
  /*
   * **한 파일로 묶는다(분할하지 않는다).** 2026-09-25 실측(4G·CPU 4배, 5회 중앙값) —
   * 전체 517ms · 트리셰이킹 한 파일 441ms · **분할 두 파일 662ms**. 분할하면 첫 파일을 받아야
   * 다음 조각이 필요한 줄 알게 되어 왕복이 한 번 더 붙고, 그 150ms 가 줄인 바이트보다 크다.
   */
  const r1 = await esbuild.build({ ...common, entryPoints: [entry], outfile: path.join(OUT, 'three.js') });
  /* 로더는 'three' 를 바깥(./three.js)으로 둔다 — 같은 파일을 가리켜 브라우저가 한 번만 받고 한 몸으로 쓴다 */
  const r2 = await esbuild.build({ ...common, entryPoints: [loader], outfile: path.join(OUT, 'GLTFLoader.js'),
    plugins: [{ name: 'three-external', setup(b) {
      b.onResolve({ filter: /^three$/ }, () => ({ path: './three.js', external: true }));
    } }] });
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const r of [r1, r2]) for (const [f, o] of Object.entries(r.metafile.outputs)) {
    console.log(`${path.basename(f).padEnd(16)} ${(o.bytes / 1024).toFixed(1).padStart(7)}KB`);
  }
  console.log(`앱이 쓰는 이름 ${used.length}개 + 로더가 쓰는 이름 ${extra.length}개 → 코어가 내보내는 이름 ${names.length}개`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
