/*
 * 주간 자동 점검 — 매주 원문을 다시 받아 세일즈 코파일럿 자료를 최신으로 맞춘다(2026-10-22 사장님:
 * *"일주일에 한번 스캔하여 업데이트하는 방식"*).
 *   node scripts/weekly-scan.mjs            실제로 돈다(수집 → 빌드 → 검사 → 커밋·push → 텔레그램 보고)
 *   node scripts/weekly-scan.mjs --dry      수집·빌드·검사까지만. 커밋·push·보고 없음
 *   node scripts/weekly-scan.mjs --only svc-consum,svc-fee-trip
 *
 * Windows 작업 스케줄러가 매주 월요일 07:00 에 부른다(scripts/register-weekly-scan.ps1).
 * **로컬 전용** — 삼성전자서비스 API 는 브라우저 세션이 있어야 받히고 클라우드는 프록시가 막는다.
 *
 * 지키는 것 —
 *  · **갈래마다 따로 돈다.** 하나가 실패해도 나머지는 간다. 실패한 갈래는 자기 파일을 원래대로 되돌리고
 *    「확인 실패」로 보고한다 — 0건이나 반쪽 자료로 화면을 덮지 않는다.
 *  · **검사(npm test)가 통과해야만** 커밋한다. 실패하면 전부 되돌리고 보고만 한다.
 *  · **고친 파일만** 골라 커밋한다(git add 경로 지정). 작업 트리에 사람이 고치던 것이 있으면 커밋을 미룬다.
 *  · 바뀐 것이 없어도 점검 대장(freshness.json)에 「이날 대조함」을 적는다 — 대조했기 때문이다.
 *  · 금액이 앱 문구 안에 박힌 것(출장비)은 고치지 않고 「바뀜 — 손으로 반영」으로 알린다.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');   // URL 경로를 그대로 쓰면 한글이 %EB… 로 깨진다
process.chdir(ROOT);
const DRY = process.argv.includes('--dry');
const oi = process.argv.indexOf('--only');
const ONLY = oi > 0 ? String(process.argv[oi + 1] || '').split(',') : null;
const WORK = '.scratch/weekly';
fs.mkdirSync(WORK, { recursive: true });

const run = (cmd, args, opt = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32', timeout: opt.timeout || 20 * 60e3, env: { ...process.env, ...(opt.env || {}) } });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), err: r.error };
};
const git = (...a) => run('git', a);
const tail = (s, n = 3) => String(s || '').trim().split('\n').filter(Boolean).slice(-n).join(' / ').slice(0, 300);

/* 갈래 — steps 는 차례로 돈다. files 는 이 갈래가 바꿀 수 있는 파일(커밋 대상·실패 시 되돌릴 대상).
   fresh 는 성공했을 때 「대조함」을 적을 점검 대장 열쇠. check:true 는 고치지 않고 바뀜만 알리는 갈래. */
const STAGES = [
  { key: 'svc-parts', name: '휴대폰·태블릿·PC 부품가', fresh: [],
    steps: [['node', ['scripts/collect-svc-parts.mjs', `${WORK}/selfparts-all.json`]], ['node', ['scripts/build-svc-parts.mjs', `${WORK}/selfparts-all.json`]]],
    files: ['public/svc-parts.json'] },
  { key: 'svc-consum', name: '가전 소모품가', fresh: [],
    steps: [['node', ['scripts/collect-svc-consum.mjs', `${WORK}/consum-all.json`]], ['node', ['scripts/build-svc-consum.mjs', `${WORK}/consum-all.json`]]],
    files: ['public/svc-consum.json'] },
  { key: 'svc-fee-trip', name: '출장비', fresh: [], check: true,
    steps: [['node', ['scripts/check-svc-fee.mjs']]], files: [] },
  { key: 'svc-centers', name: '서비스센터', fresh: ['svc-centers'],
    steps: [['node', ['scripts/svc-collect.mjs']], ['node', ['-e', "require('fs').copyFileSync('.scratch/refresh/svc-centers.new.json','scripts/fixtures/svc-centers.json')"]], ['npm', ['run', 'build:svc']], ['npm', ['run', 'test:svc']]],
    env: { SKIP_VERIFY: '1' }, files: ['scripts/fixtures/svc-centers.json', 'public/svc-centers.json'] },
  { key: 'usp', name: '제조사 셀링포인트', fresh: ['usp'],
    steps: [['npm', ['run', 'fetch:usp']], ['npm', ['run', 'build:usp']]],
    files: ['scripts/fixtures/sec-usp.json', 'public/sec-usp.json', 'public/compare-usp.json'] },
  { key: 'care', name: '구독케어 회차·유형', fresh: ['care'],
    steps: [['npm', ['run', 'collect:care']], ['npm', ['run', 'build:careplans']], ['npm', ['run', 'test:care']]],
    files: ['scripts/fixtures/care-subs.json', 'public/care-app.html'] },
];
/* 자동으로 못 도는 것 — 원문이 PDF·사내 배포본이거나 robots 가 막는다. 점검 대장 기한으로 따로 알린다 */
const MANUAL = ['제품 라인업 · 카탈로그(PDF)', 'LG 카탈로그', '로지텍 설치비(robots 금지 — 지정 지면만)', '블루패스 · 모바일/PC 구독', '보증기간 · 멤버십', '설치환경 규격', '물류센터(사내 배포본)'];

