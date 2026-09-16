/**
 * **바이럴분석기 Apps Script 를 터미널에서 배포한다** (2026-09-16).
 *
 * 지금까지는 `.gs`·`.html` 을 사장님이 편집기에 **붙여넣고** 새 버전을 배포했다.
 * 그 왕복이 하루 여덟 번까지 갔고(2026-09-05), 어제(9/15) `~/viral` 쪽은 Chrome
 * 편집기 탭에 코드를 써 넣는 방식으로 자동화했는데 그쪽 도구가 *"작은 파일용"* 이라
 * 적어 둔 대로 — 이 프로젝트는 `.gs` 455KB · `.html` 774KB 라 그 길이 깨지기 쉽다.
 * 그래서 **구글 공식 CLI(clasp)** 로 간다. 파일 크기 제한이 없고 브라우저도 필요 없다.
 *
 *   node scripts/deploy-gs.mjs            push + 같은 배포 id 에 새 버전 → 웹앱 URL 그대로
 *   node scripts/deploy-gs.mjs --dry      무엇을 올릴지만 보여준다
 *   node scripts/deploy-gs.mjs --pull     프로젝트의 파일 이름·매니페스트를 받아 온다(설정용)
 *
 * **처음 한 번** — `npm i -g @google/clasp` · `clasp login`(구글 로그인, 대화형이라
 * 사람이 친다) · https://script.google.com/home/usersettings 에서 Apps Script API 켜기.
 * 그 뒤로는 이 스크립트만 돌리면 된다.
 *
 * 설정은 `docs/apps-script/deploy.json` — scriptId(편집기 주소의 `/projects/<id>/edit`) ·
 * deploymentId(웹앱 주소 `/macros/s/<id>/exec`) · **저장소 파일 → 프로젝트 파일 이름** 대응.
 * 이름이 다르면 push 가 **파일을 하나 더 만들어** 같은 함수가 둘이 된다 — 그래서
 * `--pull` 로 실제 이름을 먼저 보고 적는다(짐작으로 적지 않는다).
 *
 * **`.clasp.json` 은 저장소에 두지 않는다.** clasp 는 rootDir 의 파일을 **전부** 올리므로
 * `docs/apps-script/` 에 두면 Code.gs·Exam.gs·Coupon.gs(다른 프로젝트 것)까지 바이럴
 * 프로젝트에 들어간다. 스크래치 폴더에 그 프로젝트 파일만 모아 거기서 push 한다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'docs', 'apps-script');
const CFG = path.join(SRC, 'deploy.json');
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);

function die(msg) { console.error('[deploy-gs] ' + msg); process.exit(1); }
function run(cmd, args, cwd) {
  /* 윈도우에서 `clasp` 는 `clasp.cmd` 라 shell 이 필요하다 — 인자에 사용자 입력이 없어 안전하다 */
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

if (!fs.existsSync(CFG)) die('설정이 없습니다 — ' + CFG + ' (scriptId · deploymentId · files). --pull 로 파일 이름부터 확인하세요');
const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
const proj = cfg.reviews;
if (!proj || !proj.scriptId) die('deploy.json 의 reviews.scriptId 가 비어 있습니다');
/* 웹앱 주소·배포 id 는 **앱 프록시가 이미 들고 있다**(`app/api/viral/route.ts`) — 두 벌로 적지 않는다.
 * 배포 id 는 그 주소의 `/macros/s/<id>/exec` 조각이다. */
const route = fs.readFileSync(path.join(ROOT, 'app', 'api', 'viral', 'route.ts'), 'utf8');
const um = route.match(/https:\/\/script\.google\.com\/macros\/s\/([A-Za-z0-9_-]+)\/exec/);
if (!um) die('app/api/viral/route.ts 에서 웹앱 주소를 못 찾았습니다');
proj.webAppUrl = um[0]; proj.deploymentId = proj.deploymentId || um[1];

/* clasp 가 있고 로그인돼 있는가 — 둘 다 없으면 무엇을 할지 알려 준다 */
const v = run('clasp', ['--version']);
if (v.code !== 0) die('clasp 가 없습니다 — npm i -g @google/clasp');
const home = os.homedir();
const rc = ['.clasprc.json', path.join('.config', 'clasp', '.clasprc.json')].map((p) => path.join(home, p)).find((p) => fs.existsSync(p));
if (!rc) die('clasp 로그인이 안 돼 있습니다 — 터미널에서 `clasp login` 을 한 번 치세요(구글 로그인 창이 뜹니다)');

