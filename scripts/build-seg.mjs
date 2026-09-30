#!/usr/bin/env node
/**
 * 벽 분할 모델을 앱에 싣는다 — `node scripts/build-seg.mjs <plan3d 의 plan-seg.onnx> [--arch 이름]`
 *
 * 배치 시뮬레이터는 도면의 벽을 규칙(형태학 연산)으로 찾아 왔다. plan3d 에서 AI Hub 정답으로
 * 학습한 모델이 같은 일을 훨씬 잘 한다(벽 재현율 45% → 90%대). 이 스크립트가 둘을 옮긴다:
 *
 *   ① ONNX Runtime Web(wasm 전용 빌드) → public/vendor/ort-<판>/
 *      CDN 을 쓰지 않는다 — 매장 전파가 약해도 열려야 한다(three.js 를 vendor 에 둔 것과 같은 이유).
 *      판 번호를 폴더 이름에 넣어 서비스워커가 캐시 우선으로 잡아도 굳지 않게 한다.
 *   ② 모델 → public/models/wall-seg.<내용해시>.onnx
 *      이름에 해시가 있어 바뀌면 이름이 바뀐다(/models/ 는 캐시 우선).
 *   ③ public/models/manifest.json 의 `wallSeg` 에 파일 이름을 적는다 — 등록부는 SWR 이라
 *      새 모델을 올리면 그날 반영된다. 옛 wall-seg.*.onnx 는 지운다.
 *
 * 등록부에서 `wallSeg` 를 지우면 앱은 예전 규칙 인식으로 돌아간다(끄는 스위치).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORT_DIST = path.join(ROOT, 'node_modules', 'onnxruntime-web', 'dist');
const ORT_FILES = ['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'];

export function ortVersion() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'onnxruntime-web', 'package.json'), 'utf8')).version;
}
export const ortDir = () => `vendor/ort-${ortVersion()}`;

function main() {
  const args = process.argv.slice(2);
  const src = args.find((a) => !a.startsWith('--'));
  const arch = (args[args.indexOf('--arch') + 1] && args.includes('--arch')) ? args[args.indexOf('--arch') + 1] : null;
  if (!src || !fs.existsSync(src)) { console.error('모델 경로를 주세요: node scripts/build-seg.mjs <plan-seg.onnx> [--arch 이름]'); process.exit(1); }

  // ① 런타임
  const od = path.join(ROOT, 'public', ortDir());
  fs.rmSync(od, { recursive: true, force: true });
  fs.mkdirSync(od, { recursive: true });
  for (const f of ORT_FILES) fs.copyFileSync(path.join(ORT_DIST, f), path.join(od, f));
  for (const d of fs.readdirSync(path.join(ROOT, 'public', 'vendor'))) {       // 옛 판 정리
    if (d.startsWith('ort-') && `vendor/${d}` !== ortDir()) fs.rmSync(path.join(ROOT, 'public', 'vendor', d), { recursive: true, force: true });
  }

  // ② 모델
  const buf = fs.readFileSync(src);
  const name = `wall-seg.${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10)}.onnx`;
  const md = path.join(ROOT, 'public', 'models');
  for (const f of fs.readdirSync(md)) if (/^wall-seg\..*\.onnx$/.test(f) && f !== name) fs.rmSync(path.join(md, f));
  fs.writeFileSync(path.join(md, name), buf);

  // ③ 등록부
  const mp = path.join(md, 'manifest.json');
  const man = JSON.parse(fs.readFileSync(mp, 'utf8'));
  man.wallSeg = { file: name, ort: ortDir(), arch: arch || undefined, bytes: buf.length,
    note: '벽·문·창 분할 모델(plan3d). 지우면 배치 시뮬레이터가 규칙 인식으로 돌아간다.' };
  fs.writeFileSync(mp, JSON.stringify(man, null, 2) + '\n');
  console.log(`런타임 ${ortDir()} (${ORT_FILES.length}개) · 모델 models/${name} ${(buf.length / 1e6).toFixed(1)}MB · 등록부 갱신`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