const started = new Date();
const report = { changed: [], same: [], failed: [], alerts: [] };

/* 사람이 고치던 것이 있으면 커밋은 미룬다(수집·검사는 한다) */
const dirty = git('status', '--porcelain', '--untracked-files=no').out.trim();
git('fetch', 'origin');
const behind = Number(git('rev-list', '--count', 'HEAD..origin/main').out.trim() || 0);
if (!dirty && behind && !DRY) git('pull', '--ff-only');
const canCommit = !dirty && !DRY;

const hashOf = (f) => (fs.existsSync(f) ? fs.readFileSync(f).toString('base64').length + ':' + git('hash-object', f).out.trim() : 'none');
for (const st of STAGES) {
  if (ONLY && !ONLY.includes(st.key)) continue;
  const before = Object.fromEntries(st.files.map((f) => [f, hashOf(f)]));
  let fail = null, out = '';
  for (const [cmd, args] of st.steps) {
    const r = run(cmd, args, { env: st.env });
    out = r.out;
    if (st.check && r.code === 3) { report.alerts.push(`${st.name}: ${tail(r.out, 1)} — 손으로 반영`); break; }
    if (r.code !== 0) { fail = `${tail(r.out)}${r.err ? ' ' + r.err.message : ''}`; break; }
  }
  if (fail) {
    for (const f of st.files) git('checkout', '--', f);   // 반쪽 자료로 덮지 않는다
    report.failed.push(`${st.name}: ${fail}`);
    continue;
  }
  const moved = st.files.filter((f) => hashOf(f) !== before[f]);
  if (moved.length) report.changed.push({ name: st.name, files: moved, note: tail(out, 1), fresh: st.fresh });
  else if (!st.check || !report.alerts.some((a) => a.startsWith(st.name))) report.same.push(st.name);
  if (st.fresh.length) st.okFresh = true;
}

/* 바뀐 것이 있으면 통합검색 색인까지 다시 만들고 전체 검사 */
let testOk = true, testOut = '';
const changedFiles = report.changed.flatMap((c) => c.files);
if (changedFiles.length) {
  const ix = run('npm', ['run', 'build:index']);
  if (ix.code !== 0) { testOk = false; testOut = 'build:index ' + tail(ix.out); }
  else {
    changedFiles.push('public/search-index.json', 'public/search-detail.json', 'public/search-suggest.json');
    const t = run('npm', ['test'], { timeout: 40 * 60e3 });
    testOk = t.code === 0; testOut = tail(t.out, 6);
  }
  if (!testOk) {
    for (const f of new Set(changedFiles)) git('checkout', '--', f);
    report.failed.push('검사 실패로 이번 주 변경을 전부 되돌렸습니다: ' + testOut);
    report.changed = [];
  }
}

