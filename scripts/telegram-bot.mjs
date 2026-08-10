/*
 * 텔레그램 봇 — 휴대폰에서 로컬 PC의 Claude Code 에 명령을 내린다. `npm run bot`
 *
 * 왜 텔레그램인가: 롱폴링(getUpdates)은 로컬 PC 가 텔레그램 서버에 물어보는 구조라
 * 공인 IP·포트포워딩·HTTPS 인증서가 하나도 필요 없다. 공유기 NAT 뒤에서 그대로 돈다.
 *
 * ── 이것은 사실상 "휴대폰에서 로컬 PC 에 명령을 던지는 통로"다 ──
 * 봇 토큰이 유출되면 남이 이 PC 에서 명령을 실행한다. 그래서 방어를 셋 겹으로 둔다:
 *   1) chat_id 화이트리스트 — 목록에 없으면 **답조차 하지 않는다**(봇 존재를 확인시켜 주지 않는다)
 *   2) --allowedTools / --disallowedTools — Claude 가 쓸 수 있는 도구 자체를 좁힌다
 *   3) 되돌리기 어려운 요청(push·배포·삭제)은 /confirm 을 받기 전에는 실행하지 않는다
 *
 * **셋 중 진짜 경계는 2번뿐이다.** 3번은 사용자가 보낸 글자를 보고 거르는 어림짐작이라
 * 우회된다("그거 올려줘"). 어디까지나 실수 방지용이고, 보안은 1·2번이 담당한다.
 * 그래서 기본 권한 모드는 acceptEdits 이고 bypassPermissions 는 경고를 띄운다.
 *
 * 설정은 .env.local (gitignore 대상 — 이 저장소는 public 이라 토큰이 커밋되면 즉시 노출된다):
 *   TELEGRAM_BOT_TOKEN=123456:ABC...          (@BotFather 에서 발급)
 *   TELEGRAM_ALLOWED_CHAT_IDS=12345678        (쉼표로 여러 개)
 * chat_id 를 모르면 `npm run bot -- --setup` 으로 봇에 말을 걸어 확인한다.
 */
import { spawn, execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

/* ── 설정 읽기 ─────────────────────────────────────────────────────────
 * scripts/*.mjs 는 Next 가 아니라 맨 node 로 도니 .env.local 이 자동으로 안 들어온다.
 * 직접 읽되 **이미 있는 환경변수는 덮지 않는다**(셸에서 준 값이 우선).
 */
export function parseEnvFile(text) {
  const out = {};
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    const quoted = v.length > 1 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")));
    // 따옴표가 없을 때만 뒤쪽 주석을 떼어 낸다 — 토큰에 # 가 들어갈 수 있다.
    v = quoted ? v.slice(1, -1) : v.replace(/\s+#.*$/, '').trim();
    out[m[1]] = v;
  }
  return out;
}

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const p = path.join(ROOT, name);
    if (!fs.existsSync(p)) continue;
    for (const [k, v] of Object.entries(parseEnvFile(fs.readFileSync(p, 'utf8')))) {
      if (process.env[k] === undefined) process.env[k] = v;
    }
  }
}

/* 그룹 채팅 id 는 음수라 마이너스를 허용한다. 숫자가 아닌 항목은 조용히 버린다 —
 * 사용자명(@foo)을 적어 두고 걸린 줄 모르는 것보다 시작할 때 개수로 드러나는 편이 낫다. */
export function parseAllowlist(s) {
  return String(s ?? '')
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter((x) => /^-?\d+$/.test(x));
}

/* ── 도구 제한 ─────────────────────────────────────────────────────────
 * Bash 는 접두 지정(`Bash(git diff:*)`)으로 읽기·테스트만 연다. 여기 없는 명령은
 * 헤드리스 모드에서 물어볼 상대가 없어 자동 거부된다.
 * 되돌리기 어려운 것은 disallowed 로 한 번 더 못박는다(allowed 로 이미 막히지만,
 * 나중에 누가 allowed 를 넓힐 때 이 목록이 안전장치로 남는다).
 */
