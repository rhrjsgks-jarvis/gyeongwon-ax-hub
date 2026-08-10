/*
 * 텔레그램 봇 회귀 테스트 — `npm run test:telegram`
 *
 * **이 봇은 휴대폰에서 로컬 PC 에 명령을 던지는 통로다.** 그래서 검사가 기능보다
 * 안전장치 쪽에 몰려 있다:
 *   [1] 설정이 없으면 뜨지 않는가 (fail closed — 화이트리스트 없이 뜨면 누구나 명령할 수 있다)
 *   [2] 도구 제한이 살아 있는가 (git push·rm 이 열려 있으면 안 된다)
 *   [3] 되돌리기 어려운 요청을 잡아내는가
 *   [4] 4,096자 제한을 넘기지 않는가 (넘으면 메시지가 통째로 안 간다)
 *   [5] .env.local 파싱 — 토큰에 특수문자가 섞여도 잘리지 않는가
 *   [6] 토큰이 저장소에 커밋될 길이 없는가 (public repo)
 *
 * 봇 자체는 네트워크가 필요하니 띄우지 않는다. 순수 함수만 직접 부른다.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseEnvFile, parseAllowlist, splitMessage, isRiskyPrompt, buildClaudeArgs,
  formatToolLine, formatDuration, validateConfig, explainTelegramError, resolveToolPolicy,
  resolveClaudeBin, describeSpawnError,
  DEFAULT_ALLOWED_TOOLS, DEFAULT_DISALLOWED_TOOLS, TOOL_PRESETS,
} from './telegram-bot.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

let ok = true;
const fail = (m) => { console.log('ERROR:', m); ok = false; };
const pass = (m) => console.log('OK:', m);
const eq = (a, b, m) => (a === b ? pass(m) : fail(`${m} — 기대 ${JSON.stringify(b)}, 실제 ${JSON.stringify(a)}`));

// ── [1] 설정이 없으면 뜨지 않는다 ──
{
  const noToken = validateConfig({ token: '', allowlist: ['1'], permissionMode: 'acceptEdits' });
  if (!noToken.length) fail('토큰 없이도 통과했다');
  else pass('토큰이 없으면 시작 거부');

  const noAllow = validateConfig({ token: 'x', allowlist: [], permissionMode: 'acceptEdits' });
  if (!noAllow.length) fail('화이트리스트가 비어도 통과했다 — 누구나 이 PC 에 명령할 수 있게 된다');
  else pass('화이트리스트가 비면 시작 거부');

  const badMode = validateConfig({ token: 'x', allowlist: ['1'], permissionMode: 'yolo' });
  if (!badMode.length) fail('잘못된 permission mode 가 통과했다');
  else pass('잘못된 permission mode 거부');

  eq(validateConfig({ token: 'x', allowlist: ['1'], permissionMode: 'acceptEdits' }).length, 0, '정상 설정은 통과');
}

// ── [1-b] 화이트리스트 파싱 ──
{
  const a = parseAllowlist('123, 456  789');
  eq(a.join('|'), '123|456|789', '쉼표·공백 혼용 파싱');
  eq(parseAllowlist('-1001234567890')[0], '-1001234567890', '그룹 채팅 음수 id 허용');
  eq(parseAllowlist('@myname').length, 0, '사용자명은 버린다(숫자만)');
  eq(parseAllowlist('').length, 0, '빈 값은 빈 목록');
  eq(parseAllowlist(undefined).length, 0, 'undefined 도 빈 목록');
  // 문자열로 비교해야 한다 — chat_id 는 64비트라 Number 로 바꾸면 정밀도가 깨진다.
  if (parseAllowlist('123').some((x) => typeof x !== 'string')) fail('chat_id 는 문자열로 들고 있어야 한다');
  else pass('chat_id 를 문자열로 유지(64비트 정밀도)');
}

// ── [2] 도구 제한 ──
{
  const args = buildClaudeArgs({});
  const s = args.join(' ');
  if (!s.includes('--permission-mode acceptEdits')) fail('기본 권한 모드가 acceptEdits 가 아니다');
  else pass('기본 권한 모드 acceptEdits');
  if (s.includes('bypassPermissions')) fail('기본값에 bypassPermissions 가 들어 있다');
  else pass('기본값에 bypassPermissions 없음');
  if (!s.includes('--output-format stream-json') || !s.includes('--verbose')) fail('stream-json 에는 --verbose 가 함께 필요하다');
  else pass('stream-json + --verbose');
  if (args.includes('--resume')) fail('세션 없이 --resume 이 붙었다');
  else pass('세션이 없으면 --resume 없음');

  const resumed = buildClaudeArgs({ sessionId: 'abc-123' });
  eq(resumed[resumed.indexOf('--resume') + 1], 'abc-123', '세션이 있으면 --resume 으로 대화를 잇는다');

  // 프롬프트는 stdin 으로 넘긴다 — argv 에 들어가면 길이 제한·이스케이프 문제가 생긴다.
  if (args.some((a) => a.length > 400)) fail('argv 에 프롬프트가 섞여 들어갔다');
  else pass('프롬프트는 argv 가 아니라 stdin');

  const allowed = DEFAULT_ALLOWED_TOOLS.join(',');
  for (const bad of ['git push', 'rm ', 'sudo', 'vercel']) {
    if (allowed.includes(bad)) fail(`허용 목록에 ${bad} 가 들어 있다`);
  }
  pass('허용 목록에 push·rm·sudo·vercel 없음');

  for (const must of ['Bash(git push:*)', 'Bash(rm:*)', 'Bash(sudo:*)', 'Bash(git reset:*)']) {
    if (!DEFAULT_DISALLOWED_TOOLS.includes(must)) fail(`차단 목록에 ${must} 가 빠졌다`);
  }
  pass('차단 목록에 push·rm·sudo·reset 포함');

  // Bash 를 통째로 여는 순간 위 제한이 전부 무의미해진다.
  if (DEFAULT_ALLOWED_TOOLS.includes('Bash')) fail('Bash 가 접두 지정 없이 통째로 열려 있다');
  else pass('Bash 는 접두 지정으로만 허용');
}

/* ── [2-b] 프리셋 ──
 * safe 가 기본이어야 한다. 설정을 안 건드린 사람이 자기도 모르게 push 권한으로 도는 일은 없어야 한다.
 * full 은 "PC 앞에 앉은 것과 동일"이 목적이라 제한이 없는 것이 맞다 — 대신 그 사실을 검사로 못박는다.
 */
{
  const safe = resolveToolPolicy({});
  eq(safe.preset, 'safe', '프리셋 기본값은 safe');
  eq(safe.permissionMode, 'acceptEdits', 'safe 의 권한 모드는 acceptEdits');
  if (!safe.allowedTools.length) fail('safe 인데 도구 제한이 없다');
  else pass('safe 는 도구를 좁힌다');

  /* full 은 **도구를 하나씩 적어야** 동작한다. 실측으로 확인한 것:
   *   --allowedTools 없음 → 거부 / "*" → 거부 / dontAsk → push 만 거부 / 명시 목록 → 동작.
   * "제한이 없으니 비워 두자"로 되돌리면 정반대로 아무것도 못 하게 된다. */
  const full = resolveToolPolicy({ preset: 'full' });
  eq(full.disallowedTools.length, 0, 'full 은 차단 목록이 없다');
  if (!full.allowedTools.includes('Bash')) fail('full 에 Bash 가 없다 — push·배포가 안 된다');
  else pass('full 은 Bash 를 통째로 연다');
  if (full.allowedTools.some((t) => t.includes('('))) fail('full 에 접두 지정이 남아 있다 — 전부 열리지 않는다');
  else pass('full 은 접두 지정 없이 도구 이름만');
  for (const t of ['Read', 'Edit', 'Write', 'Task']) {
    if (!full.allowedTools.includes(t)) fail(`full 에 ${t} 가 빠졌다`);
  }
  pass('full 에 편집·검색·서브에이전트 도구 포함');

  const fullArgs = buildClaudeArgs({ ...full }).join(' ');
  if (!fullArgs.includes('--allowedTools')) fail('full 인데 허용 목록이 인자에 안 실렸다 — 비우면 전부 거부된다');
  else pass('full 인자에 허용 목록 반영');
  if (fullArgs.includes('--disallowedTools')) fail('full 인데 차단 목록이 붙었다');
  else pass('full 은 차단 목록을 붙이지 않는다');
  if (fullArgs.includes('--allowedTools *')) fail('와일드카드는 CLI 가 받지 않는다(실측) — 목록을 적어야 한다');
  else pass('full 은 와일드카드를 쓰지 않는다');

  // 환경변수로 권한 모드를 덮어쓸 수 있어야 한다(프리셋보다 사용자 지정이 우선).
  eq(resolveToolPolicy({ preset: 'full', permissionMode: 'plan' }).permissionMode, 'plan',
    '직접 지정한 권한 모드가 프리셋을 이긴다');

  eq(resolveToolPolicy({ preset: '없는프리셋' }), null, '모르는 프리셋은 null');
  if (validateConfig({ token: 'x', allowlist: ['1'], preset: '없는프리셋' }).length === 0) {
    fail('잘못된 프리셋이 통과했다');
  } else pass('잘못된 프리셋 거부');
  eq(Object.keys(TOOL_PRESETS).sort().join(','), 'full,safe', '프리셋은 safe·full 둘');
}

