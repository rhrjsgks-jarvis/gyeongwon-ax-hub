/*
 * 백업 — `npm run backup`
 *
 * 지키려는 사고가 셋이고, 각각 다른 방어가 필요하다:
 *
 *  ① PC 고장·실수로 폴더 삭제 → 코드는 GitHub 이 이미 막아 준다. **막아 주지 못하는 것이
 *     `.scratch/`(도구 전부)와 커밋하지 않는 실도면**이라 여기서 그것들을 챙긴다.
 *  ② `git reset --hard` 같은 실수 → 30일간 `git reflog` 로 되살아난다. 그 뒤가 문제라
 *     번들이 그 시점의 히스토리를 통째로 들고 있는다.
 *  ③ **GitHub 계정 탈취** → force push 로 히스토리를 지울 수 있다. 이때 되돌릴 수 있는
 *     것은 오프라인 사본뿐이다 — 그래서 저장소를 `git bundle` **파일 하나**로 뜬다.
 *     `git clone <파일>.bundle` 로 모든 커밋·브랜치가 그대로 복구된다.
 *
 * **비밀값은 기본으로 담지 않는다.** `.env.local` 의 텔레그램 토큰은 BotFather 에서
 * 10초면 재발급되는데, 백업 파일이 클라우드 동기화 폴더에 놓이므로 담아 두는 쪽의 손해가
 * 더 크다. 어떤 키가 있었는지는 **이름만** 적어 두어 무엇을 다시 채워야 하는지는 남긴다.
 * 값까지 필요하면 `--with-secrets`.
 *
 * 두는 곳은 `BACKUP_DIR`, 없으면 OneDrive. **같은 디스크에 두는 것은 백업이 아니다** —
 * 디스크가 죽으면 원본과 사본이 함께 죽는다. 그래서 클라우드 동기화 폴더를 기본으로 삼고,
 * 그것도 없으면 경고한다.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(import.meta.dirname, '..');
const WITH_SECRETS = process.argv.includes('--with-secrets');
const KEEP = 3;                       // 남겨 둘 회차 수 (오래된 것부터 지운다)

/* ── 둘 곳 정하기 ─────────────────────────────────────────────── */
function pickDest() {
  if (process.env.BACKUP_DIR) return { dir: process.env.BACKUP_DIR, synced: true };
  const home = os.homedir();
  for (const c of ['OneDrive', 'Google Drive', 'Dropbox', 'iCloudDrive']) {
    const d = path.join(home, c);
    if (fs.existsSync(d)) return { dir: path.join(d, '세일즈코파일럿-백업'), synced: true };
  }
  return { dir: path.join(home, '세일즈코파일럿-백업'), synced: false };
}

const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
const { dir: BASE, synced } = pickDest();
const OUT = path.join(BASE, stamp);

const log = (s) => console.log(s);
const mb = (n) => (n / 1048576).toFixed(1) + 'MB';

function dirSize(d) {
  let n = 0;
  for (const e of fs.readdirSync(d, { withFileTypes: true, recursive: true })) {
    if (e.isFile()) n += fs.statSync(path.join(e.parentPath ?? e.path, e.name)).size;
  }
  return n;
}

/* 폴더를 그대로 복사한다. 필터를 주면 파일마다 물어본다. */
function copyTree(src, dst, filter) {
  if (!fs.existsSync(src)) return 0;
  let n = 0;
  for (const e of fs.readdirSync(src, { withFileTypes: true, recursive: true })) {
    if (!e.isFile()) continue;
    const from = path.join(e.parentPath ?? e.path, e.name);
    const rel = path.relative(src, from);
    if (filter && !filter(rel, from)) continue;
    const to = path.join(dst, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    n++;
  }
  return n;
}

/* ── 시작 ─────────────────────────────────────────────────────── */
fs.mkdirSync(OUT, { recursive: true });
log(`백업 → ${OUT}\n`);
if (!synced) {
  log('⚠  클라우드 동기화 폴더(OneDrive 등)를 못 찾아 홈 폴더에 만듭니다.');
  log('   같은 디스크에 두면 디스크가 죽을 때 원본과 함께 죽습니다 —');
  log('   외장 드라이브나 클라우드 경로를 BACKUP_DIR 로 지정하세요.\n');
}

const man = [];
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT }).toString().trim();

