/*
 * 작업 자물쇠 — 로컬 Claude Code 세션과 텔레그램 봇이 같은 작업 트리를 동시에 만지지 않게 한다.
 *
 * 왜 파일인가: 둘은 **서로 다른 프로세스**다. 봇의 `state.busy` 는 봇 메모리 안에만 있어
 * 로컬 세션이 무엇을 하는지 알 수가 없다. 한 PC 안의 두 프로세스가 나눠 볼 수 있는 것은
 * 디스크뿐이라, `.claude/agent.lock` 한 장을 두고 서로 본다.
 *
 *   로컬 세션 — 훅이 잡고 놓는다 (UserPromptSubmit → acquire · Stop → release)
 *   봇       — dispatch 전에 잡고, 못 잡으면 **대기열에 넣는다**(버리지 않는다)
 *
 * 잡는 것은 `fs.openSync(..., 'wx')` 한 번이다 — O_EXCL 이라 두 프로세스가 같은 순간에
 * 만들려 하면 하나만 성공한다. 락 파일에 담기는 것:
 *   { owner: 'local'|'bot', pid, at, beat, note }
 *   at   = 잡은 시각          beat = 마지막 생존 신호(봇만 찍는다 — 아래 참조)
 *
 * ── 두 주인은 생사를 재는 방법이 다르다 ──────────────────────────────
 * **봇**은 자기가 계속 떠 있는 프로세스라 pid 도 유효하고 `beat` 도 스스로 찍는다.
 *
 * **로컬은 둘 다 못 한다.** 자물쇠를 만드는 것은 훅인데, 훅은 명령 한 줄을 실행하고
 * **즉시 끝나는 프로세스**다 — 그 pid 를 적으면 잡은 그 순간 이미 죽은 자물쇠가 된다
 * (실제로 그렇게 만들었다가 `status` 가 곧장 '없음' 을 뱉어 잡았다). 훅은 턴의 시작과
 * 끝에만 불리므로 중간에 `beat` 를 찍어 줄 수도 없다.
 * 그래서 로컬은 **대화 기록 파일이 만져진 시각**을 심장박동으로 쓴다. Claude Code 가
 * 메시지와 도구 결과를 그때그때 그 파일에 이어 쓰기 때문에, 일하고 있으면 반드시 움직인다.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, '..');
/* 자리는 고정이되 검사에서는 옮길 수 있어야 한다 — 테스트가 진짜 자물쇠를 건드리면
 * 그때 돌고 있는 세션의 작업을 뺏거나, 반대로 세션 때문에 검사가 실패한다. */
export function lockFile() {
  return process.env.AGENT_LOCK_FILE || path.join(ROOT, '.claude', 'agent.lock');
}

export const OWNERS = ['local', 'bot'];

/* 봇이 심장박동을 찍는 간격. 자물쇠 판정이 이 값을 기준으로 삼는다. */
export const BEAT_MS = 10 * 1000;

/* 로컬 세션이 이만큼 조용하면 죽은 것으로 본다. 봇 작업 상한(TELEGRAM_TASK_TIMEOUT_MS
 * 기본값)과 같은 15분이다. */
export const IDLE_MS = 15 * 60 * 1000;

/* 로컬 세션의 심장박동은 **대화 기록 파일**이다. Claude Code 가 메시지·도구 결과를
 * 그때그때 이어 쓰므로 파일이 만져진 시각이 곧 "아직 일하고 있다"이다.
 * 훅이 stdin 으로 그 경로를 알려 준다. */
export function touchedAt(file, stat = fs.statSync) {
  if (!file) return 0;
  try { return stat(file).mtimeMs; } catch { return 0; }
}

/* 프로세스가 살아 있는가. 신호 0 은 실제로 보내지 않고 존재만 확인한다.
 * EPERM 은 "있는데 내 권한으로는 못 건드린다"라 **살아 있는 것**이다. */
export function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e && e.code === 'EPERM';
  }
}