export const DEFAULT_ALLOWED_TOOLS = [
  'Read', 'Glob', 'Grep', 'Edit', 'Write', 'TodoWrite', 'WebFetch', 'WebSearch',
  'Bash(npm test)',
  'Bash(npm run test:*)',
  'Bash(npm run build:*)',
  'Bash(npm run lint)',
  'Bash(npx tsc --noEmit)',
  'Bash(git status:*)',
  'Bash(git diff:*)',
  'Bash(git log:*)',
  'Bash(git show:*)',
  'Bash(git branch:*)',
  'Bash(node scripts/test-*)',
];

export const DEFAULT_DISALLOWED_TOOLS = [
  'Bash(git push:*)',
  'Bash(git reset:*)',
  'Bash(git rebase:*)',
  'Bash(git clean:*)',
  'Bash(rm:*)',
  'Bash(sudo:*)',
  'Bash(vercel:*)',
  'Bash(npm publish:*)',
  'Bash(curl:*)',
];

/* ── 프리셋 ────────────────────────────────────────────────────────────
 * safe: 읽기·편집·테스트만. push·배포가 막혀 있어 휴대폰 오타가 프로덕션까지 가지 않는다.
 * full: **PC 앞에 앉은 것과 동일**. push·배포·임의 명령이 전부 된다.
 *
 * full 의 목록을 실측으로 정했다. 헤드리스는 물어볼 상대가 없어 "제한을 안 거는 것"과
 * "전부 허용하는 것"이 정반대 결과를 낸다 — 네 가지를 직접 돌려 확인했다:
 *   · --allowedTools 없음        → "This command requires approval" (거부)
 *   · --allowedTools "*"         → 거부 (와일드카드를 받지 않는다)
 *   · --permission-mode dontAsk  → git status 는 되지만 git push 는 거부
 *   · --allowedTools "Bash,…"    → **된다**
 * 그래서 **도구 이름을 하나씩 적는다.** 비워 두면 정반대로 동작한다 — 지우지 말 것.
 *
 * 접두 지정(`Bash(git push origin claude/:*)`)으로 "main 만 빼고 허용"을 만들 수는 없다.
 * 매칭이 토큰 단위라 `claude/` 같은 조각은 안 맞고 전체 브랜치명을 적어야 한다(실측).
 *
 * **full 을 쓰면 chat_id 화이트리스트가 유일한 보안 경계가 된다.** 토큰이 유출되면
 * 그 사람이 이 PC 에서 무엇이든 한다 — 시작할 때 그 사실을 경고한다.
 */
export const FULL_TOOLS = [
  'Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'TodoWrite',
  'WebFetch', 'WebSearch', 'Task', 'NotebookEdit', 'BashOutput', 'KillShell',
];

export const TOOL_PRESETS = {
  safe: { allowedTools: DEFAULT_ALLOWED_TOOLS, disallowedTools: DEFAULT_DISALLOWED_TOOLS, permissionMode: 'acceptEdits' },
  full: { allowedTools: FULL_TOOLS, disallowedTools: [], permissionMode: 'acceptEdits' },
};

export function resolveToolPolicy({ preset = 'safe', permissionMode = '', allowedTools = null, disallowedTools = null } = {}) {
  const base = TOOL_PRESETS[preset];
  if (!base) return null;
  return {
    preset,
    allowedTools: allowedTools ?? base.allowedTools,
    disallowedTools: disallowedTools ?? base.disallowedTools,
    permissionMode: permissionMode || base.permissionMode,
  };
}

/* ── 되돌리기 어려운 요청 가려내기 ────────────────────────────────────
 * 어림짐작이다. 놓치는 표현이 반드시 있으므로 **보안 경계로 쓰지 말 것.**
 * 목적은 "휴대폰에서 오타 한 번에 배포되는" 사고를 막는 것뿐이다.
 */
const RISKY_PATTERNS = [
  [/\bgit\s+push\b/i, 'git push'],
  [/\bpush\b/i, 'push'],
  [/푸시|푸쉬/, '푸시'],
  [/\bdeploy\b/i, 'deploy'],
  [/배포/, '배포'],
  [/\bvercel\b/i, 'vercel'],
  [/\bpublish\b/i, 'publish'],
  [/\bforce\b/i, 'force'],
  [/강제/, '강제'],
  [/rm\s+-rf/i, 'rm -rf'],
  [/git\s+reset\s+--hard/i, 'reset --hard'],
  [/\brebase\b/i, 'rebase'],
  [/\brevert\b/i, 'revert'],
  [/\bmerge\b/i, 'merge'],
  [/삭제|지워|없애/, '삭제'],
  [/\bdelete\b/i, 'delete'],
  [/\bdrop\b/i, 'drop'],
];