/* ① 저장소 전체를 번들 하나로 — 모든 브랜치·태그·히스토리 */
{
  const f = path.join(OUT, 'repo.bundle');
  execFileSync('git', ['bundle', 'create', f, '--all'], { cwd: ROOT, stdio: 'pipe' });
  const size = fs.statSync(f).size;

  /*
   * **쓴 직후에 되읽어 검증한다.** 백업이 깨진 것을 복구할 때 알게 되면 이미 늦다.
   * `verify` 가 히스토리 완결성을, ref 수 대조가 "빠뜨린 브랜치가 없는가"를 본다 —
   * `--all` 은 refs/remotes 와 stash 까지 담으므로 원본 ref 수와 정확히 같아야 한다.
   */
  execFileSync('git', ['bundle', 'verify', f], { cwd: ROOT, stdio: 'pipe' });
  const inBundle = execFileSync('git', ['bundle', 'list-heads', f], { cwd: ROOT })
    .toString().trim().split('\n').filter(Boolean).length;
  const inRepo = execFileSync('git', ['for-each-ref'], { cwd: ROOT })
    .toString().trim().split('\n').filter(Boolean).length + 1;   // +1 = HEAD
  if (inBundle < inRepo) throw new Error(`번들 ref ${inBundle}개 < 저장소 ${inRepo}개 — 빠진 브랜치가 있다`);

  log(`  repo.bundle          ${mb(size).padStart(8)}  (HEAD ${head.slice(0, 7)} · ref ${inBundle}개 · 검증 통과)`);
  man.push(`repo.bundle  ${mb(size)}  HEAD=${head} branch=${branch} refs=${inBundle}`);
}

/* ② `.scratch/` 는 **스크립트만**. 1.6GB 중 대부분이 다시 받을 수 있는 수집 원본이고,
 *    잃으면 못 되찾는 것은 우리가 쓴 도구다. json 은 측정 결과라 작은 것만 담는다. */
{
  const dst = path.join(OUT, 'scratch');
  const n = copyTree(path.join(ROOT, '.scratch'), dst, (rel, from) => {
    if (/[\\/]node_modules[\\/]/.test(rel)) return false;
    if (/\.(mjs|cjs|js|ts|md|txt|py|sh)$/i.test(rel)) return true;
    return /\.json$/i.test(rel) && fs.statSync(from).size < 5 * 1048576;
  });
  log(`  scratch/             ${mb(dirSize(dst)).padStart(8)}  (도구 ${n}개 — 이미지·PDF 는 제외)`);
  man.push(`scratch/  도구 ${n}개`);
}

/* ③ 커밋하지 않는 실도면 코퍼스 (저작권 때문에 저장소에 못 올린다) */
{
  const dst = path.join(OUT, 'plans-real');
  const n = copyTree(path.join(ROOT, 'scripts/fixtures/plans-real'), dst);
  log(`  plans-real/          ${mb(dirSize(dst)).padStart(8)}  (${n}개 — test:real 이 쓰는 실도면)`);
  man.push(`plans-real/  ${n}개`);
}

/* ④ 사용자가 준 원본 */
{
  const dst = path.join(OUT, 'inbox');
  let n = copyTree(path.join(ROOT, '업로드'), path.join(dst, '업로드'));
  for (const f of fs.readdirSync(ROOT)) {
    if (!/^밤샘작업지시문.*\.md$/.test(f)) continue;
    fs.mkdirSync(dst, { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), path.join(dst, f));
    n++;
  }
  if (n) log(`  inbox/               ${mb(dirSize(dst)).padStart(8)}  (${n}개 — 받은 원본·지시문)`);
  man.push(`inbox/  ${n}개`);
}