/* 이 컴퓨터가 켜진 시각. **재부팅을 건너 살아남은 자물쇠**를 알아보는 데 쓴다 —
 * PC 를 끄면 Stop 훅이 돌지 못해 파일이 남는데, 켠 뒤에는 그 pid 가 엉뚱한 프로세스에
 * 재사용돼 "살아 있다"로 보일 수 있다(윈도우는 pid 를 재사용한다).
 * 분 단위로 뭉갠다 — os.uptime() 이 초 단위라 재 볼 때마다 1~2초씩 흔들린다. */
export function bootStamp(now = Date.now(), uptime = os.uptime()) {
  return Math.round((now - uptime * 1000) / 60000);
}

export function parseLock(text) {
  try {
    const o = JSON.parse(String(text ?? ''));
    if (!o || !OWNERS.includes(o.owner)) return null;
    return {
      owner: o.owner, pid: Number(o.pid) || 0, at: Number(o.at) || 0,
      beat: Number(o.beat) || 0, boot: Number(o.boot) || 0,
      transcript: String(o.transcript ?? ''), note: String(o.note ?? ''),
    };
  } catch {
    return null;   // 깨진 파일은 자물쇠로 치지 않는다(아래 read 가 썩은 것으로 처리한다).
  }
}

/* ── 썩은 자물쇠 판정 ──────────────────────────────────────────────────
 * 놓지 못하고 죽은 자물쇠를 걷어내는 규칙. 양쪽으로 틀릴 수 있다:
 *   너무 관대하면 → 로컬 세션이 Ctrl+C 로 죽은 뒤 자물쇠가 남아 **폰 명령이 영영 안 돈다**
 *   너무 엄격하면 → 멀쩡히 일하는 세션의 자물쇠를 뺏어 **두 프로세스가 같은 파일을 만진다**
 *
 * **재부팅을 먼저 본다.** PC 를 끄면 훅이 돌지 못해 파일이 그대로 남는데, 켠 뒤에는
 * 그 pid 를 엉뚱한 프로그램이 물려받아 "살아 있다"로 보일 수 있다(윈도우는 pid 를 재사용한다).
 *
 * 그다음은 주인마다 다르다 — 봇은 pid 와 심장박동, 로컬은 **대화 기록이 만져진 시각**.
 * 로컬 기준을 15분으로 넉넉히 잡은 것은 한 턴이 길어질 수 있어서다(도면 코퍼스 검사가
 * 몇 분씩 걸린다). 그래도 무한정 두지는 않는다 — 매장에서는 PC 앞으로 갈 수가 없어
 * **영영 안 풀리는 자물쇠가 잘못 뺏기는 것보다 더 자주 아프다.** 급하면 사람이 손으로
 * 푼다(봇의 `/queue force` · `agent-lock.mjs release local`).
 */
export function isStale(lock, now = Date.now(), alive = isAlive, touched = touchedAt) {
  if (!lock) return true;
  if (lock.boot && Math.abs(lock.boot - bootStamp(now)) > 2) return true;      // 재부팅을 건너왔다
  if (lock.owner === 'bot') {
    if (!alive(lock.pid)) return true;                                        // 봇 프로세스가 없다
    return now - Math.max(lock.beat, lock.at) > 6 * BEAT_MS;                   // 봇이 조용하다
  }
  return now - Math.max(touched(lock.transcript), lock.at) > IDLE_MS;          // 로컬 대화가 멈췄다
}

/* 파일에 적힌 것을 판정 없이 그대로 읽는다. `read()` 는 썩은 것을 `null` 로 뭉개므로
 * "파일이 없다"와 "있는데 썩었다"를 가를 수 없다 — 그 둘을 갈라야 하는 곳이 release 다. */
function readRaw() {
  try { return parseLock(fs.readFileSync(lockFile(), 'utf8')); } catch { return null; }
}

export function read(now = Date.now()) {
  const lock = readRaw();
  if (!lock || isStale(lock, now)) return null;
  return lock;
}

/* 자물쇠를 잡는다. 잡으면 {ok:true}, 남이 쥐고 있으면 {ok:false, held}.
 * 같은 주인이 다시 부르면 갱신으로 본다 — 훅이 두 번 불려도 사고가 나지 않아야 한다. */
