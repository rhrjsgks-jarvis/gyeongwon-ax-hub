#!/usr/bin/env node
/**
 * 미니앱(public/*-app.html) 인라인 JS·CSS 압축 — **배포 빌드 때만** 돈다.
 *
 * 왜: 미니앱 인라인 JS 가 앱 전체 전송량의 가장 큰 덩어리다(gzip 626KB, 2026-09-25 실측).
 * `import` 가 없는 <script> 라 트리셰이킹은 못 하지만, 주석·공백·지역 이름을 걷어 내는
 * 압축은 된다 — 이 저장소는 코드 안에 설명을 촘촘히 남기는 문화라 걷어 낼 것이 많다.
 *
 * **원본은 절대 바꾸지 않는다.** 검사 스크립트 여럿이 원본 소스의 글자를 직접 읽고,
 * 주석이 이 저장소의 기록이다. 그래서:
 *   · 기본은 재기만 한다(아무것도 안 쓴다)
 *   · `--vercel` 은 Vercel 빌드 컨테이너(VERCEL=1)에서만 쓴다 — 로컬에서 `npm run build` 해도 안 쓴다
 *   · `--force` 는 검증용으로 사본에만 쓸 것
 *
 * 지키는 것
 *   · **HTML 을 제대로 훑는다.** 정규식으로 <script> 를 찾으면 HTML 주석 속
 *     `<script type="module">` 글자를 스크립트로 오인한다(실제로 그랬다). 주석은 건너뛰고,
 *     <script>·<style> 속은 날것으로 다룬다.
 *   · **전역 이름을 바꾸지 않는다.** 일반 스크립트의 최상위 function/var 는 onclick="…" 과
 *     다른 스크립트가 부르는 전역이다. esbuild 는 format 을 안 주면 최상위를 그대로 둔다(확인함).
 *   · 문자열 속 `</script>` 는 esbuild 가 `<\/script>` 로 탈출시킨다(확인함).
 *   · **실패한 블록은 원본 그대로 둔다** — 하나 때문에 앱이 통째로 깨지면 안 된다.
 *   · JS·CSS 가 아닌 script(type=application/json 등)는 건드리지 않는다.
 *   · HTML 주석은 지운다 — 화면과 무관한 설명문이다.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS_TYPES = /^(|text\/javascript|application\/javascript|module)$/i;

/** HTML 한 장을 압축한다 → { html, fails[] } */
export async function minifyHtml(src, label = '') {
  let out = '', i = 0;
  const fails = [];
  const lower = src.toLowerCase();
  while (i < src.length) {
    if (src.startsWith('<!--', i)) {                         // HTML 주석 — 지운다
      const e = src.indexOf('-->', i + 4);
      i = e < 0 ? src.length : e + 3;
      continue;
    }
    const tag = lower.startsWith('<script', i) ? 'script' : lower.startsWith('<style', i) ? 'style' : null;
    if (tag && /[\s>]/.test(src[i + tag.length + 1] || '')) {
      const openEnd = src.indexOf('>', i);
      const close = lower.indexOf(`</${tag}`, openEnd);
      if (openEnd < 0 || close < 0) { out += src.slice(i); break; }
      const open = src.slice(i, openEnd + 1);
      const body = src.slice(openEnd + 1, close);
      const closeEnd = src.indexOf('>', close) + 1;
      out += open + await minifyBlock(tag, open, body, fails, label) + src.slice(close, closeEnd);
      i = closeEnd;
      continue;
    }
    out += src[i++];
  }
  return { html: out, fails };
}

