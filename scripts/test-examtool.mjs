/*
 * **자립형 시험지 출력기 회귀 검사** — `npm run test:examtool`
 *
 * 이 도구는 앱과 달리 **매장에 파일 그 자체가 나간다**(메일·USB). 한 번 나간 파일은
 * 회수가 안 되므로, 배포 URL 을 확인하는 다른 앱보다 검사가 더 무겁게 걸려 있다.
 *
 * 세 겹이다:
 *  ① **신선도** — 커밋된 `tools/시험지출력기.html` == 지금 재생성한 것.
 *     문항을 늘리고 빌드를 안 돌리면 매장 파일이 옛 문항으로 굳는데,
 *     그 사실이 화면에 아무 표시도 안 난다(search-index·size-reps 와 같은 규칙).
 *  ② **자립성** — 바깥을 부르는 곳이 0. 메일로 받은 사람의 PC 에는 우리 서버가 없다.
 *  ③ **실물** — 파일 **한 장만** 임시 폴더에 복사해 `file://` 로 열어 본다.
 *     형제 파일이 하나도 없는 상태가 곧 "메일로 받아 더블클릭한 상태"다.
 *     그 사이 http(s) 요청이 하나라도 나가면 실패시킨다.
 *
 * ③ 은 playwright 가 없으면 SKIP 하지만 ①② 는 브라우저 없이 늘 돈다 —
 * 조용히 썩는 것은 ① 이고, 그건 검사에 브라우저가 필요 없다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildExamTool, assertSelfContained, OUT } from './build-exam-tool.mjs';

let ok = true;
const say = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ': ' + m); if (!c) ok = false; };

/* ── ① 신선도 ── */
if (!fs.existsSync(OUT)) {
  say(false, 'tools/시험지출력기.html 이 없다 — `npm run build:examtool` 을 돌리고 커밋할 것');
  process.exit(1);
}
const committed = fs.readFileSync(OUT, 'utf8');
const { html: fresh, bank } = buildExamTool();
say(committed === fresh,
  `커밋된 출력기 == 재생성한 것 (문항 ${bank.total}개)` +
  (committed === fresh ? '' : ' — `npm run build:examtool` 을 돌리고 커밋할 것'));

/* ── ② 자립성 ── */
let selfOk = true, why = '';
try { assertSelfContained(committed); } catch (e) { selfOk = false; why = e.message; }
say(selfOk, '바깥을 부르는 곳 0' + (selfOk ? '' : ' — ' + why));
say(committed.includes('"items"') && committed.includes('"policy"'),
  '문제은행이 파일 안에 들어 있다 (' + (Buffer.byteLength(committed) / 1024).toFixed(0) + 'KB)');

/* ── ③ 실물 ── */
let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  console.log('SKIP: playwright 미설치 — 실물 검사를 건너뛴다.');
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 1);
}

/* 형제 파일이 하나도 없는 폴더 = 메일로 받아 내려받은 상태 */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'examtool-'));
const lone = path.join(dir, '시험지출력기.html');
fs.copyFileSync(OUT, lone);

const br = await chromium.launch();
const page = await br.newPage({ viewport: { width: 1200, height: 900 } });
const errs = [];
const outside = [];
page.on('pageerror', e => errs.push(e.message));
page.on('request', r => { if (!r.url().startsWith('file:')) outside.push(r.url()); });
await page.route('http://**', r => r.abort());
await page.route('https://**', r => r.abort());

await page.goto(pathToFileURL(lone).href, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelectorAll('.sheet').length > 0, { timeout: 15000 });