/* 작업 폴더 — 그 프로젝트 파일만 모은다 */
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'clasp-reviews-'));
fs.writeFileSync(path.join(work, '.clasp.json'), JSON.stringify({ scriptId: proj.scriptId, rootDir: '.' }));

if (has('--pull')) {
  const r = run('clasp', ['pull'], work);
  console.log(r.out.trim());
  if (r.code !== 0) die('pull 실패');
  const names = fs.readdirSync(work).filter((f) => f !== '.clasp.json');
  console.log('\n프로젝트 안 파일:', names.join(' · '));
  console.log('→ deploy.json 의 files 에 「저장소 파일: 프로젝트 파일」로 적으세요. 매니페스트(appsscript.json)는 아래에 저장했습니다.');
  const mf = path.join(work, 'appsscript.json');
  if (fs.existsSync(mf)) { fs.copyFileSync(mf, path.join(SRC, 'reviews.appsscript.json')); console.log('  ' + path.join(SRC, 'reviews.appsscript.json')); }
  process.exit(0);
}

/* 올릴 파일 — 저장소 파일을 프로젝트 이름으로 복사 */
const files = proj.files || {};
if (!Object.keys(files).length) die('deploy.json 의 reviews.files 가 비어 있습니다 — --pull 로 이름을 확인해 적으세요');
const mf = path.join(SRC, 'reviews.appsscript.json');
if (!fs.existsSync(mf)) die('매니페스트가 없습니다 — --pull 을 먼저 돌리세요(reviews.appsscript.json 을 만듭니다)');
fs.copyFileSync(mf, path.join(work, 'appsscript.json'));
const plan = [];
for (const [src, dst] of Object.entries(files)) {
  const from = path.join(SRC, src);
  if (!fs.existsSync(from)) die('저장소에 없는 파일: ' + src);
  fs.copyFileSync(from, path.join(work, dst));
  plan.push(src + ' → ' + dst + ' (' + (fs.statSync(from).size / 1024).toFixed(0) + 'KB)');
}
console.log('[deploy-gs] 올릴 것:\n  ' + plan.join('\n  '));

/* 판 표식이 지금 내용과 맞는가 — 낡은 표식을 올리면 --remote 대조가 거짓말을 한다 */
const chk = run('node', [path.join(ROOT, 'scripts', 'stamp-gs.mjs'), '--check'], ROOT);
if (chk.code !== 0) die('판 표식이 낡았습니다 — `npm run stamp:gs` 를 먼저 돌리고 커밋하세요\n' + chk.out);

if (has('--dry')) { console.log('[deploy-gs] --dry 라 여기서 멈춥니다. 작업 폴더: ' + work); process.exit(0); }

/* push — `-f` 는 "원격 매니페스트를 덮어도 되는가" 확인을 건너뛴다(우리가 pull 해 둔 그 매니페스트다) */
const p = run('clasp', ['push', '-f'], work);
console.log(p.out.trim());
if (p.code !== 0) die('push 실패');

/* 같은 배포 id 에 새 버전 — id 를 안 주면 새 배포가 생겨 웹앱 URL 이 바뀐다 */
if (!proj.deploymentId) { console.log('[deploy-gs] deploymentId 가 없어 push 만 했습니다 — 편집기에서 「배포 관리 → 새 버전」이 필요합니다'); process.exit(0); }
const desc = (cfg.reviews.stampNote || 'deploy-gs') + ' ' + new Date().toISOString().slice(0, 16).replace('T', ' ');
const d = run('clasp', ['deploy', '-i', proj.deploymentId, '-d', desc], work);
console.log(d.out.trim());
if (d.code !== 0) die('deploy 실패');

/* 배포본 대조 — 표식이 응답에 실리므로 1초에 확정된다 */
if (proj.webAppUrl) {
  const r = run('node', [path.join(ROOT, 'scripts', 'stamp-gs.mjs'), '--remote', proj.webAppUrl], ROOT);
  console.log(r.out.trim());
}
fs.rmSync(work, { recursive: true, force: true });
console.log('[deploy-gs] 끝');