export function isRiskyPrompt(text) {
  for (const [re, label] of RISKY_PATTERNS) if (re.test(String(text ?? ''))) return label;
  return null;
}

/* ── 텔레그램 메시지 길이 ──────────────────────────────────────────────
 * 한 통 4,096자 제한. 넘으면 API 가 통째로 거부하므로 반드시 쪼갠다.
 * 줄바꿈 → 공백 → 강제 순으로 자르되, 자를 자리가 너무 앞이면 그냥 한도에서 끊는다
 * (앞쪽에서 끊으면 조각이 잘게 쪼개져 통수가 폭발한다).
 */
export function splitMessage(text, limit = 3800) {
  const out = [];
  let rest = String(text ?? '');
  if (!rest.trim()) return out;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit);
    if (cut < limit * 0.5) cut = rest.lastIndexOf(' ', limit);
    if (cut < limit * 0.5) cut = limit;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, '');
  }
  if (rest.trim()) out.push(rest);
  return out;
}

/* ── claude 인자 ───────────────────────────────────────────────────────
 * 프롬프트는 argv 가 아니라 **stdin** 으로 넘긴다 — argv 길이 제한·따옴표 이스케이프·
 * 가변인자(--allowedTools) 가 뒤 인자를 삼키는 문제를 한꺼번에 피한다.
 */
export function buildClaudeArgs({
  sessionId = null,
  permissionMode = 'acceptEdits',
  allowedTools = DEFAULT_ALLOWED_TOOLS,
  disallowedTools = DEFAULT_DISALLOWED_TOOLS,
} = {}) {
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', permissionMode];
  if (allowedTools.length) args.push('--allowedTools', allowedTools.join(','));
  if (disallowedTools.length) args.push('--disallowedTools', disallowedTools.join(','));
  if (sessionId) args.push('--resume', sessionId);
  return args;
}

/* 진행 상황 한 줄. 무엇을 만지고 있는지 보여야 기다릴 수 있다. */
export function formatToolLine(name, input) {
  const i = input || {};
  const short = (s) => {
    const t = String(s ?? '').replace(/\s+/g, ' ').trim();
    return t.length > 60 ? t.slice(0, 57) + '…' : t;
  };
  if (name === 'Bash') return `Bash: ${short(i.command)}`;
  if (i.file_path) return `${name}: ${short(path.relative(ROOT, i.file_path) || i.file_path)}`;
  if (i.pattern) return `${name}: ${short(i.pattern)}`;
  if (i.url) return `${name}: ${short(i.url)}`;
  if (i.query) return `${name}: ${short(i.query)}`;
  return name;
}

export function formatDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}초`;
  return `${Math.floor(s / 60)}분 ${s % 60}초`;
}

/* ── 시작 전 점검 — 설정이 없으면 뜨지 않는다(fail closed) ───────────── */
export function validateConfig({ token, allowlist, permissionMode, preset }) {
  const errors = [];
  if (!token) errors.push('TELEGRAM_BOT_TOKEN 이 없습니다. @BotFather 에서 발급해 .env.local 에 넣으세요.');
  if (!allowlist || allowlist.length === 0) {
    errors.push(
      'TELEGRAM_ALLOWED_CHAT_IDS 가 비어 있습니다. 화이트리스트 없이 띄우면 누구나 이 PC 에 명령할 수 있습니다.\n' +
      '  chat_id 를 모르면 토큰을 먼저 넣은 뒤:  npm run bot -- --setup',
    );
  }
  const modes = ['acceptEdits', 'auto', 'manual', 'dontAsk', 'plan', 'bypassPermissions'];
  if (permissionMode && !modes.includes(permissionMode)) {
    errors.push(`TELEGRAM_PERMISSION_MODE 값이 잘못됐습니다: ${permissionMode} (${modes.join(' / ')})`);
  }
  if (preset && !TOOL_PRESETS[preset]) {
    errors.push(`TELEGRAM_TOOL_PRESET 값이 잘못됐습니다: ${preset} (${Object.keys(TOOL_PRESETS).join(' / ')})`);
  }
  return errors;
}

/* ══════════════════════════════════════════════════════════════════════
 * 여기서부터는 실제로 봇을 띄울 때만 돈다. 위 함수들은 test-telegram.mjs 가 직접 부른다.
 * ══════════════════════════════════════════════════════════════════════ */

const API = (token, method) => `https://api.telegram.org/bot${token}/${method}`;

