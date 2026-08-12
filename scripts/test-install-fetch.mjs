/*
 * `fetch-install-images.mjs` 가 정말 제대로 바꿔치기하는지 검사한다.
 * 실행: node scripts/test-install-fetch.mjs      (npm run test:installfetch)
 *
 * **왜 따로 검사하는가** — 이 스크립트는 상담사에게 보이는 규격도 84장을 한 번에 건드리고,
 * 잘못 돌면 `install-app.html` 이 없는 파일을 가리켜 **설치 상담에서 정작 필요한 그림이
 * 조용히 사라진다.** 그런데 삼성닷컴은 클라우드 세션에서 막혀 있어 실제로 돌려 볼 수 없다.
 * 그래서 **가짜 이미지 서버**를 띄우고 사본에 돌려 전 과정을 그대로 확인한다.
 *
 * 특히 지키는 것:
 *  - 받은 것만 상대경로가 되고 **원본 주소(orig)가 남는다**
 *  - **실패한 것은 손대지 않는다** — 원격 주소 그대로여야 한다(빈 파일을 가리키면 안 된다)
 *  - 두 번 돌려도 같다(이미 옮긴 것을 다시 받거나 두 번 치환하지 않는다)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
let ok = true;
const fail = (m) => { console.log('ERROR:', m); ok = false; };
const pass = (m) => console.log('OK:', m);

/* 1×1 JPEG — 매직바이트 검사를 통과하되 1KB 를 넘겨야 하므로 뒤를 채운다 */
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
  Buffer.alloc(2048, 0x20),
  Buffer.from([0xff, 0xd9]),
]);

const server = http.createServer((req, res) => {
  if (req.url.includes('missing')) { res.writeHead(404); res.end('no'); return; }
  if (req.url.includes('notimage')) {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html>error page</html>');
    return;
  }
  res.writeHead(200, { 'content-type': 'image/jpeg' });
  res.end(JPEG);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const HOST = `127.0.0.1:${server.address().port}`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'instimg-'));
const htmlPath = path.join(tmp, 'install-app.html');
const imgDir = path.join(tmp, 'install-img');

const U = (n) => `http://${HOST}/kdp/static/pcd/${n}`;
const before = [
  `{src:'${U('good-a.jpg')}', alt:'가', cap:'가 · samsung.com'},`,
  `{src:'${U('good-b.png')}', alt:'나', cap:'나 · samsung.com'},`,
  `{src:'${U('missing-c.jpg')}', alt:'다', cap:'다 · samsung.com'},`,
  `{src:'${U('notimage-d.jpg')}', alt:'라', cap:'라 · samsung.com'},`,
  `{src:'https://images.other.com/keep.jpg', alt:'마', cap:'남의 도메인'},`,
].join('\n');
fs.writeFileSync(htmlPath, before);

const env = { ...process.env, INSTALL_HTML: htmlPath, INSTALL_DIR: imgDir, INSTALL_HOST: HOST };
/*
 * **반드시 비동기로 부를 것.** 가짜 이미지 서버가 이 프로세스에서 돌기 때문에
 * execFileSync 로 부르면 이벤트 루프가 막혀 서버가 응답하지 못하고 **영원히 멈춘다**
 * (실제로 그렇게 한 번 멈췄다).
 */
const exec = promisify(execFile);
const run = async () => (await exec('node', [path.join(here, 'fetch-install-images.mjs')], { env })).stdout;

const out1 = await run();
let html = fs.readFileSync(htmlPath, 'utf8');

// ① 받은 것은 상대경로 + orig
for (const n of ['good-a.jpg', 'good-b.png']) {
  if (!html.includes(`src:'install-img/${n}', orig:'${U(n)}'`)) fail(`${n} 이 상대경로+orig 로 안 바뀌었다`);
  const p = path.join(imgDir, n);
  if (!fs.existsSync(p) || fs.statSync(p).size < 1024) fail(`${n} 파일이 없거나 비어 있다`);
}
if (ok) pass('받은 것은 상대경로로 바뀌고 원본 주소(orig)가 남는다');

// ② 실패한 것은 손대지 않는다 — 이게 제일 중요하다
for (const n of ['missing-c.jpg', 'notimage-d.jpg']) {
  if (!html.includes(`src:'${U(n)}'`)) fail(`${n} 은 받지 못했는데 주소가 바뀌었다 (없는 파일을 가리킨다)`);
  if (fs.existsSync(path.join(imgDir, n))) fail(`${n} 은 실패했는데 파일이 남았다`);
}
if (ok) pass('받지 못한 것은 원격 주소 그대로 둔다 (404·이미지 아님 둘 다)');

// ③ 대상 호스트만 건드린다
if (!html.includes(`src:'https://images.other.com/keep.jpg'`)) fail('대상이 아닌 도메인까지 건드렸다');
else pass('대상 호스트가 아닌 이미지는 그대로 둔다');

// ④ 두 번 돌려도 같다
const snapshot = html;
const out2 = await run();
if (fs.readFileSync(htmlPath, 'utf8') !== snapshot) fail('두 번째 실행이 파일을 또 바꿨다');
else pass('두 번 돌려도 결과가 같다 (이미 옮긴 것은 건너뛴다)');

// ⑤ 실패를 조용히 넘기지 않는다
if (!/실패\s*2장|실패 2/.test(out1) && !out1.includes('받지 못한')) fail('실패를 보고하지 않는다');
else pass('실패한 항목을 원본 주소와 함께 보고한다');
/* 두 번째 실행은 **아직 못 받은 2장만** 다시 시도하고 그 사실을 다시 알려야 한다 —
   조용해지면 "다 옮겼다"로 읽혀 남은 것이 묻힌다 */
if (!out2.includes('옮길 이미지 2장')) fail(`두 번째 실행이 남은 2장을 다시 집지 않는다:\n${out2}`);
else if (!out2.includes('받지 못한')) fail('두 번째 실행이 남은 실패를 다시 알리지 않는다');
else pass('두 번째 실행은 남은 2장만 다시 시도하고 결과를 다시 알린다');

server.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