const grab = () => page.evaluate(() => {
  const sheets = [...document.querySelectorAll('.sheet')];
  const qs = [...sheets[0].querySelectorAll('.q')].map(el => ({
    q: el.querySelector('.qt').textContent.trim(),
    opts: [...el.querySelectorAll('.opts li span:last-child')].map(x => x.textContent.trim()),
  }));
  const keys = [...sheets[1].querySelectorAll('.akey div span')].map(x => x.textContent.trim());
  const exps = [...sheets[1].querySelectorAll('.ex .a')].map(x => x.textContent.trim());
  return {
    sheets: sheets.length, codes: sheets.map(s => s.querySelector('.code').textContent.trim()),
    tags: document.querySelectorAll('.tag').length,
    qs, keys, exps, hint: document.getElementById('hint').textContent, title: document.title,
  };
});
const a = await grab();
const NO = ['①', '②', '③', '④'];

say(a.sheets === 2, '시험지+정답지 두 장 (실제 ' + a.sheets + ')');
say(a.qs.length === 20, '20문항 (실제 ' + a.qs.length + ')');
say(a.qs.every(q => q.opts.length === 4), '모든 문항 보기 4개');
/* 품목 이름은 답을 좁혀 주는 힌트다 — 되살아나면 여기서 걸린다 */
say(a.tags === 0, '문항 옆에 품목 이름이 없다 (실제 ' + a.tags + '개)');
say(new Set(a.qs.map(q => q.q)).size === a.qs.length, '문항 중복 없음');
say(a.codes[0] === a.codes[1], '시험지·정답지 코드 일치 (' + a.codes.join(' / ') + ')');
say(a.keys.length === 20, '정답표 20칸 (실제 ' + a.keys.length + ')');

let match = 0;
for (let i = 0; i < 20; i++) if (a.exps[i] && a.exps[i].startsWith('정답 ' + a.keys[i])) match++;
say(match === 20, '정답표 ↔ 해설 정답 일치 ' + match + '/20');

let inSheet = 0;
for (let i = 0; i < 20; i++) {
  const want = a.exps[i].replace(/^정답 [①②③④]\s*/, '');
  if (a.qs[i].opts[NO.indexOf(a.keys[i])] === want) inSheet++;
}
say(inSheet === 20, '정답 위치가 시험지 보기와 일치 ' + inSheet + '/20');

/* 저장되는 PDF 파일 이름이 시험지 코드를 단다 — 여러 장 뽑아도 파일이 안 섞인다 */
const code0 = a.codes[0].replace('시험지 ', '');
say(a.title === '시험지_' + code0, '문서 제목이 시험지 코드를 단다 (' + a.title + ')');

/* 매번 달라야 한다 */
const seen = new Set([a.qs.map(q => q.q).join('|')]);
for (let i = 0; i < 4; i++) {
  await page.click('#gen');
  await page.waitForTimeout(150);
  seen.add((await grab()).qs.map(q => q.q).join('|'));
}
say(seen.size === 5, '5번 뽑아 5번 다 다른 시험지 (실제 ' + seen.size + '종)');

/* 같은 코드면 같은 시험지여야 한다(재인쇄·채점 대조) */
const cur = await grab();
const code = cur.codes[0].replace('시험지 ', '');
await page.fill('#code', code);
await page.press('#code', 'Enter');
await page.waitForTimeout(150);
const again = await grab();
say(again.qs.map(q => q.q).join('|') === cur.qs.map(q => q.q).join('|'),
  '같은 코드(' + code + ') → 같은 시험지 재현');

/* A4 로 인쇄되는가 */
const pdf = path.join(dir, 'sample.pdf');
await page.pdf({ path: pdf, format: 'A4', printBackground: true });
say(fs.existsSync(pdf), 'A4 PDF 생성 (' + (fs.statSync(pdf).size / 1024).toFixed(0) + 'KB)');

say(outside.length === 0, '바깥으로 나간 요청 0' + (outside.length ? ': ' + outside[0] : ''));
say(errs.length === 0, '콘솔 오류 없음' + (errs.length ? ': ' + errs[0] : ''));
console.log('\n안내문: ' + a.hint);
console.log(ok ? '\nALL PASS' : '\nSOME FAILED');

await br.close();
fs.rmSync(dir, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