// ── [3] 되돌리기 어려운 요청 ──
{
  const risky = [
    ['배포해줘', '배포'],
    ['git push 해줘', 'git push'],
    ['푸시해줘', '푸시'],
    ['vercel 로 올려줘', 'vercel'],
    ['force push', 'force'],
    ['rm -rf node_modules', 'rm -rf'],
    ['git reset --hard 해줘', 'reset --hard'],
    ['이 파일 삭제해줘', '삭제'],
    ['main 에 merge 해줘', 'merge'],
  ];
  let bad = 0;
  for (const [t] of risky) if (!isRiskyPrompt(t)) { fail(`위험 요청을 못 잡았다: "${t}"`); bad++; }
  if (!bad) pass(`되돌리기 어려운 요청 ${risky.length}건 전부 확인 요구`);

  const safe = ['테스트 돌려줘', '냉장고 카테고리 이미지 몇 개야', 'npm test 결과 보여줘', '설치환경 가이드 고쳐줘'];
  let f = 0;
  for (const t of safe) if (isRiskyPrompt(t)) { fail(`평범한 요청을 위험으로 봤다: "${t}"`); f++; }
  if (!f) pass(`평범한 요청 ${safe.length}건은 그대로 실행`);
}

// ── [4] 메시지 길이 — 넘으면 Telegram 이 통째로 거부한다 ──
{
  const LIMIT = 3800;
  const long = 'A'.repeat(10000);
  const parts = splitMessage(long, LIMIT);
  if (parts.some((p) => p.length > LIMIT)) fail('조각이 한도를 넘었다');
  else pass(`긴 한 줄도 ${LIMIT}자 이하로 쪼갠다 (${parts.length}조각)`);
  eq(parts.join(''), long, '줄바꿈 없는 본문은 손실 없이 복원된다');

  const lines = Array.from({ length: 500 }, (_, i) => `${i}번째 줄입니다`).join('\n');
  const lp = splitMessage(lines, LIMIT);
  if (lp.some((p) => p.length > LIMIT)) fail('줄바꿈 본문 조각이 한도를 넘었다');
  else pass('줄바꿈 본문도 한도 이하');
  eq(lp.join('\n'), lines, '줄바꿈 본문도 손실 없이 복원된다');

  eq(splitMessage('').length, 0, '빈 문자열은 보내지 않는다');
  eq(splitMessage('   \n  ').length, 0, '공백뿐인 응답은 보내지 않는다');
  eq(splitMessage('짧은 답').length, 1, '짧으면 한 통');

  // 무한 루프 방어 — 자를 자리를 못 찾아도 반드시 끝나야 한다.
  const t0 = Date.now();
  splitMessage(' '.repeat(50) + 'B'.repeat(20000), 100);
  if (Date.now() - t0 > 2000) fail('splitMessage 가 멈추지 않는다');
  else pass('자를 자리가 없어도 종료');
}