export function acquire(owner, { note = '', pid = null, now = Date.now(), transcript = '' } = {}) {
  if (!OWNERS.includes(owner)) throw new Error(`알 수 없는 주인: ${owner}`);
  fs.mkdirSync(path.dirname(lockFile()), { recursive: true });
  /* 로컬은 pid 를 적지 않는다 — 훅 프로세스의 pid 라 적는 순간 죽는다(위 주석 참조). */
  if (pid == null) pid = owner === 'bot' ? process.pid : 0;
  const body = JSON.stringify({ owner, pid, at: now, beat: now, boot: bootStamp(now), transcript, note });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(lockFile(), body, { flag: 'wx' });   // O_EXCL — 동시에 만들면 하나만 이긴다
      return { ok: true };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const held = read(now);
      if (!held) { try { fs.unlinkSync(lockFile()); } catch { /* 남이 먼저 치웠다 */ } continue; }
      if (held.owner === owner && held.pid === pid) {
        // 같은 주인의 다음 턴 — 심장박동과 대화 기록 경로를 새로 고친다.
        fs.writeFileSync(lockFile(), JSON.stringify({
          ...held, beat: now, transcript: transcript || held.transcript, note: note || held.note,
        }));
        return { ok: true };
      }
      return { ok: false, held };
    }
  }
  return { ok: false, held: read(now) };
}

/* 살아 있다고 알린다(봇 전용 — 위 '비대칭' 주석 참조). 내 자물쇠가 아니면 아무 일도 안 한다. */
export function beat(owner, { pid = process.pid, now = Date.now() } = {}) {
  const held = read(now);
  if (!held || held.owner !== owner || held.pid !== pid) return false;
  fs.writeFileSync(lockFile(), JSON.stringify({ ...held, beat: now }));
  return true;
}

/* 놓는다. **남의 자물쇠는 놓지 않는다** — 봇이 잡고 있는데 로컬 Stop 훅이 지우면
 * 그 순간 둘 다 자유롭다고 믿고 동시에 달린다. */
export function release(owner, { pid = process.pid } = {}) {
  const held = read();
  if (!held) {
    /* 파일이 없거나 **썩었다**. 썩은 것이라도 주인이 다르면 지우지 않는다 —
     * 봇은 10초마다 박동을 찍는데 판정선은 60초라, **절전에서 깨어난 직후**에는
     * `Date.now()` 가 뛰어 살아 있는 봇이 다음 박동까지 최대 10초간 '썩음'으로 읽힌다.
     * 그 창에서 로컬 Stop 훅이 돌면 멀쩡한 봇 자물쇠가 지워지고 둘이 동시에 달린다 —
     * 이 자물쇠가 막으려던 바로 그 상황이다.
     * **복구는 그대로 된다** — 진짜로 죽어 남은 자물쇠는 `acquire` 가 스스로 걷어낸다
     * (EEXIST → 썩었으면 unlink 후 재시도). 지우는 길이 여기 하나 더 있을 뿐이었다. */
    const rotten = readRaw();
    if (rotten && rotten.owner !== owner) return false;
    try { fs.unlinkSync(lockFile()); } catch { /* 이미 없다 */ }
    return true;
  }
  if (held.owner !== owner) return false;
  if (held.pid && pid && held.pid !== pid && owner === 'bot') return false;
  try { fs.unlinkSync(lockFile()); } catch { /* 경합 — 이미 없어졌으면 목적은 달성됐다 */ }
  return true;
}

export function describe(lock, now = Date.now()) {
  if (!lock) return '없음';
  const who = lock.owner === 'local' ? '로컬 세션' : '텔레그램 봇';
  const sec = Math.max(0, Math.round((now - lock.at) / 1000));
  const dur = sec < 60 ? `${sec}초째` : `${Math.floor(sec / 60)}분 ${sec % 60}초째`;
  return `${who} 작업 중 (${dur})${lock.note ? ` — ${lock.note}` : ''}`;
}

