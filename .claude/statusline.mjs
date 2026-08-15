/*
 * 현재상황 — **한 곳에서만 센다.**
 *   상태줄:  node .claude/statusline.mjs        (settings.json 의 statusLine 이 부른다)
 *   훅:      status-context.mjs 가 status() 를 import 한다
 * 두 곳에서 따로 세면 화면이 서로 다른 말을 한다(이 저장소가 반복해서 데인 종류다 —
 * 허브 카드 개수·앱 버전·비교표 값이 전부 그랬다).
 *
 * 띄우는 것은 **틀리면 비싼 것 넷**이다:
 *   · 미배포 커밋 수 — main push 가 곧 배포이고 **배포 횟수에 한도가 있다.**
 *     10커밋이 넘으면 묻지 않고 올리기로 한 기준(CLAUDE.md)이라 눈에 보여야 한다.
 *   · 버전 — 매장에서 "내 폰이 최신인가"를 이 숫자로 판단한다. 화면·캐시가 어긋나면 경고.
 *   · 작업 자물쇠 — 폰(텔레그램 봇)과 PC 가 같은 작업 트리를 동시에 고치는 사고를 막는 장치.
 *   · 지금 하는 일 — `.claude/now.txt` 한 줄.
 *
 * **절대 던지지 않는다.** 상태줄이 죽으면 화면에서 조용히 사라져 원인을 못 찾는다.
 * 느려도 안 된다(매 렌더마다 돈다) — git 호출은 둘뿐이고 각각 1.5초에서 끊는다.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEPLOY_AT = 10;   // CLAUDE.md: 미푸시 10커밋이 넘으면 묻지 않고 올린다

const ROOT = process.cwd();
const git = (args, fallback = '') => {
  try {
    return execFileSync('git', args, {
      cwd: ROOT, encoding: 'utf8', timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch { return fallback; }
};
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch { return ''; } };

/** 화면에 쓸 값들을 한 번에 낸다. 어떤 항목도 예외를 밖으로 내보내지 않는다. */
export function status() {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], '?');

  /* origin/main 이 없으면(클론 직후 등) 세지 않는다 — 0 으로 적으면 "올릴 것이 없다"는
     거짓말이 된다. 그때는 물음표로 둔다. */
  const raw = git(['rev-list', '--count', 'origin/main..HEAD'], '');
  const ahead = raw === '' ? null : Number(raw);

  const v = read('lib/version.ts').match(/APP_VERSION\s*=\s*'([^']+)'/);
  const cache = read('public/sw.js').match(/CACHE_VERSION\s*=\s*'axhub-([^']+)'/);

  let lock = null;
  try {
    const j = JSON.parse(read('.claude/agent.lock') || 'null');
    if (j && j.owner) lock = j.owner;
  } catch { /* 깨진 파일 때문에 상태줄이 사라지면 안 된다 */ }

  const now = read('.claude/now.txt').split('\n')[0].trim();
  let nowAgeMin = null;
  if (now) {
    try {
      nowAgeMin = Math.round((Date.now() - fs.statSync(path.join(ROOT, '.claude/now.txt')).mtimeMs) / 60000);
    } catch { /* mtime 을 못 읽어도 문구는 띄운다 */ }
  }

  return {
    branch, ahead,
    version: v ? v[1] : null,
    cache: cache ? cache[1] : null,
    versionMismatch: !!(v && cache && v[1] !== cache[1]),
    lock, now, nowAgeMin,
  };
}

/** 손으로 적는 값이라 굳으면 거짓이 된다 — 오래된 기록은 오래됐다고 밝힌다. */
export function ageText(min) {
  if (min == null || min < 30) return '';
  return ` (${min >= 120 ? Math.round(min / 60) + '시간' : min + '분'} 전)`;
}

/** 상태줄 한 줄 */
export function line() {
  const s = status();
  const parts = [` ${s.branch}`];

  if (s.ahead == null) parts.push('⏳미배포 ?');
  else parts.push(s.ahead >= DEPLOY_AT ? `🚀미배포 ${s.ahead}/${DEPLOY_AT} 올릴 때` : `⏳미배포 ${s.ahead}/${DEPLOY_AT}`);

  /* 화면·캐시 버전이 어긋나는 것 자체가 알려야 할 사고다(test-consistency 가 잡는 짝이다) */
  if (s.versionMismatch) parts.push(`⚠ 화면 ${s.version} ≠ 캐시 ${s.cache}`);
  else if (s.version) parts.push(s.version);

  if (s.lock) parts.push(`🔒${s.lock}`);
  if (s.now) parts.push(s.now + ageText(s.nowAgeMin));

  return parts.join('  ·  ');
}

/* 직접 실행했을 때만 찍는다 — import 하면 아무것도 출력하지 않는다 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(line()); } catch { /* 상태줄은 조용히 실패한다 */ }
}
