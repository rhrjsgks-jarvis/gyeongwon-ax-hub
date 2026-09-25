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

async function main() {
  const args = process.argv.slice(2);
  const onVercel = !!process.env.VERCEL;
  const write = args.includes('--force') || (args.includes('--vercel') && onVercel);
  const dirArg = args.find((a) => a.startsWith('--dir='));
  const dir = dirArg ? path.resolve(dirArg.slice(6)) : path.join(ROOT, 'public');
  if (args.includes('--vercel') && !onVercel) console.log('[minify-inline] Vercel 빌드가 아니라 원본을 그대로 둔다(재기만 한다)');
  let before = 0, after = 0, rawB = 0, rawA = 0;
  const allFails = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('-app.html')).sort()) {
    const p = path.join(dir, f);
    const src = fs.readFileSync(p, 'utf8');
    const { html, fails } = await minifyHtml(src, f);
    allFails.push(...fails);
    const [b, a] = [gz(src), gz(html)];
    before += b; after += a; rawB += src.length; rawA += html.length;
    console.log(`${f.padEnd(24)} gzip ${(b / 1024).toFixed(0).padStart(4)}KB → ${(a / 1024).toFixed(0).padStart(4)}KB (−${(100 - a / b * 100).toFixed(0)}%)`);
    if (write) fs.writeFileSync(p, html);
  }
  console.log(`합계 gzip ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB (−${(100 - after / before * 100).toFixed(0)}%) · 원본 ${(rawB / 1024).toFixed(0)}KB → ${(rawA / 1024).toFixed(0)}KB`
    + (write ? ' · 썼다' : ' · 재기만 했다'));
  if (allFails.length) console.log('압축 못 한 블록(원본 그대로 둠):\n  ' + allFails.join('\n  '));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