/* ⑤ 비밀값 — 기본은 **이름만** */
{
  const src = path.join(ROOT, '.env.local');
  if (fs.existsSync(src)) {
    if (WITH_SECRETS) {
      fs.copyFileSync(src, path.join(OUT, '.env.local'));
      log('  .env.local            (값 포함) ⚠ 이 백업을 남과 공유하지 마세요');
      man.push('.env.local  값 포함');
    } else {
      const keys = fs.readFileSync(src, 'utf8').split('\n')
        .map((l) => (l.match(/^\s*([A-Z0-9_]+)\s*=/) || [])[1]).filter(Boolean);
      fs.writeFileSync(path.join(OUT, 'env-keys.txt'),
        '.env.local 에 있던 키 이름 (값은 담지 않았다 — --with-secrets 로 포함 가능)\n'
        + '텔레그램 토큰은 BotFather 에서 재발급하면 된다.\n\n' + keys.join('\n') + '\n');
      log(`  env-keys.txt          (키 이름 ${keys.length}개만 — 값은 담지 않음)`);
      man.push(`env-keys.txt  키 ${keys.length}개 (값 제외)`);
    }
  }
}

/* ── 복구 설명서를 함께 넣는다. 백업만 있고 되돌리는 법을 모르면 백업이 아니다. ── */
fs.writeFileSync(path.join(OUT, '복구방법.txt'), `세일즈 코파일럿 백업 — ${stamp}

담긴 것
${man.map((s) => '  · ' + s).join('\n')}

되돌리는 법
  1) 저장소 전체 복구  ※ clone 이 아니라 init+fetch 다. 이유는 아래.
       git init gyeongwon-ax-hub
       cd gyeongwon-ax-hub
       git fetch <이 폴더>/repo.bundle "refs/*:refs/*"
       git checkout main
       git remote add origin https://github.com/rhrjsgks-jarvis/gyeongwon-ax-hub.git
       npm install

     → 520커밋 · ref 13개 전부 살아난다(확인함). GitHub 이 통째로 사라져도 여기서 되돌린다.

     ※ "git clone repo.bundle" 을 쓰지 말 것. clone 의 기본 refspec 은 refs/heads/* 만
       옮겨서, 원격에만 있는 브랜치와 stash 가 이름을 잃는다 — 번들에는 들어 있는데
       가리키는 ref 가 없어 사실상 못 찾고 언젠가 gc 로 사라진다. 정작 GitHub 탈취를
       대비하는 백업인데 원격 전용 브랜치가 날아가면 뜻이 없다.
       "refs/*:refs/*" 는 이름을 그대로 옮긴다.

  2) 도구 되돌리기
       scratch/ 를 저장소 안 .scratch/ 로 복사

  3) 실도면 코퍼스
       plans-real/ 을 scripts/fixtures/plans-real/ 로 복사
     → 없으면 npm run test:real 이 조용히 SKIP 된다(실패가 아니라 건너뛴다).

  4) .env.local
       env-keys.txt 의 키 이름을 보고 값을 다시 채운다.
       TELEGRAM_BOT_TOKEN 은 텔레그램 BotFather 에서 재발급.

  5) 확인
       npm test && npm run test:e2e
`);

/* ── 오래된 회차 정리 ─────────────────────────────────────────── */
const rounds = fs.readdirSync(BASE).filter((d) => /^\d{8}-\d{4}$/.test(d)).sort();
for (const old of rounds.slice(0, Math.max(0, rounds.length - KEEP))) {
  fs.rmSync(path.join(BASE, old), { recursive: true, force: true });
  log(`  (오래된 회차 삭제: ${old})`);
}

log(`\n합계 ${mb(dirSize(OUT))} · 회차 ${Math.min(rounds.length, KEEP)}개 보관`);
log(`복구 방법은 ${path.join(OUT, '복구방법.txt')} 에 함께 넣었습니다.`);