/* ── 봇이 띄운 세션은 '로컬'이 아니다 ─────────────────────────────────
 * 봇은 `claude -p` 를 **이 저장소를 cwd 로** 띄운다. 그 자식 세션도 `.claude/settings.json`
 * 을 읽으므로 **훅이 그대로 돈다** — 그래서 자식의 UserPromptSubmit 이 `acquire local` 을
 * 부르고, 자기를 띄운 봇의 자물쇠를 보고 "충돌"이라고 신고했다(2026-08-15 실측: 폰에서
 * 보낸 첫 명령이 `[작업 자물쇠] 텔레그램 봇 작업 중 …` 을 맥락에 달고 시작했다).
 *
 * **파일이 엉키지는 않는다** — `release` 가 주인을 대조해 남의 자물쇠를 지킨다. 문제는
 * 경고문이 세션 맥락에 붙는다는 것이다. 모델이 그걸 "봇이 돌고 있으니 기다리자"로 읽으면
 * 폰에서 보낸 명령이 아무것도 안 하고 끝난다. 자기 자신과의 충돌을 자기에게 보고하는 셈이다.
 *
 * 알아보는 방법은 **봇이 spawn 할 때 넣어 주는 환경변수 표식**이다. 환경변수는 자식으로
 * 복사되고 손자(훅 프로세스)까지 내려가므로, pid 계보를 뒤지지 않아도 된다(윈도우에서
 * 계보 추적은 비싸고 pid 재사용까지 겹친다). 표식이 있으면 acquire·release 를 **둘 다**
 * 건너뛴다 — release 만 남겨 두면 봇 자물쇠가 썩은 것으로 판정되는 찰나에 자식의 Stop 훅이
 * 그것을 지운다. */
export const SELF_ENV = 'AGENT_LOCK_SESSION';

export function isBotChild(env = process.env) {
  return env[SELF_ENV] === 'bot';
}

/* ── 훅에서 부르는 얼굴 ────────────────────────────────────────────────
 *   node scripts/agent-lock.mjs acquire local   (UserPromptSubmit)
 *   node scripts/agent-lock.mjs release local   (Stop)
 *   node scripts/agent-lock.mjs status
 *
 * **로컬 쪽은 막지 않는다**(종료코드 0). 봇 작업이 돌고 있으면 그 사실만 알린다 —
 * stdout 이 그대로 세션 맥락에 붙어 "지금 봇이 돌고 있으니 기다리자"를 판단할 수 있다.
 * 사람이 PC 앞에 앉아 친 말을 훅이 지워 버리는 쪽이 더 나쁘다.
 */
/* 훅은 stdin 으로 JSON 을 준다 — 여기서 필요한 것은 `transcript_path`(로컬 심장박동)다.
 * 사람이 손으로 부르면 stdin 이 터미널이라 읽으려 들면 멈춘다. TTY 는 건너뛴다. */
function hookInput() {
  try {
    if (process.stdin.isTTY) return {};
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch { return {}; }
}

function cli(argv) {
  const [cmd, owner = 'local'] = argv;
  /* 봇이 띄운 세션 안에서 도는 훅이다 — 자물쇠는 봇이 이미 쥐고 있고 봇이 놓는다.
   * 여기서 잡으려 들면 자기 자신을 충돌로 신고하고, 놓으려 들면 봇 것을 건드린다. */
  if (owner === 'local' && isBotChild() && (cmd === 'acquire' || cmd === 'release')) return 0;
  if (cmd === 'acquire') {
    const r = acquire(owner, { note: argv.slice(2).join(' '), transcript: hookInput().transcript_path || '' });
    if (!r.ok) console.log(`[작업 자물쇠] ${describe(r.held)} — 같은 파일을 동시에 고치면 서로 덮어씁니다.`);
    return 0;
  }
  if (cmd === 'release') { release(owner); return 0; }
  if (cmd === 'status') { console.log(describe(read())); return 0; }
  console.error('사용법: agent-lock.mjs <acquire|release|status> [local|bot]');
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exit(cli(process.argv.slice(2)));
}