// ── [5] .env.local 파싱 ──
{
  const env = parseEnvFile([
    '# 주석',
    '',
    'TELEGRAM_BOT_TOKEN=123456:AA-Bb_Cc#dd',
    'export TELEGRAM_ALLOWED_CHAT_IDS=111,222',
    'QUOTED="값 #  안 잘림"',
    "SINGLE='작은따옴표'",
    'SPACED  =  뒤쪽값   # 꼬리 주석',
    '잘못된 줄',
  ].join('\n'));

  // 따옴표 없는 값의 꼬리 주석은 떼되, 토큰처럼 # 가 붙어 있으면 자르지 않는다
  // (공백 없는 # 는 값의 일부다 — 실제로 토큰에 들어갈 수 있다).
  eq(env.TELEGRAM_BOT_TOKEN, '123456:AA-Bb_Cc#dd', '토큰 안의 # 를 자르지 않는다');
  eq(env.TELEGRAM_ALLOWED_CHAT_IDS, '111,222', 'export 접두 처리');
  eq(env.QUOTED, '값 #  안 잘림', '큰따옴표 안은 그대로');
  eq(env.SINGLE, '작은따옴표', '작은따옴표 처리');
  eq(env.SPACED, '뒤쪽값', '공백 있는 꼬리 주석은 제거');
  eq(env['잘못된 줄'], undefined, '형식이 아닌 줄은 무시');
}