/* 세팅 중에 가장 자주 만나는 것이 "토큰이 틀렸다"와 "인터넷이 안 된다"인데,
 * 그때 스택 트레이스가 뜨면 원인을 알 수 없다. 사람이 읽을 수 있는 말로 바꾼다. */
export function explainTelegramError(status, bodyText) {
  const head = String(bodyText ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (status === 401) return 'TELEGRAM_BOT_TOKEN 이 잘못됐습니다. @BotFather 에서 발급받은 값을 그대로 넣었는지 확인하세요.';
  if (status === 404) return 'TELEGRAM_BOT_TOKEN 형식이 잘못된 것 같습니다 (숫자:영숫자 꼴이어야 합니다).';
  if (status === 409) return '같은 봇이 이미 다른 곳에서 돌고 있습니다. 그쪽을 먼저 끄세요.';
  if (status === 429) return '텔레그램이 요청을 제한하고 있습니다. 잠시 뒤 다시 시도하세요.';
  return `텔레그램 응답을 이해할 수 없습니다 (HTTP ${status}): ${head}`;
}

async function tg(token, method, body, timeoutMs = 60000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(API(token, method), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal: ac.signal,
    });
  } catch (e) {
    // 프록시·방화벽·인터넷 끊김. abort 는 폴링 시간 초과라 그대로 흘려 재시도하게 둔다.
    throw new Error(
      e.name === 'AbortError'
        ? `${method} 응답이 없습니다 (시간 초과)`
        : `api.telegram.org 에 연결할 수 없습니다: ${e.message}`,
    );
  } finally {
    clearTimeout(timer);
  }

  // 텔레그램은 오류 때 JSON 이 아닌 본문을 돌려주기도 한다(프록시가 가로채면 특히).
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(explainTelegramError(res.status, text)); }
  if (!json.ok) throw new Error(json.error_code ? explainTelegramError(json.error_code, json.description) : `${method} 실패: ${json.description || res.status}`);
  return json.result;
}

const HELP = [
  '세일즈 코파일럿 원격 조종',
  '',
  '그냥 하고 싶은 말을 보내면 됩니다. 대화는 이어집니다.',
  '',
  '/new     새 대화로 시작 (맥락 초기화)',
  '/status  브랜치·변경사항·현재 상태',
  '/stop    돌고 있는 작업 중단',
  '/confirm 대기 중인 위험 작업 실행',
  '/cancel  대기 중인 작업 취소',
  '/help    이 도움말',
].join('\n');

function git(args) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd: ROOT, maxBuffer: 1024 * 1024 }, (err, stdout) =>
      resolve(err ? '' : String(stdout).trim()),
    );
  });
}