async function minifyBlock(tag, open, body, fails, label) {
  if (!body.trim()) return body;
  try {
    if (tag === 'style') {
      return (await esbuild.transform(body, { loader: 'css', minify: true, charset: 'utf8', logLevel: 'silent' })).code.trim();
    }
    if (/\bsrc\s*=/.test(open)) return body;
    const type = (open.match(/\btype\s*=\s*["']?([^"'\s>]*)/i) || [, ''])[1];
    if (!JS_TYPES.test(type)) return body;
    const isMod = /^module$/i.test(type);
    return (await esbuild.transform(body, {
      minify: true, charset: 'utf8', logLevel: 'silent',
      ...(isMod ? { format: 'esm' } : {}),               // 일반 스크립트는 format 을 주지 않는다 → 최상위(전역) 이름 유지
    })).code.trim();
  } catch (e) {
    fails.push(`${label} <${tag}> ${e.errors?.[0]?.text || e.message}`);
    return body;                                          // 실패하면 원본 그대로
  }
}

const gz = (s) => zlib.gzipSync(Buffer.from(s), { level: 9 }).length;

/*
 * ── 큰 자료 블록 떼어내기(2026-09-26) ─────────────────────────────────
 *
 * 압축한 인라인 스크립트 중 **SPLIT_MIN 이상인 일반(classic) 블록**을 `/_split/<앱>.<해시>.js`
 * 로 떼어낸다. 실측(.scratch/split-lab, 폰 CPU 4배):
 *   · 제품 상세검색 재방문 −15%(838 → 712ms) — 1MB HTML 을 다시 파싱하지 않고, 브라우저가
 *     외부 스크립트의 컴파일 결과(V8 코드 캐시)를 재사용한다. 인라인은 코드 캐시를 못 받는다.
 *   · 그런데 **모든 블록을 떼면** 배치 시뮬레이터가 약한 전파 첫 방문에서 +17% 느려졌다(요청 1개 추가).
 *   → 압축 뒤 크기가 **580KB(제품 자료) · 370KB(문제은행) 대 142KB 이하**로 뚜렷이 갈려
 *     200KB 로 자르면 자료가 무거운 두 앱만 떼어진다.
 *
 * 세 가지가 **한꺼번에** 맞아야 이득이 난다(하나라도 빠지면 오히려 느려지거나 깨진다):
 *   ① 해시 파일명 — 내용이 바뀌면 이름이 바뀐다 → 영원히 캐시해도 굳지 않는다
 *   ② 캐시 헤더 — next.config.js 가 /_split/ 에 `immutable` 을 준다. 기본값(max-age=0)이면
 *      파일마다 304 확인 왕복이 붙어 재방문이 +17% 느려졌다(실측)
 *   ③ 서비스워커 — /_split/ 을 캐시 우선으로 잡고, 미니앱 HTML 을 캐시에 넣을 때 **그 HTML 이
 *      가리키는 /_split/ 파일도 함께** 넣는다. 안 그러면 오프라인에서 HTML 은 뜨는데 자료가 없다
 *
 * 순서·실행 의미는 그대로다 — 떼어낸 자리에 같은 순서의 `<script src>`(defer·async 없음)를 둔다.
 * 일반 스크립트만 뗀다(모듈은 import 해석이 달라 그대로 둔다).
 */
export const SPLIT_MIN = 200 * 1024;
export const SPLIT_DIR = '_split';

/** 압축된 HTML 에서 큰 일반 스크립트를 떼어낸다 → { html, files:[{name, code}] } */
export function splitBlocks(html, app) {
  const base = app.replace(/\.html$/, '');
  const lower = html.toLowerCase();
  const files = [];
  let out = '', i = 0;
  while (true) {
    const s = lower.indexOf('<script', i);
    if (s < 0) { out += html.slice(i); break; }
    const oe = html.indexOf('>', s);
    const ce = lower.indexOf('</script', oe);
    const cend = html.indexOf('>', ce) + 1;
    const open = html.slice(s, oe + 1), body = html.slice(oe + 1, ce);
    const type = (open.match(/\btype\s*=\s*["']?([^"'\s>]*)/i) || [, ''])[1];
    const classic = !/\bsrc\s*=/.test(open) && /^(|text\/javascript|application\/javascript)$/i.test(type);
    out += html.slice(i, s);
    if (classic && Buffer.byteLength(body) >= SPLIT_MIN) {
      const hash = crypto.createHash('sha256').update(body).digest('hex').slice(0, 10);
      const name = `${base}.${hash}.js`;
      files.push({ name, code: body });
      out += `<script src="/${SPLIT_DIR}/${name}"></script>`;
    } else {
      out += html.slice(s, cend);
    }
    i = cend;
  }
  return { html: out, files };
}

async function main() {
  const args = process.argv.slice(2);
  const onVercel = !!process.env.VERCEL;
  const write = args.includes('--force') || (args.includes('--vercel') && onVercel);
  const dirArg = args.find((a) => a.startsWith('--dir='));
  const dir = dirArg ? path.resolve(dirArg.slice(6)) : path.join(ROOT, 'public');
  if (args.includes('--vercel') && !onVercel) console.log('[minify-inline] Vercel 빌드가 아니라 원본을 그대로 둔다(재기만 한다)');
  let before = 0, after = 0, rawB = 0, rawA = 0;
  const allFails = [];
  const splitOut = path.join(dir, SPLIT_DIR);
  if (write) fs.rmSync(splitOut, { recursive: true, force: true });
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('-app.html')).sort()) {
    const p = path.join(dir, f);
    const src = fs.readFileSync(p, 'utf8');
    const { html: mini, fails } = await minifyHtml(src, f);
    allFails.push(...fails);
    const { html, files } = splitBlocks(mini, f);
    const moved = files.reduce((n, x) => n + gz(x.code), 0);
    const [b, a] = [gz(src), gz(html) + moved];
    before += b; after += a; rawB += src.length; rawA += html.length;
    console.log(`${f.padEnd(24)} gzip ${(b / 1024).toFixed(0).padStart(4)}KB → ${(a / 1024).toFixed(0).padStart(4)}KB (−${(100 - a / b * 100).toFixed(0)}%)`
      + (files.length ? `  · 떼어냄 ${files.map((x) => x.name).join(', ')}` : ''));
    if (write) {
      fs.writeFileSync(p, html);
      if (files.length) fs.mkdirSync(splitOut, { recursive: true });
      for (const x of files) fs.writeFileSync(path.join(splitOut, x.name), x.code);
    }
  }
  console.log(`합계 gzip ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB (−${(100 - after / before * 100).toFixed(0)}%) · 원본 ${(rawB / 1024).toFixed(0)}KB → ${(rawA / 1024).toFixed(0)}KB`
    + (write ? ' · 썼다' : ' · 재기만 했다'));
  if (allFails.length) console.log('압축 못 한 블록(원본 그대로 둠):\n  ' + allFails.join('\n  '));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