/* 점검 대장 — 성공한 갈래는 「오늘 대조함」 */
const doneKeys = STAGES.filter((s) => s.okFresh && !report.failed.some((f) => f.startsWith(s.name))).flatMap((s) => s.fresh);
const svcOk = ['휴대폰·태블릿·PC 부품가', '가전 소모품가', '출장비'].every((n) => !report.failed.some((f) => f.startsWith(n)) && (!ONLY || ONLY.length));
if (svcOk && !ONLY) doneKeys.push('svc-fee');
if (doneKeys.length && !DRY) run('node', ['scripts/check-freshness.mjs', '--done', doneKeys.join(',')]);

/* 커밋 · push — 고친 파일만 */
let pushed = '';
if (canCommit) {
  const files = [...new Set([...(report.changed.length ? changedFiles : []), 'scripts/fixtures/freshness.json'])].filter((f) => git('status', '--porcelain', '--', f).out.trim());
  if (files.length) {
    const htmlChanged = files.some((f) => f.endsWith('-app.html'));
    if (htmlChanged) {   // 미니앱이 바뀌면 캐시 판을 올린다(올리지 않으면 쓰던 기기가 옛 화면을 붙든다)
      const v = fs.readFileSync('lib/version.ts', 'utf8').match(/'v(\d+)'/);
      if (v) {
        const nv = 'v' + (Number(v[1]) + 1);
        fs.writeFileSync('lib/version.ts', fs.readFileSync('lib/version.ts', 'utf8').replace(`'v${v[1]}'`, `'${nv}'`));
        fs.writeFileSync('public/sw.js', fs.readFileSync('public/sw.js', 'utf8').replace(`'axhub-v${v[1]}'`, `'axhub-${nv}'`));
        files.push('lib/version.ts', 'public/sw.js');
      }
    }
    git('add', '--', ...files);
    const msg = `주간 자동 점검 ${started.toISOString().slice(0, 10)} — ` + (report.changed.length ? report.changed.map((c) => c.name).join(' · ') + ' 갱신' : '원문 대조(변경 없음)');
    const c = git('commit', '-m', msg);
    if (c.code === 0) { const p = git('push', 'origin', 'HEAD:main'); pushed = p.code === 0 ? '배포함' : 'push 실패: ' + tail(p.out, 1); }
    else pushed = '커밋 실패: ' + tail(c.out, 1);
  }
} else if (dirty && !DRY) report.alerts.push('작업 트리에 고치던 변경이 있어 이번 주 반영(커밋)을 미뤘습니다 — 자료는 받아 두었습니다');

/* 보고 */
const ymd = new Date(started.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const ran = STAGES.filter((s) => !ONLY || ONLY.includes(s.key)).length;
const lines = [`[주간 자료 점검] ${ymd} · ${ran}갈래 중 ${ran - report.failed.filter((f) => !f.startsWith('검사')).length} 대조${pushed ? ' · ' + pushed : ''}`];
if (report.changed.length) { lines.push(`바뀜 ${report.changed.length}건`); report.changed.forEach((c) => lines.push(` · ${c.name} — ${c.note}`)); }
if (report.alerts.length) { lines.push('알림'); report.alerts.forEach((a) => lines.push(' · ' + a)); }
if (report.same.length) lines.push(`그대로 ${report.same.length}건 — ${report.same.join(' · ')}`);
if (report.failed.length) { lines.push(`확인 실패 ${report.failed.length}건(기존 자료 그대로 둠)`); report.failed.forEach((f) => lines.push(' · ' + f)); }
lines.push(`자동 대상 아님 — ${MANUAL.join(' · ')} (점검 대장 기한으로 알림)`);
const text = lines.join('\n');
console.log(text);
fs.writeFileSync(`${WORK}/last-report.txt`, text);

if (!DRY) {
  const env = {};
  try { for (const l of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch {}
  const token = process.env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN;
  const chats = String(process.env.TELEGRAM_ALLOWED_CHAT_IDS || env.TELEGRAM_ALLOWED_CHAT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (token && chats.length) {
    for (const id of chats) {
      try { await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: id, text, disable_web_page_preview: true }) }); }
      catch (e) { console.error('텔레그램 보고 실패:', e.message); }
    }
  } else console.error('텔레그램 설정(.env.local)이 없어 보고는 화면·파일로만 남겼습니다');
}
process.exit(report.failed.length ? 2 : 0);