async function main() {
  loadEnv();

  const setupMode = process.argv.includes('--setup');
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const allowlist = parseAllowlist(process.env.TELEGRAM_ALLOWED_CHAT_IDS);
  const preset = process.env.TELEGRAM_TOOL_PRESET || 'safe';
  const taskTimeoutMs = Number(process.env.TELEGRAM_TASK_TIMEOUT_MS || 15 * 60 * 1000);
  const claudeBin = process.env.CLAUDE_BIN || 'claude';

  // --setup 은 화이트리스트를 만들기 전 단계라 chat_id 검사를 건너뛴다. 토큰은 여전히 필요하다.
  const errors = validateConfig({
    token, allowlist: setupMode ? ['0'] : allowlist,
    permissionMode: process.env.TELEGRAM_PERMISSION_MODE, preset,
  });
  if (errors.length) {
    console.error('\n설정이 모자랍니다:\n' + errors.map((e) => '  · ' + e).join('\n') + '\n');
    process.exit(1);
  }

  const me = await tg(token, 'getMe').catch((e) => {
    console.error(`\n봇에 연결하지 못했습니다.\n  · ${e.message}\n`);
    process.exit(1);
  });

  if (setupMode) {
    console.log(`\n@${me.username} 에게 아무 메시지나 보내 보세요. chat_id 를 찍어 드립니다. (Ctrl+C 로 종료)\n`);
    let offset = 0;
    const seen = new Set();
    for (;;) {
      const ups = await tg(token, 'getUpdates', { offset, timeout: 30 }, 40000).catch(() => []);
      for (const u of ups) {
        offset = u.update_id + 1;
        const chat = u.message?.chat;
        if (!chat || seen.has(chat.id)) continue;
        seen.add(chat.id);
        const who = [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.title || '(이름 없음)';
        console.log(`  chat_id = ${chat.id}   ${who}${chat.username ? ` (@${chat.username})` : ''}`);
        console.log(`  → .env.local 에:  TELEGRAM_ALLOWED_CHAT_IDS=${[...seen].join(',')}\n`);
      }
    }
  }

  const policy = resolveToolPolicy({ preset, permissionMode: process.env.TELEGRAM_PERMISSION_MODE });
  const permissionMode = policy.permissionMode;

  if (preset === 'full' || permissionMode === 'bypassPermissions') {
    console.warn('\n─────────────────────────────────────────────────────────────');
    console.warn(` 전체 권한 모드 (preset=${preset}, ${permissionMode})`);
    console.warn(' 텔레그램으로 들어온 말이 제한 없이 이 PC 에서 실행됩니다 —');
    console.warn(' push·배포·파일 삭제까지 PC 앞에 앉은 것과 동일합니다.');
    console.warn(' 이제 chat_id 화이트리스트가 유일한 보안 경계입니다.');
    console.warn(' 토큰이 유출되면 그 사람이 이 PC 에서 무엇이든 합니다.');
    console.warn('─────────────────────────────────────────────────────────────\n');
  }

  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
  console.log(`@${me.username} 대기 중 · ${ROOT} · ${branch} · 허용 ${allowlist.length}명 · ${preset}/${permissionMode}`);
  console.log('Ctrl+C 로 종료합니다.\n');

  /* 밀려 있던 옛 메시지를 흘려보낸다 — 봇을 껐다 켰더니 몇 시간 전 명령이
   * 한꺼번에 실행되는 것을 막는다. offset:-1 은 마지막 한 건만 돌려준다. */
  let offset = 0;
  const tail = await tg(token, 'getUpdates', { offset: -1, timeout: 0 }).catch(() => []);
  if (tail.length) offset = tail[tail.length - 1].update_id + 1;

  const state = {
    sessionId: null,   // --resume 으로 대화를 잇는 열쇠
    child: null,       // 돌고 있는 claude 프로세스
    busy: false,
    pending: null,     // /confirm 을 기다리는 위험 작업
  };

  const send = async (chatId, text) => {
    for (const chunk of splitMessage(text)) {
      // parse_mode 를 쓰지 않는다 — 코드·특수문자가 섞이면 Telegram 이 파싱에 실패해
      // 메시지가 통째로 안 간다. 평문이 안전하다.
      await tg(token, 'sendMessage', { chat_id: chatId, text: chunk, disable_web_page_preview: true })
        .catch((e) => console.error('sendMessage:', e.message));
    }
  };

  /* claude 를 한 번 돌린다. stdout 은 NDJSON 이라 줄 단위로 파싱한다. */
  function runClaude(prompt, onProgress) {
    return new Promise((resolve) => {
      const args = buildClaudeArgs({ sessionId: state.sessionId, ...policy });
      const child = spawn(claudeBin, args, { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
      state.child = child;

      let buf = '';
      let stderr = '';
      let finalText = '';
      const texts = [];
      let sessionId = state.sessionId;
      let cost = null;
      let stopped = false;

      const timer = setTimeout(() => {
        stopped = true;
        child.kill('SIGTERM');
      }, taskTimeoutMs);

      const handle = (evt) => {
        if (evt.session_id) sessionId = evt.session_id;
        if (evt.type === 'assistant') {
          for (const c of evt.message?.content ?? []) {
            if (c.type === 'text' && c.text?.trim()) texts.push(c.text);
            if (c.type === 'tool_use') onProgress?.(formatToolLine(c.name, c.input));
          }
        } else if (evt.type === 'result') {
          if (typeof evt.result === 'string') finalText = evt.result;
          if (typeof evt.total_cost_usd === 'number') cost = evt.total_cost_usd;
          if (evt.is_error && !finalText) finalText = `오류: ${evt.subtype || 'unknown'}`;
        }
      };

      child.stdout.on('data', (d) => {
        buf += d.toString();
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try { handle(JSON.parse(line)); } catch { /* 부분 출력·비 JSON 로그는 버린다 */ }
        }
      });
      child.stderr.on('data', (d) => { stderr += d.toString(); });

      const done = (code) => {
        clearTimeout(timer);
        state.child = null;
        const text = finalText || texts.join('\n\n');
        resolve({
          text,
          sessionId,
          cost,
          stopped,
          ok: code === 0 && !!text,
          error: code === 0 ? '' : (stderr.trim().split('\n').slice(-5).join('\n') || `종료 코드 ${code}`),
        });
      };
      child.on('error', (e) => { clearTimeout(timer); state.child = null; resolve({ text: '', ok: false, error: `claude 실행 실패: ${e.message}`, stopped: false }); });
      child.on('close', done);

      child.stdin.end(prompt);
    });
  }

  async function dispatch(chatId, prompt) {
    state.busy = true;
    const started = Date.now();
    let statusId = null;
    let lastEdit = 0;
    let lastLine = '';

    try {
      const msg = await tg(token, 'sendMessage', { chat_id: chatId, text: '작업 중…' }).catch(() => null);
      statusId = msg?.message_id ?? null;

      const onProgress = (line) => {
        lastLine = line;
        const now = Date.now();
        if (!statusId || now - lastEdit < 3000) return;   // 텔레그램 편집 속도 제한
        lastEdit = now;
        tg(token, 'editMessageText', {
          chat_id: chatId,
          message_id: statusId,
          text: `작업 중… (${formatDuration(now - started)})\n${lastLine}`,
        }).catch(() => {});
      };

      const r = await runClaude(prompt, onProgress);
      if (r.sessionId) state.sessionId = r.sessionId;

      if (statusId) await tg(token, 'deleteMessage', { chat_id: chatId, message_id: statusId }).catch(() => {});

      if (r.stopped) return void (await send(chatId, `중단했습니다 (${formatDuration(Date.now() - started)}).`));
      if (!r.ok && !r.text) return void (await send(chatId, `실패했습니다.\n${r.error}`));

      const footer = `\n\n— ${formatDuration(Date.now() - started)}${r.cost != null ? ` · $${r.cost.toFixed(2)}` : ''}`;
      await send(chatId, (r.text || '(빈 응답)') + footer);
    } catch (e) {
      await send(chatId, `봇 오류: ${e.message}`);
    } finally {
      state.busy = false;
    }
  }

  async function handleMessage(msg) {
    const chatId = msg.chat?.id;
    const text = (msg.text ?? '').trim();
    if (chatId == null || !text) return;

    if (!allowlist.includes(String(chatId))) {
      // 답하지 않는다 — 봇이 존재한다는 사실조차 알려 줄 이유가 없다.
      // 대신 터미널에 찍어 두어, 본인이면 화이트리스트에 넣을 수 있게 한다.
      console.warn(`차단: chat_id=${chatId} (${msg.chat?.username ? '@' + msg.chat.username : msg.chat?.first_name || '?'}) "${text.slice(0, 40)}"`);
      return;
    }

    const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@.*$/, '');

    if (cmd === '/help' || cmd === '/start') return void (await send(chatId, HELP));

    if (cmd === '/new') {
      state.sessionId = null;
      state.pending = null;
      return void (await send(chatId, '새 대화로 시작합니다.'));
    }

    if (cmd === '/stop') {
      if (!state.child) return void (await send(chatId, '돌고 있는 작업이 없습니다.'));
      state.child.kill('SIGTERM');
      return void (await send(chatId, '중단 요청을 보냈습니다.'));
    }

    if (cmd === '/cancel') {
      const had = !!state.pending;
      state.pending = null;
      return void (await send(chatId, had ? '취소했습니다.' : '대기 중인 작업이 없습니다.'));
    }

    if (cmd === '/status') {
      const [br, st, last] = await Promise.all([
        git(['rev-parse', '--abbrev-ref', 'HEAD']),
        git(['status', '--short']),
        git(['log', '--oneline', '-1']),
      ]);
      return void (await send(chatId, [
        `브랜치: ${br || '?'}`,
        `최근 커밋: ${last || '?'}`,
        `변경: ${st ? '\n' + st : '없음 (깨끗)'}`,
        `대화: ${state.sessionId ? '이어짐' : '새 대화'}`,
        `상태: ${state.busy ? '작업 중' : '대기'}${state.pending ? ' · 확인 대기 1건' : ''}`,
        // 어느 권한으로 도는지 폰에서 확인할 수 있어야 한다 — full 인 줄 모르고 쓰면 안 된다.
        `권한: ${preset}${preset === 'full' ? ' (push·배포 가능)' : ' (읽기·편집·테스트만)'}`,
      ].join('\n')));
    }

    if (cmd === '/confirm') {
      const p = state.pending;
      if (!p) return void (await send(chatId, '대기 중인 작업이 없습니다.'));
      if (Date.now() - p.at > 5 * 60 * 1000) {
        state.pending = null;
        return void (await send(chatId, '확인 시간이 지났습니다(5분). 다시 보내 주세요.'));
      }
      state.pending = null;
      if (state.busy) return void (await send(chatId, '다른 작업이 돌고 있습니다. 끝난 뒤 다시 보내 주세요.'));
      return void (await dispatch(chatId, p.prompt));
    }

    if (cmd.startsWith('/')) return void (await send(chatId, `모르는 명령입니다: ${cmd}\n\n${HELP}`));

    if (state.busy) {
      return void (await send(chatId, '작업이 돌고 있습니다. 끝나면 알려 드립니다. (/stop 으로 중단)'));
    }

    const risky = isRiskyPrompt(text);
    if (risky) {
      state.pending = { prompt: text, at: Date.now() };
      return void (await send(chatId, [
        `되돌리기 어려운 작업으로 보입니다 — "${risky}"`,
        '',
        text.length > 300 ? text.slice(0, 300) + '…' : text,
        '',
        '실행하려면 /confirm · 그만두려면 /cancel (5분 뒤 자동 취소)',
      ].join('\n')));
    }

    await dispatch(chatId, text);
  }

  let running = true;
  const shutdown = () => {
    if (!running) process.exit(0);
    running = false;
    console.log('\n종료합니다…');
    state.child?.kill('SIGTERM');
    setTimeout(() => process.exit(0), 500);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  let backoff = 1000;
  while (running) {
    try {
      const ups = await tg(token, 'getUpdates', { offset, timeout: 30, allowed_updates: ['message'] }, 45000);
      backoff = 1000;
      for (const u of ups) {
        offset = u.update_id + 1;
        if (u.message) await handleMessage(u.message).catch((e) => console.error('handle:', e.message));
      }
    } catch (e) {
      if (!running) break;
      // 인터넷이 끊겨도 봇이 죽으면 안 된다 — 매장에서 다시 켜 줄 사람이 없다.
      console.error(`폴링 실패(${e.message}) — ${Math.round(backoff / 1000)}초 뒤 재시도`);
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 60000);
    }
  }
}

// 직접 실행할 때만 봇을 띄운다. import 하면 위 순수 함수만 쓸 수 있다(테스트용).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((e) => {
    // 예상 못 한 것만 스택을 보여준다 — 세팅 단계 오류는 위에서 이미 사람 말로 걸러진다.
    console.error(`\n봇이 멈췄습니다: ${e.message}\n`);
    if (process.env.DEBUG) console.error(e);
    process.exit(1);
  });
}