// ── [6] 토큰이 저장소에 올라갈 길 ──
{
  const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  if (!/^\.env\.local\s*$/m.test(gi)) fail('.gitignore 에 .env.local 이 없다 — public repo 라 토큰이 즉시 노출된다');
  else pass('.env.local 은 .gitignore 대상');

  const src = fs.readFileSync(path.join(__dirname, 'telegram-bot.mjs'), 'utf8');
  // @BotFather 토큰은 `숫자:영숫자35자` 꼴이다. 소스에 진짜 토큰이 박혀 있으면 잡는다.
  const hard = src.match(/\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/g);
  if (hard) fail(`소스에 토큰처럼 보이는 문자열이 있다: ${hard[0].slice(0, 12)}…`);
  else pass('소스에 하드코딩된 토큰 없음');

  const example = path.join(root, '.env.local.example');
  if (!fs.existsSync(example)) fail('.env.local.example 이 없다 — 설정할 항목을 알 수 없다');
  else {
    const ex = fs.readFileSync(example, 'utf8');
    for (const k of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_ALLOWED_CHAT_IDS']) {
      if (!ex.includes(k)) fail(`.env.local.example 에 ${k} 가 없다`);
    }
    if (/\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/.test(ex)) fail('.env.local.example 에 진짜 토큰이 들어 있다');
    else pass('.env.local.example 에 항목만 있고 실제 값 없음');
  }
}

/* ── [7] 세팅 중 오류 안내 ──
 * 토큰이 틀렸을 때 스택 트레이스가 뜨면 원인을 알 수 없다 — 세팅 단계에서 가장 자주 만나는 상황이다.
 */
{
  const t401 = explainTelegramError(401, 'Unauthorized');
  if (!t401.includes('TELEGRAM_BOT_TOKEN')) fail('401 안내가 무엇을 고쳐야 하는지 말하지 않는다');
  else pass('토큰이 틀리면 무엇을 고칠지 알려준다');

  if (!explainTelegramError(409, '').includes('이미')) fail('409(중복 실행) 안내가 없다');
  else pass('같은 봇 중복 실행 안내');

  // 프록시가 HTML 을 돌려주는 경우 — JSON.parse 가 터지던 자리다.
  const html = explainTelegramError(403, 'Host not in allowlist<html>...');
  if (/SyntaxError|JSON/.test(html)) fail('JSON 파싱 오류가 그대로 새어 나온다');
  if (!html.includes('403')) fail('알 수 없는 오류에 상태 코드가 안 보인다');
  else pass('JSON 이 아닌 응답도 사람 말로 안내');

  if (explainTelegramError(500, 'x'.repeat(5000)).length > 300) fail('오류 안내가 너무 길다');
  else pass('오류 안내는 잘라서 보여준다');
}

// ── 화면 문구 ──
{
  eq(formatToolLine('Bash', { command: 'npm test' }), 'Bash: npm test', '진행 표시 — Bash');
  eq(formatToolLine('Read', { file_path: path.join(root, 'package.json') }), 'Read: package.json', '진행 표시 — 경로는 저장소 기준 상대경로');
  eq(formatToolLine('Grep', { pattern: 'INSTALL_DB' }), 'Grep: INSTALL_DB', '진행 표시 — 검색어');
  eq(formatToolLine('TodoWrite', {}), 'TodoWrite', '진행 표시 — 인자 없으면 이름만');
  const cut = formatToolLine('Bash', { command: 'x'.repeat(200) });
  if (cut.length > 80) fail('진행 표시가 너무 길다');
  else pass('진행 표시는 잘라서 보낸다');

  eq(formatDuration(5000), '5초', '경과 시간 — 초');
  eq(formatDuration(125000), '2분 5초', '경과 시간 — 분');
}

// ── claude 실행파일 찾기 ──
// 윈도우에서 PATH 의 claude 는 claude.cmd 셸 스크립트라 spawn 이 ENOENT 로 죽는다.
// 봇이 메시지는 받는데 답을 못 하는 형태로 나타나 원인을 찾기 어렵다.
{
  /* 폴더 구분자는 `path.join` 으로 짓되(리눅스 CI 와 윈도우에서 양쪽이 같은 함수를 쓰므로
   * 문자열이 일치한다), **PATH 구분문자는 반드시 `;` 로 박는다.**
   * `path.delimiter` 를 쓰면 리눅스에서 `:` 가 되는데, 윈도우 경로는 드라이브 문자(`C:`)에
   * 콜론이 들어 있어 PATH 가 [C, \a, C, \b] 로 부서진다 — 검사가 조용히 무력해진다. */
  const SYS = path.join('C:', 'Windows', 'system32');
  const NPM = path.join('C:', 'Users', 'u', 'AppData', 'Roaming', 'npm');
  const EXE = path.join(NPM, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
  const winEnv = { PATH: [SYS, NPM].join(';') };
  const has = (set) => (p) => set.has(p);

  eq(resolveClaudeBin({ CLAUDE_BIN: '/opt/claude' }, 'linux', () => false), '/opt/claude',
    'CLAUDE_BIN 을 적었으면 그것을 쓴다');
  eq(resolveClaudeBin({}, 'linux', () => false), 'claude',
    '리눅스·맥은 PATH 의 claude 를 그대로 쓴다');

  // .cmd 만 있는 전형적인 윈도우 설치 — npm 전역 폴더의 실행파일까지 찾아 들어가야 한다
  eq(resolveClaudeBin(winEnv, 'win32', has(new Set([path.join(NPM, 'claude.cmd'), EXE]))), EXE,
    '윈도우 — .cmd 를 건너뛰고 네이티브 claude.exe 를 찾는다');

  // PATH 에 claude.exe 가 바로 있으면 그것이 우선
  eq(resolveClaudeBin(winEnv, 'win32', has(new Set([path.join(NPM, 'claude.exe'), EXE]))), path.join(NPM, 'claude.exe'),
    '윈도우 — PATH 의 claude.exe 가 있으면 그것을 먼저 쓴다');

  eq(resolveClaudeBin(winEnv, 'win32', () => false), 'claude',
    '못 찾으면 claude 로 두고 실패 안내에 맡긴다');

  // 못 찾았을 때 스택이 아니라 무엇을 고칠지 알려 준다
  const enoent = describeSpawnError({ code: 'ENOENT', message: 'spawn claude ENOENT' }, 'claude');
  if (!enoent.includes('CLAUDE_BIN')) fail('ENOENT 안내에 무엇을 고칠지(CLAUDE_BIN)가 없다');
  else pass('claude 를 못 찾으면 CLAUDE_BIN 을 알려 준다');
  if (!describeSpawnError({ code: 'EINVAL', message: 'x' }, 'c.cmd').includes('.exe'))
    fail('EINVAL 안내에 .cmd → .exe 지시가 없다');
  else pass('.cmd 를 가리켰을 때 .exe 로 바꾸라고 알려 준다');
}

console.log(ok ? '\n전부 통과' : '\n실패 있음');
process.exit(ok ? 0 : 1);
