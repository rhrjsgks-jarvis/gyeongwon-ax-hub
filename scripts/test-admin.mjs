// 사용현황 대시보드(app/admin/page.tsx)가 의존하는 lib/logEvent.ts 회귀 테스트
// 실행: node --experimental-strip-types scripts/test-admin.mjs
// 패턴: 다른 test-*.mjs와 동일하게 순수 함수를 직접 호출·검증한다. admin/page.tsx 자체는
// React 컴포넌트(인증 게이트 + useState)라 jsdom 스크립트 실행 패턴을 그대로 쓸 수 없으므로,
// 실제 버그가 발생하기 쉬운 로직(집계·CSV 내보내기)이 몰려 있는 lib/logEvent.ts를 대상으로 한다.

// ── 최소 브라우저 전역 스텁 (localStorage/sessionStorage/document/Blob/URL) ──
class MemoryStorage {
  #map = new Map();
  getItem(k) { return this.#map.has(k) ? this.#map.get(k) : null; }
  setItem(k, v) { this.#map.set(k, String(v)); }
  removeItem(k) { this.#map.delete(k); }
  clear() { this.#map.clear(); }
}
globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();

let lastBlob = null;
const fakeAnchor = { href: '', download: '', click() {} };
globalThis.document = { createElement: () => ({ ...fakeAnchor }) };
globalThis.URL.createObjectURL = (blob) => { lastBlob = blob; return 'blob:fake'; };

const {
  readLogs, logEvent, logOnce, aggregateByModule, aggregateByDay, aggregateByStore,
  aggregateStoreModules, UNSET_STORE,
  exportCsv, excludeHubViews, excludeTestStore, normalizeLogs, fetchTeamLogs, GAS_CONNECTED,
  aggregateFunnel, aggregateWeakPlans,
} = await import('../lib/logEvent.ts');
const LOG = { aggregateFunnel, aggregateWeakPlans };
const S = await import('../lib/stores.ts');

import fs from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

let ok = true;
const fail = (msg) => { console.log('ERROR:', msg); ok = false; };
const pass = (msg) => console.log('OK:', msg);
const KST = 9 * 60 * 60 * 1000;

// ── 1. readLogs: 빈 상태 / 손상된 JSON 폴백 ──
localStorage.clear();
if (readLogs().length !== 0) fail('readLogs: 초기 상태는 빈 배열이어야 함');
localStorage.setItem('axhub_logs', '{broken json');
if (!Array.isArray(readLogs()) || readLogs().length !== 0) fail('readLogs: 손상된 JSON은 빈 배열로 폴백해야 함');
console.log('OK: readLogs — 초기 빈 배열 + 손상된 JSON 폴백');

// ── 2. logEvent: 기록 + MAX_LOGS(2000) 캡 ──
localStorage.clear();
logEvent('finder', 'search', '세탁기 25kg');
const logs1 = readLogs();
if (logs1.length !== 1) fail(`logEvent: 1건 기록 후 길이 = ${logs1.length}, 기대값 1`);
if (logs1[0].module !== 'finder' || logs1[0].action !== 'search' || logs1[0].extra !== '세탁기 25kg') {
  fail('logEvent: 기록된 필드가 입력과 다름');
}
if (typeof logs1[0].uid !== 'string' || !logs1[0].uid) fail('logEvent: uid가 비어있음');
console.log('OK: logEvent — 필드 기록 확인');

localStorage.clear();
for (let i = 0; i < 2005; i++) logEvent('hub', 'page_view');
const cappedLogs = readLogs();
if (cappedLogs.length !== 2000) fail(`logEvent: MAX_LOGS 캡 미적용, 길이 = ${cappedLogs.length}, 기대값 2000`);
console.log('OK: logEvent — MAX_LOGS(2000) 캡 확인 (2005건 기록 → 2000건 유지)');

// ── 3. aggregateByModule ──
const modLogs = [
  { ts: 0, date: '2026-01-01', module: 'finder', action: 'search', uid: 'a' },
  { ts: 0, date: '2026-01-01', module: 'finder', action: 'search', uid: 'a' },
  { ts: 0, date: '2026-01-01', module: 'compare', action: 'generate', uid: 'a' },
];
const agg = aggregateByModule(modLogs);
if (agg.finder !== 2 || agg.compare !== 1) fail(`aggregateByModule: 결과 = ${JSON.stringify(agg)}, 기대값 {finder:2, compare:1}`);
if (Object.keys(agg).length !== 2) fail('aggregateByModule: 존재하지 않는 모듈 키가 섞여 있음');
console.log('OK: aggregateByModule — 모듈별 카운트 정확');

// ── 4. aggregateByDay: KST 기준 일자 버킷팅 + 빈 날짜 0채움 + days 윈도우 밖 제외 ──
const now = Date.now();
const todayKst = new Date(now + KST).toISOString().slice(0, 10);
const dayLogs = [
  { ts: now, date: todayKst, module: 'hub', action: 'page_view', uid: 'a' },
  { ts: now, date: todayKst, module: 'hub', action: 'page_view', uid: 'b' },
  { ts: now - 20 * 86_400_000, date: 'old', module: 'hub', action: 'page_view', uid: 'c' }, // 14일 윈도우 밖
];
const byDay = aggregateByDay(dayLogs, 14);
if (byDay.length !== 14) fail(`aggregateByDay: 반환 길이 = ${byDay.length}, 기대값 14`);
const todayBucket = byDay[byDay.length - 1];
if (todayBucket.date !== todayKst) fail(`aggregateByDay: 마지막 버킷 날짜 = ${todayBucket.date}, 기대값 ${todayKst}(오늘)`);
if (todayBucket.count !== 2) fail(`aggregateByDay: 오늘 카운트 = ${todayBucket.count}, 기대값 2`);
const totalCounted = byDay.reduce((s, d) => s + d.count, 0);
if (totalCounted !== 2) fail(`aggregateByDay: 14일 윈도우 밖 로그가 섞여 총합 = ${totalCounted}, 기대값 2`);
const emptyDays = byDay.filter((d) => d.count === 0);
if (emptyDays.length !== 13) fail(`aggregateByDay: 0건인 날짜 수 = ${emptyDays.length}, 기대값 13(0채움 확인)`);
console.log('OK: aggregateByDay — 14일 윈도우·오늘 버킷·0채움·윈도우 밖 제외 확인');

// ── 5. exportCsv: 헤더/행 구성 + extra 필드 이스케이프(콤마·따옴표) 회귀 ──
lastBlob = null;
exportCsv([
  { ts: 1700000000000, date: '2026-01-01', module: 'finder', action: 'search', uid: 'u1', extra: '냉장고 900mm' },
  { ts: 1700000001000, date: '2026-01-01', module: 'care', action: 'search', uid: 'u2', extra: '건조기, 20kg "특가"' },
]);
if (!lastBlob) fail('exportCsv: Blob이 생성되지 않음(URL.createObjectURL 호출 안 됨)');
const csvText = await lastBlob.text();
const lines = csvText.split('\n');
/* 지점 두 칸을 **뒤에** 붙였다(2026-08-20) — 앞을 건드리면 옛 CSV 를 읽던 것이 다 깨진다 */
if (lines[0] !== 'ts,date,module,action,uid,extra,store,storeName') fail(`exportCsv: 헤더 불일치 — "${lines[0]}"`);
if (!lines[1].includes('냉장고 900mm')) fail('exportCsv: 일반 텍스트 행이 누락됨');
// extra에 콤마·따옴표가 섞인 경우 CSV 컬럼이 깨지지 않아야 함(RFC4180: 콤마/따옴표/개행 포함 시
// 필드를 큰따옴표로 감싸고 내부 큰따옴표는 ""로 이스케이프) — 아주 단순한 CSV 파서로 왕복 검증.
const commaRow = lines[2] || '';
function parseCsvLine(line) {
  const fields = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { fields.push(cur); cur = ''; }
    else cur += c;
  }
  fields.push(cur);
  return fields;
}
const parsed = parseCsvLine(commaRow);
if (parsed.length !== 8) fail(`exportCsv 회귀: extra 필드의 콤마/따옴표 이스케이프가 깨져 컬럼 수 = ${parsed.length}, 기대값 8 — "${commaRow}"`);
else if (parsed[5] !== '건조기, 20kg "특가"') fail(`exportCsv 회귀: extra 필드 왕복 결과 = "${parsed[5]}", 기대값 '건조기, 20kg "특가"'`);
else console.log('OK: exportCsv — extra 필드 콤마·따옴표 포함 시에도 CSV 왕복 파싱 정상(RFC4180 이스케이프 확인)');

// ── 6. fetchTeamLogs: NEXT_PUBLIC_GAS_URL 미설정 시 안전하게 null(로컬 폴백 신호) ──
if (process.env.NEXT_PUBLIC_GAS_URL) {
  fail('테스트 환경에 NEXT_PUBLIC_GAS_URL이 설정돼 있음 — GAS_CONNECTED=false 전제가 깨짐(테스트 환경 오염 확인 필요)');
} else {
  if (GAS_CONNECTED !== false) fail(`GAS_CONNECTED = ${GAS_CONNECTED}, 기대값 false(env 미설정)`);
  const teamLogs = await fetchTeamLogs();
  if (teamLogs !== null) fail(`fetchTeamLogs(): GAS 미연동 상태인데 null이 아닌 값 반환 = ${JSON.stringify(teamLogs)}`);
  else console.log('OK: fetchTeamLogs — NEXT_PUBLIC_GAS_URL 미설정 시 fetch 시도 없이 null 반환(로컬 폴백 신호)');
}

// ── 7. excludeHubViews: 허브 메인 페이지뷰만 걸러내고 검색·건의는 남긴다 ──
{
  const sample = [
    { ts: 1, date: '2026-08-03', module: 'hub',     action: 'page_view', uid: 'a' },
    { ts: 2, date: '2026-08-03', module: 'hub',     action: 'search',    uid: 'a', extra: '냉장고' },
    { ts: 3, date: '2026-08-03', module: 'hub',     action: 'feedback',  uid: 'a', extra: '건의' },
    { ts: 4, date: '2026-08-03', module: 'finder',  action: 'page_view', uid: 'b' },
  ];
  const kept = excludeHubViews(sample);
  if (kept.length !== 3) fail(`excludeHubViews(): ${kept.length}건 남음, 기대값 3`);
  else if (kept.some((e) => e.module === 'hub' && e.action === 'page_view'))
    fail('excludeHubViews(): 허브 메인 페이지뷰가 걸러지지 않음');
  else if (!kept.some((e) => e.module === 'hub' && e.action === 'search'))
    fail('excludeHubViews(): 허브 통합검색까지 함께 지워짐 — 의도적 행동이라 남아야 한다');
  else if (aggregateByModule(kept).hub !== 2)
    fail(`excludeHubViews() 후 hub 집계 = ${aggregateByModule(kept).hub}, 기대값 2(검색·건의)`);
  else console.log('OK: excludeHubViews — 허브 메인 페이지뷰만 제외, 검색·건의는 유지');
}

// ── 8. 소스 회귀: 허브 메인이 다시 page_view를 남기거나 인증이 영구 저장되지 않는지 ──
{
  const hubSrc = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  if (/logEvent\(\s*'hub'\s*,\s*'page_view'\s*\)/.test(hubSrc))
    fail("app/page.tsx가 다시 logEvent('hub','page_view')를 호출함 — 허브 메인은 집계에서 제외 대상이다");
  else console.log('OK: 허브 메인화면이 페이지뷰 로그를 남기지 않음');

  const adminSrc = fs.readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
  if (/logEvent\(\s*'hub'\s*,\s*'page_view'\s*\)/.test(adminSrc))
    fail("app/admin/page.tsx가 자기 조회를 hub page_view로 기록함 — 집계가 부풀려진다");
  else console.log('OK: 관리자 대시보드 조회가 집계에 잡히지 않음');

  // 인증 상태를 localStorage에 영구 저장하면 한 번 통과한 기기가 계속 열려 있게 된다
  if (/localStorage\.setItem\(\s*ADMIN_SESSION_KEY/.test(adminSrc))
    fail('관리자 인증이 localStorage에 영구 저장됨 — 브라우저를 닫아도 잠기지 않는다');
  else if (!/sessionStorage\.setItem\(\s*ADMIN_SESSION_KEY/.test(adminSrc))
    fail('관리자 인증이 sessionStorage에 저장되지 않음 — 세션 종료 시 잠기지 않는다');
  else if (!/UNLOCK_TTL_MS/.test(adminSrc))
    fail('관리자 인증에 만료(TTL)가 없음');
  else console.log('OK: 관리자 인증 — sessionStorage + 만료(TTL) 적용, 영구 저장 없음');

  if (!/excludeHubViews\(/.test(adminSrc))
    fail('대시보드가 excludeHubViews를 적용하지 않음 — 허브 메인 조회수가 집계에 섞인다');
  else console.log('OK: 대시보드가 화면·CSV 모두 허브 메인 페이지뷰를 제외한 로그를 사용');

  // 명칭
  const navSrc = fs.readFileSync(new URL('../components/Navigation.tsx', import.meta.url), 'utf8');
  [['app/page.tsx', hubSrc], ['app/admin/page.tsx', adminSrc], ['components/Navigation.tsx', navSrc]]
    .forEach(([name, src]) => {
      if (!src.includes('사용현황 대시보드[관리자용]'))
        fail(`${name}에 "사용현황 대시보드[관리자용]" 명칭이 없음`);
    });
  if (ok) console.log('OK: "사용현황 대시보드[관리자용]" 명칭이 허브·사이드바·대시보드 3곳에 반영됨');
}

// ── 관리자 비밀번호 검증 (lib/adminAuth.ts) ──
/*
 * 2026-08-11 실제로 여기서 막혔다. 환경변수에 해시를 넣었는데 로그인이 안 됐고,
 * 화면에는 "비밀번호가 다릅니다" 한 줄만 떠서 오타인지 미적용인지 구분할 수가 없었다.
 * 붙여넣다 섞이는 것들(공백·따옴표·대문자)과 평문/해시 우선순위를 여기서 못 박는다.
 */
{
  const A = await import('../lib/adminAuth.ts');
  const PW = 'Admin1234!';
  const H = A.sha256(PW);

  if (H !== '5ce41ada64f1e8ffb0acfaafa622b141438f3a5777785e7f0b830fb73e40d3d6')
    fail(`sha256("${PW}") 가 바뀌었다 — ${H}`);

  const cases = [
    ['평문',                     { ADMIN_PW: PW },                       true],
    ['평문 + 앞뒤 공백',          { ADMIN_PW: '  ' + PW + '  ' },         true],
    ['평문 + 줄바꿈',             { ADMIN_PW: PW + '\n' },                true],
    ['평문 + 감싼 따옴표',        { ADMIN_PW: '"' + PW + '"' },           true],
    ['해시',                     { ADMIN_PW_HASH: H },                   true],
    ['해시 대문자',               { ADMIN_PW_HASH: H.toUpperCase() },     true],
    ['해시 + 줄바꿈',             { ADMIN_PW_HASH: H + '\n' },            true],
    ['둘 다 — 평문이 이긴다',      { ADMIN_PW: PW, ADMIN_PW_HASH: 'x'.repeat(64) }, true],
    ['해시 자리에 평문 (오설정)',  { ADMIN_PW_HASH: PW },                  false],
    ['틀린 비밀번호',             { ADMIN_PW: '다른비밀번호' },            false],
  ];
  let n = 0;
  for (const [label, env, want] of cases) {
    const got = A.verify(PW, env);
    if (got !== want) fail(`[비밀번호] ${label}: verify() = ${got} — ${want} 여야 한다`);
    else n++;
  }
  if (n === cases.length) console.log(`OK: 비밀번호 검증 ${n}가지 (평문·해시·공백·따옴표·대문자·우선순위)`);

  // 빈 비밀번호가 폴백 해시를 우연히 통과하면 안 된다
  if (A.verify('', {})) fail('[비밀번호] 빈 문자열이 통과한다');
  else console.log('OK: 빈 비밀번호는 거부');

  // 설정이 잘못됐을 때 서버가 무엇이 문제인지 말해 주는가 — 값 자체는 절대 싣지 않는다
  const wPlain = A.configWarning({ ADMIN_PW: PW });
  const wBad = A.configWarning({ ADMIN_PW_HASH: PW });
  const wNone = A.configWarning({});
  if (wPlain !== null) fail('[비밀번호] 평문이 제대로 설정됐는데 경고가 뜬다');
  else if (!wBad || !/64자가 아닙니다/.test(wBad)) fail('[비밀번호] 해시 자리에 평문을 넣었는데 경고가 없다');
  else if (!wNone || !/미설정/.test(wNone)) fail('[비밀번호] 둘 다 없는데 폴백 경고가 없다');
  else console.log('OK: 설정 오류를 경고로 알린다 (평문 오설정 · 미설정)');

  for (const [label, w] of [['오설정', wBad], ['미설정', wNone]]) {
    if (w && (w.includes(PW) || w.includes(H))) fail(`[비밀번호] ${label} 경고에 비밀번호/해시가 그대로 실린다`);
  }
  console.log('OK: 경고문에 비밀번호·해시를 싣지 않는다');

  // NEXT_PUBLIC_ 으로 새어 나가면 클라이언트 번들에 실려 검증이 통째로 무의미해진다
  const authSrc = fs.readFileSync(new URL('../lib/adminAuth.ts', import.meta.url), 'utf8')
    + fs.readFileSync(new URL('../app/api/admin-auth/route.ts', import.meta.url), 'utf8');
  if (/NEXT_PUBLIC_ADMIN/.test(authSrc)) fail('[비밀번호] NEXT_PUBLIC_ 접두사가 붙은 관리자 환경변수가 있다');
  else console.log('OK: 관리자 비밀번호 환경변수가 클라이언트로 새지 않음');
}

// ── 대시보드 모듈 목록 (app/admin/page.tsx 의 MODULE_META) ──
/*
 * 2026-08-11 발견: AS기간 확인·배치 시뮬레이터·컨시어지 포스터가 MODULE_META 에
 * 아예 없어 **사용 현황에 한 줄도 안 잡히고 있었다.** 운영 중인 모듈이 통계에서
 * 통째로 빠지면 "안 쓴다"로 읽힌다 — 모듈을 새로 만들 때마다 반복될 종류의 누락이라
 * `LogModule` 유니온과 대조해 막는다.
 */
{
  const adminSrc2 = fs.readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
  const logSrc = fs.readFileSync(new URL('../lib/logEvent.ts', import.meta.url), 'utf8');

  /* LogAction 선언 전까지만 자른다 — `\n\n` 로 끊으면 액션(search·generate…)까지 딸려 온다 */
  const uni = logSrc.match(/export type LogModule =([\s\S]*?)export type LogAction/);
  const keys = uni ? [...uni[1].matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1]) : [];
  const metaBlock = adminSrc2.match(/const MODULE_META[\s\S]*?\n\}/);
  const metaKeys = metaBlock ? [...metaBlock[0].matchAll(/\n\s{2}(\w+):\s*\{/g)].map((m) => m[1]) : [];

  /*
   * **사용 로그를 안 쌓는 모듈은 여기서 뺀다.**
   * `viral`(매장 바이럴)은 자료가 Apps Script 시트에 따로 있고 우리 로그에는 한 줄도
   * 안 쌓인다 — 관리자 대시보드에 **자기 절**이 따로 있어 모듈별 사용 현황 목록에
   * 낄 자리가 아니다. 그런데 `LogModule` 유니온에는 남겨 둔다(빼면 집계 코드가 타입
   * 에러를 낸다 — `planner`·`compareInstant` 와 같은 이유).
   *
   * **이 목록에 함부로 더하지 말 것** — 이 검사가 막는 사고는 *"모듈을 만들고
   * MODULE_META 에 안 넣어 통계에 한 줄도 안 잡히는데 화면에는 아무 표시도 안 나는"*
   * 것이다(실제로 AS·배치·포스터 셋이 그 상태로 방치돼 있었다). **로그를 쌓는
   * 모듈이면 반드시 MODULE_META 에 넣어야 한다.**
   */
  const NO_LOG = ['viral'];
  if (!keys.length || !metaKeys.length) fail('[대시보드] LogModule / MODULE_META 를 읽지 못했다');
  else {
    const missing = keys.filter((k) => !metaKeys.includes(k) && !NO_LOG.includes(k));
    if (missing.length) fail(`[대시보드] MODULE_META 에 없는 모듈: ${missing.join(', ')} — 사용 현황에 안 잡힌다`);
    else console.log(`OK: 대시보드가 LogModule ${keys.length - NO_LOG.length}개를 모두 표시 (누락 0 · 로그 없는 ${NO_LOG.join(',')} 제외)`);
  }
  /* **로그를 안 쌓는다는 것이 사실인지 확인한다** — `logEvent('viral', …)` 를 어딘가
     쓰기 시작하면 위 예외가 조용히 통계를 삼킨다. 그때는 MODULE_META 에 넣어야 한다. */
  /* **한 파일만 보면 못 잡는다** — 로그는 어느 화면에서든 남길 수 있으므로 app·components·lib
     전부를 훑는다(이 저장소가 "한쪽만 고쳐 어긋난다"로 반복해서 데인 종류다). */
  const srcFiles = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      if (e.isDirectory()) walk(dir + e.name + '/');
      else if (/\.(tsx|ts|mjs)$/.test(e.name)) srcFiles.push(dir + e.name);
    }
  };
  ['../app/', '../components/', '../lib/'].forEach(walk);
  const allSrc = srcFiles.map((f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
  for (const k of NO_LOG) {
    const used = allSrc.includes(`logEvent('${k}'`) || allSrc.includes(`logKey="${k}"`)
      || allSrc.includes(`logKey: '${k}'`) || allSrc.includes(`'${k}', '`);
    if (used) fail(`[대시보드] '${k}' 가 로그를 쌓는데 MODULE_META 에 없다 — 통계에서 사라진다`);
    else console.log(`OK: '${k}' 은 실제로 로그를 안 쌓는다 (소스 ${srcFiles.length}개 확인)`);
  }

  // 운영 종료·통합 모듈은 목록에서 감추되 라벨은 남는다
  for (const k of ['compareInstant', 'planner']) {
    const re = new RegExp(`${k}:\\s*\\{[^}]*retired:\\s*true`);
    if (!re.test(adminSrc2)) fail(`[대시보드] ${k} 에 retired 표시가 없다 — 목록에서 감춰야 한다`);
  }
  if (!/LIVE_MODULES\s*=\s*Object\.entries\(MODULE_META\)\.filter/.test(adminSrc2))
    fail('[대시보드] LIVE_MODULES 로 걸러 내지 않는다');
  else if (!/\{LIVE_MODULES\.map\(/.test(adminSrc2))
    fail('[대시보드] 사용 현황 목록이 LIVE_MODULES 를 쓰지 않는다');
  else console.log('OK: 운영 종료·통합 모듈 2개는 목록에서 제외 (라벨은 최근 이벤트·CSV 용으로 유지)');

  // 감춘 만큼 총계와 어긋나 보이므로 화면이 그 사실을 밝혀야 한다
  if (!/목록에서 제외했습니다/.test(adminSrc2))
    fail('[대시보드] 감춘 모듈이 있다는 안내가 없다 — 목록 합계와 총계가 어긋나 보인다');
  /* 가려 달라고 한 이름을 각주로 되살리면 뜻이 없다 — 건수만 밝힌다 */
  else if (/제외했습니다[\s\S]{0,200}?(즉시비교|패키지 플래너)/.test(adminSrc2))
    fail('[대시보드] 안내문이 감춘 모듈 이름을 다시 노출한다');
  else console.log('OK: 감춘 모듈의 로그 건수만 밝히고 이름은 노출하지 않는다');

  // 추적 모듈 수는 운영 중인 것만 센다
  if (!/value=\{LIVE_MODULES\.length\}/.test(adminSrc2))
    fail('[대시보드] "추적 모듈 수"가 운영 종료 모듈까지 센다');
  else console.log('OK: "추적 모듈 수"는 운영 중인 모듈만 집계');
}

/*
 * ── 9. normalizeLogs: **시트가 실제로 보내는 모양**으로 검사한다 ──
 *
 * 이 스위트의 다른 검사는 `date: 'YYYY-MM-DD'` 처럼 잘 만들어진 데이터를 쓴다. 그래서
 * **테스트는 통과하는데 프로덕션은 틀려 있었다** — 2026-08-11 실데이터를 열어 보니
 *   ① 시트 헤더 행이 이벤트로 섞여 오고(module:'module')
 *   ② date 가 'Wed Jul 29 2026 00:00:00 GMT+0900 (Korean Standard Time)' 였다.
 * ②는 aggregateByDay 의 조회 키('YYYY-MM-DD')와 어긋나 **일별 추이가 전부 0** 이었다.
 * 그래서 여기서는 이상적인 값이 아니라 **그때 받은 원문 그대로**를 넣는다.
 */
{
  const { normalizeLogs } = await import('../lib/logEvent.ts');
  const raw = [
    // 시트 1행(헤더)이 그대로 실려 온다 — ts 가 숫자가 아니다
    { ts: null, date: 'date', module: 'module', action: 'action', uid: 'uid', extra: 'extra' },
    { ts: 1785321007809, date: 'Wed Jul 29 2026 00:00:00 GMT+0900 (Korean Standard Time)',
      module: 'hub', action: 'page_view', uid: 'ycv47niq' },
    { ts: 1785321216210, date: 'Wed Jul 29 2026 00:00:00 GMT+0900 (Korean Standard Time)',
      module: 'finder', action: 'search', uid: 'bn5idr0h', extra: '무풍' },
    { ts: '', date: '', module: '', action: '', uid: '' },            // 빈 행
  ];
  const norm = normalizeLogs(raw);

  // 4행 중 헤더 1 + 빈 행 1 을 걸러 2건이 남아야 한다
  if (norm.length !== 2) fail(`normalizeLogs: 2건이어야 하는데 ${norm.length}건 (헤더·빈 행이 안 걸러졌다)`);
  else console.log('OK: normalizeLogs — 시트 헤더 행과 빈 행을 걸러낸다 (4행 → 2건)');

  if (norm.some((e) => e.module === 'module'))
    fail('normalizeLogs: 헤더 행이 module="module" 이벤트로 남았다');
  else console.log('OK: normalizeLogs — module="module" 가짜 이벤트 없음');

  const bad = norm.filter((e) => !/^\d{4}-\d{2}-\d{2}$/.test(e.date));
  if (bad.length) fail(`normalizeLogs: date 가 YYYY-MM-DD 가 아니다 — ${bad[0].date}`);
  else console.log('OK: normalizeLogs — date 를 ts 에서 YYYY-MM-DD 로 다시 만든다');

  // 정규화한 로그가 실제로 일별 집계에 잡혀야 한다 (이것이 원래 깨져 있던 것)
  const day = aggregateByDay(norm, 3650).find((d) => d.date === norm[0].date);
  if (!day || day.count !== 2)
    fail(`normalizeLogs: 정규화 후에도 일별 집계에 안 잡힌다 (${norm[0].date} → ${day ? day.count : '없음'}건, 기대 2건)`);
  else console.log(`OK: normalizeLogs — 일별 추이에 잡힌다 (${norm[0].date} 2건)`);

  // 정규화 전 원본을 그대로 넣으면 0건이어야 한다 — 이 검사가 버그의 존재를 증명한다
  const before = aggregateByDay(raw.filter((r) => Number(r.ts) > 0), 3650)
    .reduce((s, d) => s + d.count, 0);
  if (before !== 0)
    console.log(`OK: (참고) 정규화 전에도 ${before}건 잡힘`);
  else console.log('OK: 정규화 전에는 일별 집계 0건 — 이 버그가 실재했음을 확인');

  if (norm[1].extra !== '무풍') fail('normalizeLogs: extra 가 보존되지 않았다');
  else console.log('OK: normalizeLogs — extra 보존');
}

/*
 * ── 10. 전송 대기함(outbox) — 배치·재시도·중복방지 ──
 *
 * 매장 500곳으로 늘리기 전에 넣은 장치다. 예전에는 이벤트 1건이 Apps Script 실행 1회였고
 * `mode:'no-cors'` 라 실패를 알 수도 없었다(하루 실행시간 90분 한도를 넘길 계산이었다).
 *
 * GAS_CONNECTED 를 켠 상태가 필요하므로 env 를 세우고 **모듈을 다시 불러온다**
 * (위쪽 검사들은 미연동 상태를 전제하므로 그대로 둔다).
 */
{
  process.env.NEXT_PUBLIC_GAS_URL = 'https://script.example.invalid/exec';
  const calls = [];
  let reply = { ok: true };
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, keepalive: !!init.keepalive });
    return { ok: reply.ok !== false, json: async () => reply };
  };
  globalThis.window = { addEventListener() {} };
  globalThis.document.addEventListener = () => {};
  localStorage.clear();

  const L = await import('../lib/logEvent.ts?withgas');
  if (!L.GAS_CONNECTED) fail('outbox: 재로드 후에도 GAS_CONNECTED=false (env 주입 실패)');

  // ① 모았다 보낸다 — 5건을 넣어도 아직 전송되지 않는다
  for (let i = 0; i < 5; i++) L.logEvent('finder', 'page_view');
  if (calls.length !== 0) fail(`outbox: 5건에서 이미 ${calls.length}회 전송 (모으지 않는다)`);
  else console.log('OK: outbox — 이벤트마다 곧장 보내지 않고 모은다');

  await L.flushLogs();
  if (calls.length !== 1) fail(`outbox: flush 후 전송 ${calls.length}회 (1회여야 한다)`);
  else if (calls[0].body.events.length !== 5) fail(`outbox: 한 번에 5건이어야 하는데 ${calls[0].body.events.length}건`);
  else console.log(`OK: outbox — 5건을 요청 1회로 보낸다 (GAS 실행 1/5)`);

  if (!/\/api\/logs$/.test(String(calls[0].url)))
    fail(`outbox: 서버 라우트가 아니라 ${calls[0].url} 로 보냈다 — 성공 여부를 못 읽는다`);
  else console.log('OK: outbox — /api/logs 를 거쳐 성공 여부를 확인한다');

  // ② 성공하면 대기함이 빈다
  if (await L.flushLogs() !== false || calls.length !== 1)
    fail('outbox: 성공한 배치가 대기함에서 지워지지 않았다');
  else console.log('OK: outbox — 보낸 것은 대기함에서 지운다');

  // ③ 실패하면 남고, 재시도 때 **같은 batchId** 로 다시 간다
  calls.length = 0; reply = { ok: false };
  for (let i = 0; i < 3; i++) L.logEvent('care', 'page_view');
  await L.flushLogs();
  const first = calls.length;
  await L.flushLogs();
  if (calls.length !== first + 1) fail('outbox: 실패한 배치를 다시 보내지 않았다');
  else if (calls[0].body.batchId !== calls[1].body.batchId)
    fail(`outbox: 재시도 batchId 가 다르다 (${calls[0].body.batchId} → ${calls[1].body.batchId}) — 중복이 쌓인다`);
  else console.log(`OK: outbox — 실패분을 같은 batchId 로 재전송 (중복 방지, id=${calls[0].body.batchId})`);

  // ④ 다시 성공시키면 비워진다
  reply = { ok: true };
  await L.flushLogs();
  calls.length = 0;
  await L.flushLogs();
  if (calls.length !== 0) fail('outbox: 성공 후에도 남아서 계속 보낸다');
  else console.log('OK: outbox — 재전송 성공 후 대기함이 비워진다');

  // ⑤ 한 배치 상한을 채우면 기다리지 않고 바로 보낸다
  calls.length = 0;
  for (let i = 0; i < 20; i++) L.logEvent('place', 'page_view');
  await new Promise((r) => setImmediate(r));
  if (!calls.length) fail('outbox: 20건이 쌓여도 바로 보내지 않는다 (타이머만 기다리면 상담이 끝난 뒤 나간다)');
  else console.log(`OK: outbox — 한 배치(20건)가 차면 즉시 전송`);
}

/*
 * ── 개발중인 서비스 잠금 (scope: dev) ──────────────────────────────
 *
 * 사이드바 최하단의 「개발중인 서비스」는 관리자와 **같은 장치**로 잠근다.
 * 비밀번호를 하나 더 만들지 않는 것이 요점이라 — DEV_PW 가 있으면 그것을,
 * **없으면 관리자 비번을 그대로** 쓴다. 이 폴백이 조용히 깨지면 매장에서 아무도
 * 못 들어가거나(비번이 갈려서) 반대로 그냥 열린다.
 */
{
  const A = await import('../lib/adminAuth.ts');
  const cases = [
    ['DEV_PW 가 따로 있으면 그것을 쓴다', { DEV_PW: 'devpw', ADMIN_PW: 'adminpw' }, 'devpw', true],
    ['그때 관리자 비번으로는 못 연다',      { DEV_PW: 'devpw', ADMIN_PW: 'adminpw' }, 'adminpw', false],
    ['DEV_PW 가 없으면 관리자 비번을 쓴다', { ADMIN_PW: 'adminpw' }, 'adminpw', true],
    ['DEV_PW_HASH 도 쓸 수 있다',          { DEV_PW_HASH: A.sha256('hashed'), ADMIN_PW: 'adminpw' }, 'hashed', true],
  ];
  let bad = 0;
  for (const [label, env, pw, want] of cases) {
    if (A.verify(pw, env, 'dev') !== want) { fail(`[개발중 잠금] ${label}`); bad++; }
  }
  /* 관리자 쪽이 DEV_PW 에 영향받으면 안 된다 — 대시보드가 조용히 열리는 종류의 사고다 */
  if (A.verify('devpw', { DEV_PW: 'devpw', ADMIN_PW: 'adminpw' })) { fail('[개발중 잠금] DEV_PW 로 관리자까지 열린다'); bad++; }
  if (!bad) console.log('OK: 개발중 잠금 — DEV_PW 우선, 없으면 관리자 비번 폴백, 관리자는 영향 없음');
}

/* ── 지점 · 중복 방지 (2026-08-20 사장님 요청) ──────────────────
 * 점별 사용 로그를 취합하려면 두 가지가 지켜져야 한다:
 *  ① 고른 지점이 **모든 이벤트에** 실린다
 *  ② 같은 것을 여러 번 눌러도 **한 번만** 쌓인다(AI구독 케어처럼 조회가 잦은 곳)
 */
{
  let bad = 0;

  /* ① 지점 목록 — 점코드로도 지점명으로도 찾아진다 */
  if (S.STORE_LIST.length < 50) { fail(`[지점] 매장이 ${S.STORE_LIST.length}곳뿐이다`); bad++; }
  const dupe = S.STORE_LIST.length - new Set(S.STORE_LIST.map((x) => x.code)).size;
  if (dupe) { fail(`[지점] 점코드가 ${dupe}건 겹친다`); bad++; }
  /* **정확히 일치할 때만 통과한다** — 점코드·점명이 곧 통행증이다(2026-08-20 사장님 결정) */
  if (S.matchStore('ZN01')?.code !== 'ZN01') { fail('[지점] 점코드로 못 들어간다'); bad++; }
  if (S.matchStore('zn01')?.code !== 'ZN01') { fail('[지점] 점코드 대소문자'); bad++; }
  /* 상담사는 띄어 쓰기도 하고 붙여 쓰기도 한다 */
  if (S.matchStore('스타필드수원')?.code !== 'ZN01') { fail('[지점] 띄어쓰기 없는 이름'); bad++; }
  if (S.matchStore('스타필드 수원')?.code !== 'ZN01') { fail('[지점] 띄어 쓴 이름'); bad++; }
  /* **부분 일치로는 못 들어간다** — 한 글자로 뚫리면 통행증이 아니다 */
  /* '수원'·'분당'은 **실제 점명**이라 통과가 맞다 — 여기 넣으면 검사가 거짓으로 문다 */
  for (const q of ['수', '분', 'Z', 'ZN', '스타필드', '수원점']) {
    if (S.matchStore(q)) { fail('[지점] 부분 입력 "' + q + '" 으로 들어가진다'); bad++; }
  }
  if (S.matchStore('없는점')) { fail('[지점] 없는 이름으로 들어가진다'); bad++; }
  if (S.matchStore('')) { fail('[지점] 빈 입력으로 들어가진다'); bad++; }

  /* ② 고른 지점이 로그에 실린다 */
  localStorage.clear(); sessionStorage.clear();
  S.setStoreCode('ZN01');
  logEvent('finder', 'page_view');
  const ev = readLogs().at(-1);
  if (ev.store !== 'ZN01') { fail(`[지점] 로그에 점코드가 안 실린다 (${ev.store})`); bad++; }
  if (!ev.storeName) { fail('[지점] 로그에 지점명이 안 실린다'); bad++; }

  /* ③ 같은 것은 세션당 한 번 — 다른 대상은 따로 센다 */
  const n0 = readLogs().length;
  logOnce('care', 'result_open', '에어컨');
  logOnce('care', 'result_open', '에어컨');
  logOnce('care', 'result_open', '에어컨');
  logOnce('care', 'result_open', '냉장고');
  const added = readLogs().length - n0;
  if (added !== 2) { fail(`[중복방지] 3+1번 눌렀는데 ${added}건 쌓였다 (기대 2)`); bad++; }

  /* ④ 점별 집계 — 지점을 안 고른 옛 로그는 '(미지정)'으로 따로 센다 */
  const mixed = [
    { ts: 1, date: 'x', module: 'finder', action: 'page_view', uid: 'a', store: 'ZN01', storeName: '스타필드 수원' },
    { ts: 2, date: 'x', module: 'as', action: 'page_view', uid: 'b', store: 'ZN01', storeName: '스타필드 수원' },
    { ts: 3, date: 'x', module: 'as', action: 'page_view', uid: 'c' },
  ];
  const byStore = aggregateByStore(mixed);
  const zn = byStore.find((x) => x.code === 'ZN01');
  const un = byStore.find((x) => x.code === '(미지정)');
  if (!zn || zn.count !== 2) { fail('[점별집계] 같은 지점을 합치지 못한다'); bad++; }
  if (!un || un.count !== 1) { fail('[점별집계] 지점 없는 로그를 따로 세지 못한다'); bad++; }
  if (zn && byStore[0].code !== 'ZN01') { fail('[점별집계] 많이 쓴 지점이 위로 오지 않는다'); bad++; }

  /*
   * ④-b **지점을 펼치면 무엇을 많이 썼는지**(2026-08-22 사장님 요청).
   *
   * 가장 중요한 것은 **펼친 합 == 접힌 숫자**다. 두 집계가 지점을 다르게 가리면
   * 화면이 서로 다른 말을 한다 — 이 저장소가 허브 카드 개수·앱 버전·비교표 값에서
   * 반복해서 데인 종류라 여기서 못 박는다.
   */
  const znMods = aggregateStoreModules(mixed, 'ZN01');
  if (znMods.length !== 2) { fail(`[점별상세] ZN01 모듈 ${znMods.length}종 (기대 2)`); bad++; }
  const znSum = znMods.reduce((a, r) => a + r.count, 0);
  if (znSum !== zn.count) { fail(`[점별상세] 펼친 합 ${znSum} != 접힌 숫자 ${zn.count}`); bad++; }

  /* '(미지정)' 도 같은 규칙으로 가려야 한다 — 상수를 공유하는 이유다 */
  const unMods = aggregateStoreModules(mixed, UNSET_STORE);
  if (unMods.reduce((a, r) => a + r.count, 0) !== un.count) {
    fail('[점별상세] 미지정 지점의 펼친 합이 접힌 숫자와 다르다'); bad++;
  }

  /* 전점 통합(null) — 모든 지점을 합친 것이라 전체 건수와 같아야 한다 */
  const allMods = aggregateStoreModules(mixed, null);
  const allSum = allMods.reduce((a, r) => a + r.count, 0);
  if (allSum !== mixed.length) { fail(`[전점통합] 합 ${allSum} != 전체 ${mixed.length}`); bad++; }
  if (allMods[0].module !== 'as' || allMods[0].count !== 2) {
    fail('[전점통합] 많이 쓴 모듈이 위로 오지 않는다'); bad++;
  }

  /* 지점별 합을 다 더하면 전체가 된다 — 어느 지점도 새거나 겹치지 않는다 */
  const perStore = byStore.reduce((a, st) => a + aggregateStoreModules(mixed, st.code)
    .reduce((x, r) => x + r.count, 0), 0);
  if (perStore !== mixed.length) { fail(`[점별상세] 지점별 합 ${perStore} != 전체 ${mixed.length}`); bad++; }

  /* 없는 지점은 빈 목록 — 0 을 만들어 내지 않는다 */
  if (aggregateStoreModules(mixed, 'NOPE').length !== 0) { fail('[점별상세] 없는 지점에 값이 나온다'); bad++; }

  /* ⑤ 시트에서 온 옛 줄에 지점 칸이 없어도 깨지지 않는다 */
  const norm = normalizeLogs([{ ts: 1700000000000, module: 'finder', action: 'page_view', uid: 'x' }]);
  if (norm.length !== 1 || norm[0].store) { fail('[정규화] 지점 없는 옛 줄 처리'); bad++; }

  /* ⑥ CSV 에도 지점이 나간다 — 화면과 내보내기가 어긋나면 안 된다 */
  exportCsv(mixed);
  const head = (lastBlob && lastBlob.__text) || '';
  if (!bad) console.log('OK: 지점 — 목록·검색·로그 적재·점별 집계·펼침 상세·전점 통합·중복 방지·옛 줄 호환');
}

/* ── Apps Script — 쓰는 칸과 읽는 칸이 맞는가 ──────────────────
 * 2026-08-20 실제로 어긋났다: 지점 두 칸을 doPost 에만 더하고 doGet 을 빠뜨려,
 * **시트에는 쌓이는데 대시보드는 계속 비어 보였다.** 배포가 저장소 밖(구글)이라
 * 눈으로만 확인하면 또 놓친다 — 소스에서 세어 둔다.
 */
{
  let bad = 0;
  const gs = fs.readFileSync('docs/apps-script/Code.gs', 'utf8');

  const hm = gs.match(/const HEADER = \[([^\]]*)\]/);
  const header = hm ? hm[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')) : [];
  if (!header.includes('store') || !header.includes('storeName')) {
    fail('[AppsScript] HEADER 에 지점 칸이 없다'); bad++;
  }

  /* doPost 가 HEADER 만큼 값을 쓰는가 — 모자라면 뒤 칸이 통째로 빈다 */
  const post = gs.match(/return \[ev\.ts[\s\S]*?\];/);
  const written = post ? (post[0].match(/ev\.[a-zA-Z]+|now/g) || []).length : 0;
  if (written !== header.length) {
    fail('[AppsScript] doPost 가 ' + written + '칸을 쓰는데 HEADER 는 ' + header.length + '칸이다'); bad++;
  }

  /* doGet 이 그 칸을 돌려주는가 — 여기가 빠지면 대시보드가 비어 보인다 */
  const get = gs.match(/logs\.push\(\{[\s\S]*?\}\);/);
  const read = get ? get[0] : '';
  for (const f of ['store', 'storeName']) {
    if (!new RegExp(f + ':').test(read)) { fail('[AppsScript] doGet 이 ' + f + ' 를 안 돌려준다'); bad++; }
  }
  /* 자리까지 맞는가 — receivedAt(row[6]) 뒤가 store(7)·storeName(8) 이다 */
  if (!/store: row\[7\]/.test(read) || !/storeName: row\[8\]/.test(read)) {
    fail('[AppsScript] doGet 의 지점 열 번호가 HEADER 순서와 다르다'); bad++;
  }
  if (!bad) console.log('OK: Apps Script — HEADER ' + header.length + '칸, doPost·doGet 이 같은 칸을 본다');
}

/* ── 본사(경원영업팀 · Z000)는 로그를 남기지 않는다 (2026-08-20 사장님 요청) ──
 * 본사가 화면을 볼 때 그 조작이 매장 통계에 섞이면 **집계가 오염된다.**
 * 실제 매장 사용량과 본사 클릭을 구분할 방법이 없어지므로, 아예 안 쌓는 쪽이 맞다.
 *
 * **이름은 2026-08-31 에 '테스트점' → '경원영업팀' 으로 바뀌었다**(사장님 지시).
 * 하는 일은 그대로다 — 그래서 상수 이름(TEST_STORE_CODE)도 그대로 둔다.
 * 이 검사가 **이름을 붙들고 있다** — 화면 문구를 바꾸면 여기가 먼저 깨진다.
 */
{
  let bad = 0;
  localStorage.clear(); sessionStorage.clear();
  S.setStoreCode(S.TEST_STORE_CODE);
  const before = readLogs().length;
  logEvent('finder', 'page_view');
  logEvent('as', 'result_open', '냉장고');
  logOnce('care', 'result_open', '에어컨');
  if (readLogs().length !== before) { fail('[테스트점] 로그가 쌓였다 — 점검 조작이 통계를 오염시킨다'); bad++; }

  /* 지점을 되돌리면 다시 쌓여야 한다 — 영영 꺼져 있으면 그게 더 나쁘다 */
  S.setStoreCode('ZN01');
  logEvent('finder', 'page_view');
  if (readLogs().length !== before + 1) { fail('[테스트점] 다른 지점으로 바꿔도 로그가 안 쌓인다'); bad++; }

  if (!S.STORE_LIST.some((x) => x.code === S.TEST_STORE_CODE)) {
    fail('[테스트점] 목록에 테스트점이 없다 — 고를 수가 없다'); bad++;
  }
  if (!S.isTestStore(S.TEST_STORE_CODE) || S.isTestStore('ZN01')) {
    fail('[테스트점] isTestStore 판정이 틀렸다'); bad++;
  }
  /*
   * **목록에는 안 내밀고, 쳐서 찾으면 나온다**(2026-08-20 사장님 지시).
   * 상담사가 무심코 고르면 그 매장 사용량이 통째로 사라지므로 아는 사람만 쓰게 한다.
   */
  /* 관리자는 코드나 이름을 **정확히** 쳐서 들어간다 — 목록에 내밀지 않으므로 아는 사람만 쓴다 */
  if (S.matchStore('Z000')?.code !== S.TEST_STORE_CODE) {
    fail('[테스트점] 점코드로 못 들어간다 — 관리자가 쓸 수 없다'); bad++;
  }
  /* **본사는 점코드로만 들어온다**(2026-08-31 사장님 지시). 이름으로도 열어 두면
     상담사가 매장명 대신 팀 이름을 쳐서 들어올 수 있고, 그러면 그 사람의 사용이
     통째로 안 쌓인다 — 조용히 사라지는 종류라 막는다. */
  if (S.matchStore('경원영업팀') !== null) {
    fail('[본사] 이름(경원영업팀)으로 들어와진다 — 점코드로만 열려야 한다'); bad++;
  }
  if (S.matchStore('테스트점') !== null) {
    fail('[본사] 옛 이름 「테스트점」이 아직 통한다'); bad++;
  }
  /* 열쇠를 좁힌 것이지 **이름을 없앤 것이 아니다** — 머리의 노란 칩이 이 값을 쓴다 */
  if (S.storeName(S.TEST_STORE_CODE) !== '경원영업팀') {
    fail('[본사] 화면 이름이 「경원영업팀」이 아니다 = ' + S.storeName(S.TEST_STORE_CODE)); bad++;
  }
  /* **매장은 여전히 이름으로도 들어와야 한다** — 본사만 좁혔는지 반대쪽도 본다.
     한쪽만 검사하면 전부 막아 놓고도 통과한다. */
  if (S.matchStore('스타필드수원')?.code !== 'ZN01') {
    fail('[본사] 매장 이름 접속까지 막혔다 — 본사만 좁혔어야 한다'); bad++;
  }
  if (S.matchStore('스타필드 수원')?.code !== 'ZN01') {
    fail('[본사] 매장 이름의 띄어쓰기 무시가 깨졌다'); bad++;
  }

  /* ── 시트에 남은 Z000 줄은 집계에서 뺀다 (2026-08-31 사장님 요청) ──
   * 앱은 애초에 안 쌓지만, 장치가 서기 전(8/20)이나 스크립트로 직접 넣은 잔재가
   * 시트에 남는다 — 실제로 uid=gs-check 한 줄이 그랬다. 읽는 자리에서 거른다. */
  {
    const rows = [
      { ts: 1, date: '2026-08-20', module: 'hub', action: 'tab_switch', uid: 'gs-check', store: 'Z000', storeName: '경원영업팀' },
      { ts: 2, date: '2026-08-20', module: 'finder', action: 'page_view', uid: 'u1', store: 'ZN01', storeName: '스타필드수원' },
      { ts: 3, date: '2026-08-20', module: 'as', action: 'page_view', uid: 'u2' },   /* 옛 줄 — store 없음 */
    ];
    const kept = excludeTestStore(rows);
    if (kept.length !== 2) { fail('[본사] Z000 줄이 집계에서 안 빠진다 = ' + kept.length + '건'); bad++; }
    if (kept.some((e) => e.store === 'Z000')) { fail('[본사] Z000 줄이 남았다'); bad++; }
    /* **지점을 고르기 전 옛 줄까지 지우면 안 된다** — 그건 '(미지정)' 으로 세어야 한다 */
    if (!kept.some((e) => !e.store)) { fail('[본사] store 가 빈 옛 줄까지 지웠다 — (미지정)이 사라진다'); bad++; }
  }

  if (!bad) console.log('OK: 본사(경원영업팀 · Z000) — 로그를 안 쌓고, 시트에 남은 줄도 집계에서 뺀다');
}

// ── 상담이 어디까지 갔는가 · 인식이 나빴던 도면 (2026-08-29) ─────────────────
/*
 * 프로덕션 32일치를 열어 보니 배치 시뮬레이터가 `page_view` 하나만 남기고 있었다 —
 * 500명이 쓰는데 **어디서 막히는지 알 길이 없어** 개선이 전부 추측이 됐다.
 * 이제 단계를 남기므로 그것을 세는 집계를 검사한다.
 *
 * **세션 수로 세는지**가 핵심이다. 건수로 세면 "무엇이 되는가"가 아니라
 * "누가 많이 눌렀는가"가 된다 — 이 저장소가 로그 전반에서 지키는 규칙이다.
 */
{
  const ev = (uid, action, extra) => ({ ts: Date.now(), date: '2026-08-29', module: 'place', uid, action, extra });
  const logs = [
    ev('a', 'page_view'), ev('a', 'step', '도면'), ev('a', 'step', '축척'), ev('a', 'step', '배치'),
    ev('b', 'page_view'), ev('b', 'step', '도면'), ev('b', 'step', '도면'),   // 같은 세션이 두 번 — 한 번으로 세야 한다
    ev('c', 'page_view'),
    ev('d', 'page_view'), ev('d', 'step', '도면'), ev('d', 'step', '축척'),
      ev('d', 'step', '배치'), ev('d', 'step', '3D'), ev('d', 'step', '저장'),
    { ts: Date.now(), date: '2026-08-29', module: 'hub', uid: 'z', action: 'step', extra: '도면' },  // 다른 모듈은 안 센다
  ];
  const f = LOG.aggregateFunnel(logs);
  const get = (n) => f.steps.find((s) => s.name === n);
  if (f.opened !== 4) fail(`퍼널: 연 세션이 ${f.opened} (기대 4)`);
  else if (get('도면').n !== 3) fail(`퍼널: 도면 ${get('도면').n} (기대 3 — 같은 세션의 중복은 한 번)`);
  else if (get('축척').n !== 2) fail(`퍼널: 축척 ${get('축척').n} (기대 2)`);
  else if (get('저장').n !== 1) fail(`퍼널: 저장 ${get('저장').n} (기대 1)`);
  else if (get('도면').pct !== 75) fail(`퍼널: 도면 비율 ${get('도면').pct}% (기대 75)`);
  else pass(`상담 퍼널 — 연 세션 4 → 도면 3(75%) → 축척 2 → 배치 2 → 3D 1 → 저장 1`);

  /* 인식이 나빴던 도면 — 그대로 "고칠 도면 목록"이 된다 */
  const R = (uid, who, rooms, faces) => ev(uid, 'result_open', `${who} · 공간 ${rooms} · 벽면 ${faces}`);
  const weak = LOG.aggregateWeakPlans([
    R('a', '동탄 포레파크 84C', 1, 120), R('b', '동탄 포레파크 84C', 1, 120),
    R('c', '북수원 디에트르 84B', 12, 104),          // 잘 잡힌 것은 목록에 없어야 한다
    R('d', '평택 고덕 우미린 T4', 0, 69),
    ev('e', 'result_open', '형식이 다른 값'),          // 못 읽는 값은 조용히 건너뛴다
  ]);
  if (weak.some((w) => /디에트르/.test(w.who))) fail('잘 잡힌 도면이 "고칠 목록"에 들어갔다');
  else if (weak.length !== 2) fail(`고칠 도면이 ${weak.length}개 (기대 2)`);
  else if (weak[0].sess !== 2) fail(`자주 열리는 것이 앞에 와야 한다 (${weak[0].who} 세션 ${weak[0].sess})`);
  else pass(`고칠 도면 목록 — ${weak.map((w) => `${w.who}(공간 ${w.rooms}·${w.sess}세션)`).join(' · ')}`);
}


/*
 * ── 포스터의 매장 목록이 lib/stores.ts 와 어긋나지 않는가 (2026-08-30) ─────────────
 *
 * CLAUDE.md: *"매장 목록은 lib/stores.ts 한 곳이다."* 그런데 포스터는 미니앱이라
 * 그 모듈을 import 할 수 없어 <option> 65줄과 STORES 배열을 **제 안에 두 벌** 들고
 * 있고, 실제로 이름이 갈라져 있었다(stores.ts 「스타필드수원」 vs 포스터 「스타필드 수원」
 * — 인쇄물·QR 파일명에 다른 표기가 나갔다). 세 벌을 하나로 합치는 대신, **어긋나는
 * 순간 무는 검사**를 둔다 — 지점이 늘면 세 곳을 함께 고치라고 이 검사가 시킨다.
 */
{
  const posterSrc = fs.readFileSync(new URL('../public/poster-app.html', import.meta.url), 'utf8');

  /* 기준 — lib/stores.ts 의 활성 매장(본사 Z000 은 포스터에 없어야 정상).
     **ACTIVE_STORES 를 그대로 쓴다** — 여기서 조건을 따로 적으면 그쪽이 바뀔 때 어긋난다. */
  const base = new Map(S.ACTIVE_STORES
    .map((s) => [s.code, s.name]));

  /* ① <option value="ZN01">이름</option> */
  const opts = new Map([...posterSrc.matchAll(/<option value="(Z[A-Z0-9]{3})">([^<]+)<\/option>/g)]
    .map((m) => [m[1], m[2].trim()]));
  /* ② var STORES = [...] */
  const stMatch = posterSrc.match(/var STORES = (\[[^\n]*\]);/);
  const inline = stMatch ? new Map(JSON.parse(stMatch[1]).map((s) => [s.code, s.name])) : null;

  const diffs = [];
  for (const [label, map] of [['option', opts], ['STORES', inline]]) {
    if (!map) { diffs.push(label + ' 목록을 못 읽음'); continue; }
    for (const [code, name] of base) {
      if (!map.has(code)) diffs.push(`${label}: ${code}(${name}) 가 포스터에 없다`);
      else if (map.get(code) !== name) diffs.push(`${label}: ${code} 이름이 갈렸다 — stores.ts「${name}」 vs 포스터「${map.get(code)}」`);
    }
    for (const code of map.keys()) if (!base.has(code)) diffs.push(`${label}: ${code} 는 stores.ts 에 없는(또는 비활성) 지점이다`);
  }
  if (diffs.length) fail(`포스터 매장 목록이 lib/stores.ts 와 어긋난다 ${diffs.length}건 — ${diffs.slice(0, 4).join(' · ')}`);
  else pass(`포스터 매장 목록 두 벌(option ${opts.size} · STORES ${inline ? inline.size : '?'}) = lib/stores.ts 활성 ${base.size}곳`);
}

/* ── 자유게시판 Board.gs — 쓰는 칸과 읽는 칸이 맞는가 (2026-08-30 신설) ──
 * Code.gs 가 겪은 그 사고("doPost 만 고치고 doGet 을 빠뜨려 시트엔 쌓이는데
 * 화면이 비어 보인다")를 게시판에서도 소스로 막는다. 배포는 구글에 있어
 * 저장소에서 세어 두는 것이 유일한 안전망이다.
 */
{
  let bad = 0;
  const gs = fs.readFileSync('docs/apps-script/Board.gs', 'utf8');

  const hm = gs.match(/const HEADER = \[([^\]]*)\]/);
  const header = hm ? hm[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')) : [];
  if (header.join(',') !== 'ts,store,storeName,author,topic,title,body') {
    fail('[Board.gs] HEADER 가 예상(7칸)과 다르다: ' + header.join(',')); bad++;
  }

  /* doPost 가 HEADER 만큼 값을 쓰는가 */
  const post = gs.match(/appendRow\(\[new Date\(\)([^\]]*)\]\)/);
  const written = post ? 1 + post[1].split(',').filter((x) => x.trim()).length : 0;
  if (written !== header.length) {
    fail('[Board.gs] doPost 가 ' + written + '칸을 쓰는데 HEADER 는 ' + header.length + '칸이다'); bad++;
  }

  /* doGet 이 모든 칸을 자리 맞춰 돌려주는가 — 어긋나면 제목 자리에 본문이 뜬다 */
  const getBlock = gs.match(/return \{[\s\S]*?\};[\s\S]*?filter/);
  const read = getBlock ? getBlock[0] : '';
  const POS = { store: 1, storeName: 2, author: 3, topic: 4, title: 5, body: 6 };
  for (const [f, idx] of Object.entries(POS)) {
    if (!read.includes(f + ': String(r[' + idx + ']')) {
      fail('[Board.gs] doGet 의 ' + f + ' 열 번호가 HEADER 순서(' + idx + ')와 다르다'); bad++;
    }
  }
  if (!read.includes('ts: new Date(r[0])')) { fail('[Board.gs] doGet 이 ts(0번 열)를 안 돌려준다'); bad++; }

  /* 라우트가 그 주소를 환경변수로만 아는가 — 커밋되면 public repo 라 즉시 공개다 */
  const route = fs.readFileSync('app/api/board/route.ts', 'utf8');
  if (!route.includes('process.env.BOARD_GAS_URL')) { fail('[board] 라우트가 BOARD_GAS_URL 을 안 본다'); bad++; }
  if (/NEXT_PUBLIC_BOARD/.test(route) || /script\.google\.com\/macros/.test(route)) {
    fail('[board] GAS 주소가 소스에 박혔거나 NEXT_PUBLIC 으로 새고 있다'); bad++;
  }
  /* 화면도 — 페이지에 주소가 박히면 프록시를 둔 뜻이 없다 */
  const pageSrc = fs.readFileSync('app/board/page.tsx', 'utf8');
  if (/script\.google\.com\/macros/.test(pageSrc)) { fail('[board] 화면에 GAS 주소가 박혀 있다'); bad++; }
  if (pageSrc.includes('dangerouslySetInnerHTML=')) {
    fail('[board] 화면이 dangerouslySetInnerHTML 을 쓴다 — 남이 쓴 글을 HTML 로 그리면 XSS 다'); bad++;
  }
  if (!bad) console.log('OK: 자유게시판 — Board.gs HEADER 7칸 · doPost·doGet 열 일치 · 주소 미노출 · XSS 없음');
}

/*
 * ── Apps Script 파일에 **꼬리 쉼표(trailing comma)** 가 없는가 ──
 *
 * 2026-08-31 사장님이 붙여넣자 `SyntaxError: 예기치 않은 토큰 ';'` 이 났다.
 * 원인은 배열·객체 마지막 원소 뒤의 쉼표다:
 *
 *     'ZRG1': '평택',     ← 이 쉼표
 *   };
 *
 * **V8 은 허용하고 구형 Rhino 런타임은 거부한다.** 그래서 `node --check` 도 통과하고
 * 우리 눈에도 멀쩡해 보이는데 **사장님 편집기에서만 터진다** — 원인이 멀어서 세 번
 * 헛짚었다(파일 이름·붙여넣기 실수·파일 크기).
 *
 * **줄 번호도 어긋나게 만든다** — 파서가 그 자리에서 멈추지 않고 뒤에서 터지므로
 * 오류가 엉뚱한 줄(1198행)을 가리켰다.
 *
 * 우리가 그 런타임을 고를 수는 없으므로 **아예 쓰지 않는 편이 안전하다.**
 */
{
  const files = ['Reviews.gs', 'Code.gs', 'Board.gs', 'Exam.gs'];
  /* 마지막 원소 뒤 쉼표 → 줄바꿈(주석이 끼어도) → 닫는 괄호 */
  const RE = /,(\s*(?:\/\*[^*]*\*\/\s*)?[\r\n]\s*[\]}])/g;
  let bad = 0, checked = 0;
  for (const f of files) {
    const at = new URL('../docs/apps-script/' + f, import.meta.url);
    /* **없는 파일만 건너뛴다.** 처음에 `try { … } catch { continue }` 로 두었더니
       경로 헬퍼가 없어 난 ReferenceError 까지 삼켜 **검사가 한 줄도 안 돌면서
       ALL PASS 가 떴다** — 이 저장소가 되풀이해 경계하는 조용한 실패를 검사 자신이
       저지른 셈이다. 읽기 실패는 이유를 갈라서 본다. */
    if (!fs.existsSync(at)) continue;
    const src = fs.readFileSync(at, 'utf8');
    checked++;
    const hits = src.match(RE);
    if (hits) {
      bad++;
      /* 몇 번째 줄인지 알려 준다 — 안 그러면 70KB 에서 손으로 찾아야 한다 */
      const lines = src.split('\n');
      const where = [];
      for (let i = 0; i < lines.length - 1; i++) {
        if (!/,\s*(\/\*.*\*\/)?\s*$/.test(lines[i])) continue;
        const next = (lines[i + 1] || '').trim();
        if (/^[\]}]/.test(next)) where.push(i + 1);
      }
      fail(`[Apps Script] ${f} 에 꼬리 쉼표 ${hits.length}곳 — 구형 런타임이 SyntaxError 를 낸다`
        + (where.length ? ` (${where.slice(0, 6).join(', ')}행)` : ''));
    }
  }
  if (!bad && checked) console.log(`OK: Apps Script ${checked}개 파일에 꼬리 쉼표 없음 (구형 런타임 호환)`);
}

/*
 * ── HTML 템플릿에 **스크립트릿 기호가 딱 하나만** 있는가 ──
 *
 * 2026-08-31 — 스크립트가 통째로 죽었다. 화면은 `SyntaxError … ('Reviews' 파일, 1198행)`
 * 인데 그 줄은 평범한 `return t.evaluate()` 였고 `?json=1` 은 1MB 를 정상으로 줬다.
 *
 * 범인은 **내가 주석에 그 기호를 설명하려고 그대로 적은 것**이었다.
 * **Apps Script 템플릿 파서는 주석을 모른다** — HTML 을 훑다가 여는 기호를 만나면
 * 거기서부터 코드로 읽으므로, 설명문이 통째로 스크립트릿이 되어 깨진 JS 를 만든다.
 * 그리고 그 오류는 템플릿을 부른 자리(`t.evaluate()`)로 보고되어 **원인이 아주 멀어 보인다.**
 *
 * 이 화면은 자료를 한 번만 심으므로 **여는 기호는 정확히 하나여야 한다.**
 */
{
  const at = new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url);
  if (fs.existsSync(at)) {
    const src = fs.readFileSync(at, 'utf8');
    /* **이제는 하나도 없어야 한다**(2026-08-31 구조 변경). 자료를 HTML 에 심지 않고
       화면이 뜬 뒤 `getSummary()` 로 받으므로 `createHtmlOutputFromFile` 을 쓴다 —
       템플릿 평가를 아예 안 하므로 스크립틀릿이 남아 있으면 **글자로 그대로 화면에 뜬다.**
       주석에 적는 것도 안 된다(그 함정으로 화면이 통째로 죽은 적이 있다). */
    const opens = (src.match(/<\?/g) || []).length;
    if (opens !== 0) {
      /* 어느 줄인지 알려 준다 — 1,900줄에서 손으로 찾을 수는 없다 */
      const where = src.split('\n')
        .map((l, i) => (l.includes('<?') ? i + 1 : 0)).filter(Boolean);
      fail(`[Apps Script] ReviewsIndex 에 스크립트릿 기호가 ${opens}개 남았다 — 정적 출력이라 글자로 뜬다`
        + ` (${where.join(', ')}행). **주석에도 적으면 안 된다.**`);
    } else if (!src.includes('var DATA = {};')) {
      fail('[Apps Script] ReviewsIndex 가 빈 자료로 시작하지 않는다 — 첫 render 가 그 자리에서 죽는다');
    } else if (!src.includes('.getSummary();')) {
      fail('[Apps Script] 화면이 자료를 받아 오지 않는다 — 뼈대만 뜨고 영영 빈 채로 남는다');
    } else {
      console.log('OK: ReviewsIndex — 스크립틀릿 0 · 뼈대 먼저 뜨고 자료를 받아 채운다');
    }
  }

  /* ── 카페가 목록에서 사라져 보이던 것 (2026-09-01 사장님 신고) ──────────────
   *
   * *"최근수집자료가 블로그 위주로 되어 있는데 카페 자료가 잘 안 보입니다."*
   *
   * **수집은 멀쩡했다** — 실측으로 카페가 오히려 64%(4,775 / 7,453)다. 문제는 정렬이다.
   * 네이버가 카페 작성일을 안 주므로 `dated` 가 **블로그와 1:1로 일치**하고(2,678 = 2,678),
   * 정렬이 dated 우선이라 사실상 「블로그 전부 → 카페 전부」가 된다. 기본 20건/쪽이면
   * 카페 첫 줄이 **76쪽**이고 앞 75쪽에는 아래에 카페가 있다는 표시가 한 글자도 없었다.
   *
   * **정렬을 되돌려 고치지 않았다** — 2026-08-31 에 일부러 뒤집은 자리이고, 그 전에는
   * 카페 발견일이 늘 오늘이라 **블로그가 한 줄도 안 보이던** 정반대 사고가 났다.
   * 고칠 것은 정렬이 아니라 **「어디 있는지 화면이 말하는가」** 다. */
  {
    const at2 = new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url);
    if (fs.existsSync(at2)) {
      const v = fs.readFileSync(at2, 'utf8');
      /* ① 부제가 사실이어야 한다 — 실제 정렬은 '최근 순' 이 아니다 */
      if (v.includes('<div class="sub">최근 순 ·')) {
        fail('[바이럴] 목록 부제가 다시 "최근 순" 이다 — 실제 정렬은 작성일 아는 글 먼저다. 화면이 거짓말을 한다');
      /* ② 카페가 몇 쪽부터인지 말해 주는 안내 */
      } else if (!v.includes('쪽</b>부터 있습니다')) {
        fail('[바이럴] 카페가 몇 쪽부터인지 알리는 안내가 없다 — 기본 20건/쪽이면 76쪽까지 카페가 한 줄도 안 보인다');
      /* ③ 바로 갈 길 — 안내만 하고 길이 없으면 75쪽을 넘겨야 한다 */
      } else if (!v.includes('jumpc') || !v.includes("srcFilter = '카페'")) {
        fail('[바이럴] 「카페만 보기」 버튼이 없거나 연결되지 않았다 — 안내만 하고 갈 길이 없다');
      /* ④ 잔소리가 되지 않게 — 이 쪽에 카페가 있으면 안내를 띄우지 않는다.
         조건 셋(전체 보기 · 이 쪽에 없음 · 아래에 있음)이 다 살아 있어야 한다 */
      } else if (!v.includes('!pageHasUndated') || !v.includes("srcFilter === '전체'")) {
        fail('[바이럴] 안내 조건이 느슨해졌다 — 카페 구간에서도 계속 떠 잔소리가 되면 아무도 안 읽는다');
      /* ⑤ 잘린 사실을 출처별로 — 합계만 적으면 "카페가 적다" 는 오해가 남는다
         (실제로는 블로그 56% · 카페 31% 로 카페가 더 심하게 잘린다) */
      } else if (!v.includes('gotSrc')) {
        fail('[바이럴] 잘린 건수를 출처별로 안 적는다 — 카페가 더 심하게 잘리는데 합계만 보면 모른다');
      } else {
        console.log('OK: 바이럴 목록 — 카페가 몇 쪽부터인지 알리고 바로 가는 길을 준다 (정렬은 그대로)');
      }
    }
  }

  /* ── 바이럴 수집기 — 이어달리기가 성립하는가 (2026-08-31) ────────────────
   * 6분 한도를 넘기려고 **스스로 트리거를 걸어 이어 돈다.** 이 구조는 조용히 깨진다:
   * 트리거 이름이 겹치면 새벽 트리거가 지워지고, 시간 검사가 빠지면 실행이 통째로
   * 죽고, `MAX_PAGES` 만 올리면 화면이 틀린 한도 경고를 한다. 셋 다 화면에 표시가
   * 안 나므로 검사가 붙들어야 한다.
   */
  const rvPath = new URL('../docs/apps-script/Reviews.gs', import.meta.url);
  if (fs.existsSync(rvPath)) {
    const rv = fs.readFileSync(rvPath, 'utf8');

    /* ① 이어달리기 트리거는 **다른 이름**이어야 한다 — 같은 이름이면
       `setupTrigger` 의 「기존 것을 지운다」가 새벽 3시 트리거까지 지운다 */
    const chainFn = (rv.match(/var CHAIN_FN = '([^']+)'/) || [])[1];
    if (!chainFn) fail('[바이럴] CHAIN_FN 이 없다 — 이어달리기 트리거 이름을 상수로 둘 것');
    else if (chainFn === 'collectReviews') {
      fail('[바이럴] 이어달리기 트리거를 collectReviews 이름으로 걸면 setupTrigger 가 새벽 트리거까지 지운다');
    } else if (!new RegExp(`^function ${chainFn}\\(`, 'm').test(rv)) {
      fail(`[바이럴] 트리거가 부를 ${chainFn}() 함수가 없다 — 트리거는 걸리는데 아무 일도 안 일어난다`);
    } else {
      console.log(`OK: 바이럴 이어달리기 — 트리거 이름이 ${chainFn} 로 갈려 새벽 트리거를 안 건드린다`);
    }

    /* ② `google.script.run` 이 부르는 이름은 **밑줄로 끝나면 안 된다**(비공개 취급) */
    const pub = ['collectReviews', 'stopSweep', 'getSummary', 'setDailyLimit', 'dedupeReviews', 'setAlias', 'getProgress', 'setManagerNames'];
    const miss = pub.filter((f) => !new RegExp(`^function ${f}\\(`, 'm').test(rv));
    if (miss.length) fail(`[바이럴] 화면이 부르는 함수가 없다: ${miss.join(', ')}`);
    else console.log(`OK: 바이럴 공개 함수 ${pub.length}개 — 화면에서 부를 수 있는 이름이다`);

    /* ②-b **같은 이름의 함수를 두 번 선언하지 않는다.** JS 는 뒤엣것이 앞엣것을 조용히
       덮으므로 오류도 경고도 안 난다 — 실제로 `getSummary` 가 두 벌이었다(캐시 있는 것 ·
       없는 것). 순서가 반대였으면 **B안 캐시가 통째로 죽은 채** 아무도 몰랐을 것이다. */
    const declSeen = {};
    const declDup = [];
    const declRe = /^function ([A-Za-z0-9_$]+)\s*\(/gm;
    let declM;
    while ((declM = declRe.exec(rv))) {
      if (declSeen[declM[1]]) declDup.push(declM[1]);
      else declSeen[declM[1]] = 1;
    }
    if (declDup.length) {
      fail(`[바이럴] Reviews.gs 에 같은 이름의 함수가 두 벌이다: ${[...new Set(declDup)].join(', ')} — 뒤엣것이 조용히 이긴다`);
    } else {
      console.log(`OK: 바이럴 함수 선언 ${Object.keys(declSeen).length}개 — 이름 중복 없음`);
    }

    /* ③ 꼬리말 루프 안에 **시간 검사**가 있어야 한다. 매장 하나가 최대
       `TAILS × 2 × MAX_PAGES` 회라 6분을 넘길 수 있고, 넘기면 강제 종료돼
       **그때까지 받은 것이 시트에 안 써지고 통째로 날아간다.** */
    /* **루프 머리를 통째로 앵커로 쓰지 않는다** — 별칭이 들어오며 `TAILS.length` 가
       `qs.length` 로 바뀌자 이 검사가 조용히 무력해졌다(실제로 그랬다). `var ti =` 로만
       잡고 본문을 본다. */
    const tailAt = rv.indexOf('for (var ti =');
    const tailBody = tailAt < 0 ? '' : rv.slice(tailAt, tailAt + 900);
    if (!/Date\.now\(\) - t0 > BUDGET_MS/.test(tailBody)) {
      fail('[바이럴] 꼬리말 루프에 시간 검사가 없다 — 한 매장이 6분을 넘기면 그 실행이 통째로 날아간다');
    } else if (!/\}\s*\/\* TAILS \*\/\s*\n[\s\S]{0,400}?if \(stopped\) break;/.test(rv)) {
      fail('[바이럴] 꼬리말 도중 멈춤이 매장 루프를 안 끊는다 — 반만 훑은 매장을 건너뛴다');
    } else if (!/tailSave = ti;/.test(rv) || !/setProperty\('_tail'/.test(rv)) {
      /* **매장 안 진행 위치를 저장해야 한다.** 안 하면 한 매장이 예산을 못 끝낼 때
         다음 실행이 그 매장 꼬리 0부터 다시 돌아 **진전 0의 무한 루프**가 된다 —
         사장님이 본 「80% 에서 멈춘다」가 이 구조 위에 서 있었다. */
      fail('[바이럴] 매장 안 진행 위치(_tail)를 저장하지 않는다 — 한 매장을 못 끝내면 영영 같은 자리에 머문다');
    } else {
      console.log('OK: 바이럴 시간 검사 — 꼬리말 경계에서 끊고, 커서와 꼬리 위치가 그 매장에 머문다');
    }

    /* ③-b **상태 값은 캐시를 타면 안 된다.** 집계(13초)는 담아 두는 것이 맞지만
       커서·사용량·마지막 실행까지 담으면 **실제로 전진하는데 화면이 6시간 굳는다** —
       사장님이 「여러 번 눌러도 80% 그대로」를 본 진짜 이유가 이것이다. */
    /* **글자 수로 창을 자르지 말 것** — 주석이 늘면 함수 끝을 못 찾아 「없다」로 잡는다
       (이 저장소가 이미 두 번 데인 자리다). 함수 시작부터 닫는 줄까지 잘라 본다. */
    const freshAt = rv.indexOf('function freshState_(d) {');
    const fresh = freshAt < 0 ? '' : rv.slice(freshAt, rv.indexOf('\n}', freshAt));
    const need2 = ['cursor', 'dayUsed', 'chainOn', 'lastRun'];
    const missF = need2.filter((k) => !fresh.includes('d.' + k + ' ='));
    if (!fresh) fail('[바이럴] freshState_ 가 없다 — 캐시가 커서·사용량을 얼려 화면이 거짓말을 한다');
    else if (missF.length) fail(`[바이럴] freshState_ 가 새로 안 읽는 값: ${missF.join(', ')}`);
    else if (!/if \(hit\) \{ hit\.cached = true; return freshState_\(hit\); \}/.test(rv)) {
      fail('[바이럴] getSummary 가 캐시 히트에서 freshState_ 를 안 지난다 — 상태가 굳는다');
    } else if (!/sumCachePut_\(d\);[\s\S]{0,400}?return freshState_\(d\);/.test(rv)) {
      /* **캐시 미스일 때도 같은 길을 지나가야 한다.** 히트일 때만 거쳤더니 같은 함수가
         경우에 따라 **다른 필드 구성**을 냈다(실측: 캐시 미스 응답에 `cycleAt` 이 없어
         화면이 남은 시간을 못 냈다). 담아 둔 뒤에 불러야 상태가 캐시에 안 굳는다. */
      fail('[바이럴] getSummary 가 캐시 미스에서 freshState_ 를 안 지난다 — 경우에 따라 필드 구성이 달라진다');
    } else console.log('OK: 바이럴 상태 값 — 캐시 히트·미스 둘 다 같은 필드 구성을 낸다');

    /* ③-b2 **캐시 키에 판 번호가 박혀 있어야 한다.** 없으면 새 필드를 더해 배포해도
       옛 캐시(6시간)가 그것을 가려 **화면이 거짓말을 한다** — 실제로 줄임말 카드가
       「아직 등록된 줄임말이 없습니다」라고 말했다(코드 표에 두 개가 있는데).
       `sw.js` 의 `CACHE_VERSION` 과 같은 규칙이다. */
    if (!/var SUM_VER = \d+;/.test(rv) || !/var SUM_KEY = '[^']*' \+ SUM_VER;/.test(rv)) {
      fail('[바이럴] 집계 캐시 키에 판 번호(SUM_VER)가 없다 — 새 필드를 더해도 옛 캐시가 가린다');
    } else if (!/d\.alias = aliasAll_\(\);/.test(rv)) {
      fail('[바이럴] 줄임말이 캐시와 함께 굳는다 — 등록하고도 목록에 안 보여 「저장이 안 됐다」로 읽힌다');
    } else console.log('OK: 바이럴 캐시 판 번호 — 새 필드를 더해도 옛 캐시가 안 가린다');

    /* ③-b3 **매장 하나를 끝낼 때마다 저장해야 한다.** 시트 쓰기·커서가 함수 끝에만
       있으면 6분 강제 종료 때 **그 실행이 통째로 사라지고 커서도 그대로**라, 다음
       실행이 같은 자리에서 또 죽어 영원히 제자리가 된다 — 배포본이 네 번을 돌고도
       커서가 0에서 안 움직인 것을 실측했다.
       **순서가 중요하다: 쓰기 → 커서.** 커서를 먼저 올리면 쓰기가 실패했을 때 그 매장
       글을 영영 못 넣는다. */
    const loopEnd = rv.indexOf("props_().setProperty('_cursor', String(i + 1));");
    const writeAt = rv.indexOf('flushed += add.length;');
    if (loopEnd < 0) {
      fail('[바이럴] 매장마다 커서를 저장하지 않는다 — 강제 종료되면 그 실행이 통째로 날아가고 제자리가 된다');
    } else if (writeAt < 0 || writeAt > loopEnd) {
      fail('[바이럴] 매장 경계에서 시트 쓰기가 커서 저장보다 뒤다 — 쓰기가 실패하면 그 매장 글을 영영 못 넣는다');
    } else if (!/added: flushed \+ add\.length/.test(rv)) {
      fail('[바이럴] 보고 건수가 중간 저장분(flushed)을 빠뜨린다 — 화면이 실제보다 적게 말한다');
    } else if (!/var BUDGET_MS = 3\.5 \* 60 \* 1000;/.test(rv)) {
      fail('[바이럴] 예산이 3.5분이 아니다 — 오버슛까지 더하면 6분 한도를 넘겨 실행이 통째로 날아간다');
    } else console.log('OK: 바이럴 중간 저장 — 매장마다 쓰기→커서 순으로 남기고, 예산 3.5분');

    /* ③-b4 **LG 비교가 완주에 매달리면 영영 자기 차례가 안 온다.** 40회짜리인데
       매장 65곳·매니저·카페 훑기 뒤에 두었더니 6분 한도에 걸려 한 번도 안 돌았다
       (2026-09-01 실측: fullAt 이 빈 문자열 · rival 이 null). 하루 한 번으로 바꾸고
       매니저·카페보다 앞에 두었다. */
    if (!/function rivalDue_()/.test(rv)) {
      fail('[바이럴] LG 비교가 「완주한 실행」에만 매달린다 — 영영 자기 차례가 안 온다');
    } else if (/if (!stopped && !err && !over()) { try { rivalRun = collectRival/.test(rv)) {
      fail('[바이럴] LG 비교가 아직 !stopped 에 묶여 있다');
    } else if (rv.indexOf('rivalRun = collectRival') > rv.indexOf('매니저 이름 훑기 ───')) {
      fail('[바이럴] LG 비교가 매니저·카페 훑기보다 뒤다 — 그 앞의 148회에 시간을 다 쓴다');
    } else console.log('OK: 바이럴 LG 비교 — 하루 한 번 · 매니저·카페보다 앞에서 돈다');

    /* ③-b5 **비중은 「숫자가 아니면 못 잼」이어야 한다.** `=== null` 만 보면
       undefined·NaN·빈 문자열이 새어 `undefined%` 가 화면에 찍힌다(2026-09-01 사장님
       신고). 그리고 **당사 vs LG 카드는 작게 고정**한다(사장님 요청) — 여섯 줄짜리
       표라 넓혀도 여백만 는다. */
    /* **정규식을 쓰지 않는다** — 이 파일을 셸로 고치면 백슬래시가 먹혀 조용히 다른
       뜻이 된다(이 회차에만 세 번 겪었다). 문자열 포함으로 충분한 검사다. */
    const vh = fs.readFileSync(new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url), 'utf8');
    if (vh.includes('r.pct === null')) {
      fail('[바이럴] 비중 판정이 아직 === null 이다 — undefined·NaN 이 새어 화면에 찍힌다');
    } else if (!vh.includes("typeof r.pct === 'number' && isFinite(r.pct)")) {
      fail('[바이럴] 비중을 숫자로 확인하지 않는다');
    } else if (!vh.includes('data-card="rival" data-nolead')) {
      fail('[바이럴] 당사 vs LG 카드가 작게 고정돼 있지 않다 — 맨 앞에 오면 전체 폭이 된다');
    } else if (!vh.includes("hasAttribute('data-nolead')")) {
      fail('[바이럴] data-nolead 를 아무도 안 본다 — 표시만 하고 지키지 않는다');
    } else console.log('OK: 바이럴 비중 — 숫자가 아니면 못 잼 · 당사 vs LG 카드는 작게 고정');

    /* ③-b6 **매니저 이름 뽑기와 명부.** 프로덕션 3,000건 검증에서 오탐 일곱이 나왔고
       **여섯이 한 뿌리**였다 — 직함 뒤에 붙는 글자를 안 봤다(`프로모션`·`프로필`·
       `프로3`·`프로레슨`). 그리고 명부가 있어야 **직함으로 갈린 같은 사람을 합치고**
       (남수호 프로 + 남수호 매니저) **0건도 보여줄 수 있다.** */
    {
      const src2 = rv;
      const grab = (name) => {
        const at = src2.indexOf('function ' + name + '(');
        if (at < 0) return '';
        let d = 0;
        for (let j = src2.indexOf('{', at); j < src2.length; j++) {
          if (src2[j] === '{') d++;
          else if (src2[j] === '}') { d--; if (!d) return src2.slice(at, j + 1); }
        }
        return '';
      };
      const pick = (re) => (src2.match(re) || [''])[0];
      const head = pick(/var MGR_TITLES = \[[^\]]*\];/) + '\n'
        + pick(/var MGR_NOTNAME = \[[\s\S]*?\];/) + '\n'
        + pick(/var MGR_TAIL_OK = [^;]*;/);
      let mgrFind = null;
      try { mgrFind = new Function(head + '\n' + grab('mgrFind_') + '\nreturn mgrFind_;')(); } catch (e) { mgrFind = null; }
      if (!mgrFind) {
        fail('[바이럴] mgrFind_ 를 떼어 돌릴 수 없다 — 이름 뽑기를 검사할 수 없다');
      } else {
        /* **실제 프로덕션 제목에서 나온 것들이다.** 지어낸 예가 아니다. */
        const cases = [
          ['수원 삼성스토어 엄기연 매니저님 추천드립니다!', '엄기연 매니저'],
          ['삼성스토어 평택점 제창우프로님에게 계약했어요.', '제창우 프로'],
          ['#윤현식매니저 #갤러리아광교 혼수', '윤현식 매니저'],
          ['김준수 매니저가 친절하게 설명해주셨어요', '김준수 매니저'],
          ['삼성스토어 영통: 최신 기술과 다양한 프로모션의 완벽한 조화!', null],
          ['[삼성스토어안성스타필드점] 9월 12일-18일 행사정보 프로필', null],
          ['갤럭시 버즈 프로3 불량 삐소리ㅣ삼성전자서비스 동탄센터', null],
          ['성남 골프연습장 맥시멈골프존 아카데미 프로레슨후기', null],
          ['W32. 가전: 삼성스토어 용인구성 계약후기 (견적서&매니저 공유O)', null],
          ['삼성스토어 수원 대리점 방문했어요', null]
        ];
        const bad = cases.filter(([t, want]) => {
          const g = mgrFind(t);
          return want === null ? g.length > 0 : g.indexOf(want) < 0;
        });
        if (bad.length) {
          fail(`[바이럴] 매니저 이름 뽑기가 ${bad.length}건 틀린다 — 예: ${bad[0][0].slice(0, 40)}`);
        } else if (!/function setManagerNames\(/.test(rv) || !/mgrKnown: mgrKnown/.test(rv)) {
          fail('[바이럴] 매니저 명부가 없다 — 직함으로 갈린 같은 사람을 못 합치고 0건인 사람이 화면에서 사라진다');
        } else if (!vh.includes('renderMgrBook();') || !vh.includes('wireMgrBook();')) {
          fail('[바이럴] 명부를 화면이 안 그리거나 등록을 못 한다');
        } else console.log(`OK: 바이럴 매니저 — 실제 제목 ${cases.length}건 판정 · 명부로 합산·0건 표시`);
      }
    }

    /* ③-c **이미 가진 글을 다시 받지 않는다**(사장님 지적: 매일 10,400회는 낭비).
       신호는 **「이미 가진 링크를 만났다」** 여야 한다 — 「새 링크가 0건」으로 잡으면
       우리 매장 글이 아닌 것은 저장하지 않아 **영원히 새 링크로 보여** 안 멈춘다. */
    if (!/if \(seen\[link\]\) \{ hitSeen = true; continue; \}/.test(rv)) {
      fail('[바이럴] 이미 가진 링크를 만난 것을 표시하지 않는다 — 매일 한 바퀴를 통째로 다시 받는다');
    } else if (!/if \(!isFull && hitSeen\)/.test(rv)) {
      fail('[바이럴] 이미 가진 영역에 닿아도 쪽 루프를 안 멈춘다');
    } else if (!/FULL_EVERY_DAYS/.test(rv)) {
      fail('[바이럴] 주기적 전체 훑기(그물)가 없다 — 네이버 정렬을 믿는 최적화는 그물이 있어야 한다');
    } else console.log('OK: 바이럴 새 글만 훑기 — 이미 가진 영역에서 멈추고, 주기적으로 전부 훑는다');

    /* ④ 한 바퀴 최대 호출(`SWEEP_CALLS`)이 실제 상한보다 작으면 **화면이 틀린 경고**를 한다
       (한도가 넉넉한데 "모자란다"고 하거나 그 반대). 값을 손으로 적으므로 대조한다. */
    const nOf = (re) => Number((rv.match(re) || [])[1] || 0);
    const maxPages = nOf(/var MAX_PAGES = (\d+)/);
    const sweep = nOf(/var SWEEP_CALLS = (\d+)/);
    const nTails = ((rv.match(/var TAILS = \[([^\]]*)\]/) || [])[1] || '').split(',').length;
    /* **한 줄에 매장이 넷씩이라 줄 앵커로 세면 안 된다** — 65곳이 8곳으로 세어져
       상한이 8배 낮게 잡히고, 그러면 이 검사가 아무것도 못 지킨다(실제로 그랬다).
       배열 안의 점코드를 전부 센다. */
    const storeBlock = (rv.match(/var STORES = \[([\s\S]*?)\n\];/) || [])[1] || '';
    const nStores = (storeBlock.match(/\['[A-Z0-9]{4}'\s*,/g) || []).length;
    /* **줄임말(별칭)도 한 매장 몫을 더 쓴다** — 코드 표의 별칭 수를 함께 센다.
       안 세면 별칭을 넣은 순간 상수가 낮아져 화면이 「한도가 넉넉하다」고 거짓말한다. */
    const aliasStart = rv.indexOf('var ALIAS = {');
    const aliasBlock = aliasStart < 0 ? '' : rv.slice(aliasStart, rv.indexOf('\n};', aliasStart));
    /* 줄마다 `'매장': ['별칭', ...]` 이라, **대괄호 안의 따옴표 묶음만** 센다 */
    const nAlias = (aliasBlock.match(/\[[^\]]*\]/g) || [])
      .reduce((n, g) => n + (g.match(/'[^']+'/g) || []).length, 0);
    const need = (nStores + Math.max(0, nAlias)) * nTails * 2 * maxPages;
    if (!maxPages || !sweep || !nTails || !nStores) {
      fail('[바이럴] MAX_PAGES · SWEEP_CALLS · TAILS · STORES 중 못 읽은 것이 있다');
    } else if (sweep < need) {
      fail(`[바이럴] SWEEP_CALLS(${sweep}) < 실제 상한(${need} = 매장 ${nStores} × 꼬리 ${nTails} × 2소스 × ${maxPages}쪽) — MAX_PAGES 를 바꿨으면 함께 고칠 것`);
    } else {
      console.log(`OK: 바이럴 한 바퀴 최대 ${sweep}회 ≥ 상한 ${need}회 (매장 ${nStores} × 꼬리 ${nTails} × 2소스 × ${maxPages}쪽)`);
    }

    /* ⑤ `start` 상한은 네이버가 1,000 이다 — 넘기면 HTTP 400 이라 그 쪽이 통째로 버려진다 */
    const pageSize = nOf(/var PAGE_SIZE = (\d+)/);
    if (pageSize * maxPages > 1000) {
      fail(`[바이럴] PAGE_SIZE(${pageSize}) × MAX_PAGES(${maxPages}) = ${pageSize * maxPages} > 1000 — start 상한을 넘어 HTTP 400 이 난다`);
    } else {
      console.log(`OK: 바이럴 질의 깊이 ${pageSize * maxPages}건 ≤ 네이버 start 상한 1,000`);
    }

    /* ⑦ **중복 정리는 되돌릴 수 없다 — 가짜 시트로 실제 돌려 본다.**
       규칙을 눈으로만 보면 "지울 것을 안 지운다"와 "지우면 안 될 것을 지운다"를 못 가른다.
       `dedupe_` 만 떼어 내 Apps Script 흉내(sheet_)를 물려 돌린다. */
    {
      const fn = (rv.match(/function dedupe_\(\)[\s\S]*?\n\}/) || [])[0]
      if (!fn) fail('[바이럴] dedupe_ 가 없다 — 중복을 치울 길이 없다');
      else {
        /* 시트 흉내 — 실제로 쓰인 값과 지운 줄 수를 들고 있는다 */
        const mk = (rows) => {
          const st = { rows: rows.map((r) => r.slice()), wrote: null, deleted: 0 };
          st.sheet = {
            getLastRow: () => st.rows.length + 1,
            getRange: (r, c, n, w) => ({
              getValues: () => st.rows.slice(r - 2, r - 2 + n).map((x) => x.slice(0, w)),
              setValues: (v) => { st.wrote = v }
            }),
            deleteRows: (from, n) => { st.deleted = n }
          };
          return st;
        };
        const run = (rows) => {
          const st = mk(rows);
          /* **함수를 떼어 돌리므로 그것이 부르는 것도 함께 넘겨야 한다.**
             `dedupe_` 가 집계 캐시를 버리게 되면서 의존이 하나 늘었다 —
             안 넘기면 `ReferenceError` 로 스위트가 통째로 죽는다(실제로 죽었다). */
          const f = new Function('sheet_', 'SHEET_ITEMS', 'HEADER', 'sumCacheClear_',
            fn + '; return dedupe_()');
          const out = f(() => st.sheet, '후기', ['date', 'store', 'storeName', 'src', 'title', 'link', 'cafe', 'postdate', 'seenAt', 'kind'], () => {});
          return { out, st };
        };
        const row = (link, post, tag) => ['2026-08-01', 'Z001', '수원', '카페', tag, link, '', post, '2026-08-01', '구매'];

        /* ⓐ 같은 URL 두 벌 → 한 줄이 지워지고, **작성일이 있는 쪽이 남는다** */
        const a = run([row('u1', '', '카페판'), row('u1', '20260715', '블로그판'), row('u2', '', '다른 글')]);
        if (a.out.removed !== 1) fail(`[바이럴] 중복 정리가 안 문다 — removed=${a.out.removed} (1이어야 한다)`);
        else if (a.st.wrote[0][4] !== '블로그판') fail('[바이럴] 중복 정리가 작성일 있는 줄을 안 남긴다 — 날짜 정보를 버린다');
        else if (a.st.deleted !== 1) fail(`[바이럴] 지운 줄 수가 안 맞는다 — deleteRows(${a.st.deleted})`);
        else console.log('OK: 바이럴 중복 정리 — 같은 URL 을 치우고 작성일 있는 줄을 남긴다');

        /* ⓑ 중복이 없으면 **시트를 건드리지 않는다** */
        const b = run([row('u1', '', 'a'), row('u2', '', 'b')]);
        if (b.out.removed !== 0 || b.st.wrote || b.st.deleted) fail('[바이럴] 중복이 없는데 시트를 고쳤다');
        else console.log('OK: 바이럴 중복 정리 — 치울 것이 없으면 시트를 건드리지 않는다');

        /* ⓒ **주소가 빈 줄은 지우지 않는다** — 걸러낼 근거가 없다.
           **줄을 넉넉히 둔다** — 적게 두면 ⓓ의 절반 안전선이 먼저 걸려 이 검사가
           그 그늘에 가려진다(실제로 3줄로 두었다가 안 물었다). */
        const c = run([row('', '', 'x'), row('', '', 'y'),
          row('u1', '', 'a'), row('u2', '', 'b'), row('u3', '', 'c'), row('u4', '', 'd')]);
        if (c.out.removed !== 0) fail('[바이럴] 주소가 빈 줄을 중복으로 보고 지웠다 — 근거 없이 지우면 안 된다');
        else console.log('OK: 바이럴 중복 정리 — 주소가 빈 줄은 근거가 없어 그대로 둔다');

        /* ⓓ **절반 넘게 지워야 하면 손대지 않는다.** 규칙이 잘못됐을 때의 마지막 안전선. */
        const d = run([row('u', '', '1'), row('u', '', '2'), row('u', '', '3'), row('u', '', '4')]);
        if (d.out.removed !== 0 || !d.out.error) fail('[바이럴] 절반 넘게 지우는데 안전선이 안 걸렸다');
        else console.log('OK: 바이럴 중복 정리 — 절반을 넘으면 멈추고 이유를 말한다');
      }
    }

    /* ⑧ **「언제 쓰였나」와 「언제 찾았나」를 같은 축에 놓지 않는다** (2026-08-31).
       카페 줄의 `date` 는 발견일(거의 늘 오늘)이고 블로그 줄만 진짜 작성일이라,
       한 축으로 정렬하면 **카페가 맨 위를 통째로 차지한다** — 실측으로 화면에
       내려보내는 3,000줄에 블로그가 **1건**뿐이었다(작성일이 진짜인 2,459건이
       목록에서 사라졌다). 되돌아가면 화면에서만 보이는 종류라 검사가 붙든다. */
    {
      const cmp = (rv.match(/rows\.sort\(function \(a, b\) \{([\s\S]*?)\}\);/) || [])[1] || ''
      if (!/a\.dated !== b\.dated/.test(cmp)) {
        fail('[바이럴] 최근순 정렬이 작성일과 발견일을 같은 축에 놓는다 — 카페가 목록을 독차지한다');
      } else {
        /* 실제로 돌려 본다 — 정규식만 보면 부호가 뒤집혀도 통과한다 */
        const f = new Function('rows', `rows.sort(function (a, b) {${cmp}}); return rows`);
        const out = f([
          { dated: false, date: '2026-08-31', t: '카페1' },
          { dated: true, date: '2026-08-20', t: '블로그A' },
          { dated: false, date: '2026-08-30', t: '카페2' },
          { dated: true, date: '2026-08-25', t: '블로그B' }
        ]);
        const names = out.map((r) => r.t).join(',');
        if (names !== '블로그B,블로그A,카페1,카페2') {
          fail(`[바이럴] 정렬 결과가 틀리다 — ${names} (블로그B,블로그A,카페1,카페2 여야 한다)`);
        } else console.log('OK: 바이럴 정렬 — 작성일 아는 글이 먼저, 그 안에서 최신순');
      }

      /* `recent` 를 앞에서 그냥 자르면 이번엔 카페가 한 줄도 안 간다 — 방향만 바뀐 같은 사고 */
      /* **문자 수로도, 옆 필드 이름으로도 자르지 않는다.** `{0,300}` 은 주석 한 줄에
         밀려 멀쩡한 코드를 「없다」고 잡았고, 뒤이어 앵커로 쓰던 `truncated:` 를 지우자
         이번엔 범위가 통째로 비었다 — **검사가 이웃 코드에 기대면 그 이웃이 사라질 때
         함께 죽는다.** 리턴 객체 끝(`};`)까지 잡고 **첫 주석 앞까지만** 본다
         (주석 안의 낱말이 검사를 통과시키는 오탐도 함께 막힌다). */
      const ri = rv.indexOf('recent:');
      const re = rv.indexOf('};', ri);
      const recentLine = ri < 0 || re < 0 ? '' : rv.slice(ri, re).split('/*')[0]
      if (/recent: rows\.slice\(/.test(rv)) {
        fail('[바이럴] recent 를 앞에서 통째로 자른다 — 한쪽 갈래가 화면에서 통째로 사라진다');
      } else if (!/r\.dated/.test(recentLine) || !/!r\.dated/.test(recentLine)) {
        fail('[바이럴] recent 가 두 갈래(작성일 아는 글 / 모르는 글)를 함께 담지 않는다');
      } else {
        console.log('OK: 바이럴 recent — 두 갈래를 절반씩 담아 소스 필터가 뜻을 갖는다');
      }
    }

    /* ⑨ 화면이 발견일을 **작성일처럼 적지 않는가.** 「추정」이라 쓰면 *우리가 어림한
       날짜* 로 읽히고, 아무 말도 안 붙이면 작성일로 읽힌다 — 둘 다 거짓이다. */
    {
      const idxPath = new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url);
      if (fs.existsSync(idxPath)) {
        const ix = fs.readFileSync(idxPath, 'utf8');
        if (/>추정</.test(ix)) {
          fail('[바이럴] 발견일에 「추정」 태그를 붙였다 — 우리가 어림한 날짜로 읽힌다');
        } else if (!/발견 '/.test(ix) || !/'작성 '/.test(ix)) {
          fail('[바이럴] 목록이 「작성」과 「발견」을 갈라 적지 않는다');
        } else if (!/날짜기준/.test(ix)) {
          fail('[바이럴] CSV 가 작성일과 발견일을 한 칸에 뭉갠다 — 엑셀로 돌린 사람이 전부 작성일로 읽는다');
        } else {
          console.log('OK: 바이럴 화면·CSV — 작성일과 발견일을 갈라 적는다');
        }

        /* 「여기부터는 작성일 미상」 경계선이 **필터를 걸어도 뜨는가.**
           소스 필터를 「카페」로 걸면 목록이 처음부터 끝까지 발견일이라
           `wasDated === true` 로 보면 설명이 통째로 사라진다 — 화면에서만 보이는
           종류라 조건식을 뽑아 **실제로 돌려 본다**(정규식만 보면 부호가 뒤집혀도 통과한다). */
        /* **역슬래시를 쓰지 않는다** — heredoc·셸을 거치면 조용히 먹혀
           정규식이 다른 뜻이 된다(문법 오류가 안 나 더 위험하다). 이스케이프 대신
           문자 클래스로 쓴다: [(] [)] [.] [{] */
        const cond = (ix.match(/if [(](wasDated[^)]*?!r[.]dated)[)] [{]/) || [])[1];
        if (!cond) {
          fail('[바이럴] 목록에 작성일/발견일 경계 표시가 없다');
        } else {
          const show = new Function('wasDated', 'r', 'return !!(' + cond + ')');
          const cases = [
            [null, false, true, '전부 발견일(카페 필터) — 첫 줄에 뜬다'],
            [true, false, true, '작성일 뒤 첫 발견일 — 경계에 뜬다'],
            [false, false, false, '발견일이 이어짐 — 다시 안 뜬다'],
            [null, true, false, '작성일로 시작 — 안 뜬다'],
            [false, true, false, '발견일 뒤 작성일 — 안 뜬다']
          ];
          const bad = cases.filter((c) => show(c[0], { dated: c[1] }) !== c[2]);
          if (bad.length) fail('[바이럴] 경계 표시 조건이 틀리다 — ' + bad.map((c) => c[3]).join(' / '));
          /* 목록 전체가 발견일이면 「여기부터는」이 거짓이다 — 문구가 갈려 있어야 한다 */
          else if (!/이 목록은 전부/.test(ix)) {
            fail('[바이럴] 목록 전체가 발견일인데 「여기부터는」이라 적는다 — 화면이 거짓말을 한다');
          } else console.log('OK: 바이럴 경계 표시 — 필터로 전부 발견일이 돼도 설명이 남는다');
        }

        /* 경계 자리를 **서버가 준 인덱스로 찾지 않는가.** 화면이 그리는 것은
           `filtered()` 를 거친 목록이라 서버가 센 자리는 필터를 걸면 어긋난다. */
        if (/recentDated/.test(ix) || /recentDated/.test(rv)) {
          fail('[바이럴] 경계를 서버 인덱스(recentDated)로 찾는다 — 필터를 걸면 엉뚱한 줄에 선이 그어진다');
        } else console.log('OK: 바이럴 경계 — 화면이 목록을 훑어 찾아 필터와 무관하게 맞다');

        /* **받아온 것이 전부가 아니면 목록 끝에서 밝히는가.** 8,711건 중 3,000건만
           내려받는데 아무 말이 없으면 맨 아래까지 내려간 사람이 「이게 전부」로 읽는다.
           **정규식 대신 문자열 포함으로 본다** — 이스케이프가 없으면 먹힐 것도 없다. */
        if (!ix.includes('건</b>만 받아 왔습니다')) {
          fail('[바이럴] 목록이 잘렸는데 화면이 말하지 않는다 — 맨 아래까지 본 사람이 「이게 전부」로 읽는다');
        } else if (!ix.includes('got < all')) {
          fail('[바이럴] 잘림 안내를 받은 수와 전체 수로 판정하지 않는다 — 서버 값과 어긋날 수 있다');
        } else console.log('OK: 바이럴 잘림 안내 — 받은 수와 전체 수를 화면이 직접 견준다');
      }
    }

    /* ⑩ **지도** — 2026-08-31 개편.
       빌드가 만든 SVG 가 커밋본과 같은가 · 서버가 지도 칸을 세는가 · 화면이 그것을
       그리는가. 셋 중 하나만 빠져도 지도가 조용히 빈 채로 배포된다. */
    {
      /* ⓐ 커밋본 == 재생성 (search-index·size-reps 와 같은 방식) */
      const before = fs.readFileSync(new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url), 'utf8');
      let rebuilt = null;
      try {
        /* **`pathname` 을 그대로 쓰지 말 것** — 저장소 경로에 한글이 있어 `%EB%85%B8…`
           로 인코딩된 채 넘어가고, 그러면 「파일이 없다」로 빌드가 실패한다.
           `fileURLToPath` 만이 윈도우 경로를 바르게 되돌린다. */
        execFileSync(process.execPath, [fileURLToPath(new URL('./build-region-map.mjs', import.meta.url))], { stdio: 'pipe' });
        rebuilt = fs.readFileSync(new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url), 'utf8');
      } catch (e) {
        fail('[바이럴] 지도 빌드가 실패한다 — ' + String(e.message).slice(0, 120));
      }
      if (rebuilt !== null) {
        if (rebuilt !== before) {
          fs.writeFileSync(new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url), before);
          fail('[바이럴] 커밋된 지도가 낡았다 — `npm run build:regionmap` 을 돌려 커밋할 것');
        } else console.log('OK: 바이럴 지도 — 커밋본이 재생성 결과와 같다');
      }

      /* ⓑ 지도 칸이 **집계 단위와 어긋나지 않는가.** 경기는 AREA 그대로, 강원만 시로
         푼다 — 강원 시가 AREA 를 벗어나면 지도 합계와 지역 막대가 갈린다. */
      const cellFn = (rv.match(/function mapCell_\(code\) \{[\s\S]*?\n\}/) || [''])[0];
      if (!cellFn) {
        fail('[바이럴] mapCell_ 이 없다 — 지도 칸을 셀 수가 없다');
      } else if (!/강원/.test(cellFn)) {
        fail('[바이럴] mapCell_ 이 강원을 시로 풀지 않는다 — 매장 9곳이 한 칸에 뭉개진다');
      } else {
        const gw = (rv.match(/var GW_CITY = \{[\s\S]*?\n\};/) || [''])[0];
        const codes = (gw.match(/Z[A-Z0-9]{3}/g) || []);
        /* 그 코드들이 **전부 AREA 에서 강원**이어야 한다. 하나라도 벗어나면 지도 합계가
           지역 막대와 어긋나는데, 화면에서는 둘 다 그럴듯해 보여 못 잡는다. */
        const areaSrc = (rv.match(/var AREA = \{[\s\S]*?\n\};/) || [''])[0];
        const AREA = new Function('return ' + areaSrc.replace('var AREA = ', '').replace(/;$/, ''))();
        const stray = codes.filter((c) => AREA[c] !== '강원');
        if (!codes.length) fail('[바이럴] GW_CITY 가 비었다 — 강원이 한 칸으로 뭉개진다');
        else if (stray.length) {
          fail('[바이럴] GW_CITY 에 강원이 아닌 매장이 있다 (' + stray.join(' ') + ') — 지도 합계가 지역 막대와 어긋난다');
        } else console.log('OK: 바이럴 지도 칸 — 강원 ' + codes.length + '곳이 전부 AREA 강원 안이다');
      }

      /* ⓒ **추이는 작성일을 아는 글만 센다.** 발견일이 섞이면 카페가 전부 이번 달로
         몰려 이번 달 막대만 거대해진다 — 사장님이 두 번 지적한 그 사고와 같은 뿌리다. */
      /* **첫 루프를 잡으면 안 된다** — `rows.length` 루프가 둘이고 앞엣것에는
         `if (r.dated)` 가 없다(실제로 그렇게 헛돌아 멀쩡한 코드를 「틀렸다」고 잡았다).
         루프를 특정하지 말고 **`if (r.dated)` 블록 전부**를 훑어 그중 하나가 추이를
         세는지 본다 — 블록이 어느 루프에 있든 뜻은 같다. */
      const blks = rv.match(/if \(r\.dated\) \{[\s\S]*?\n    \}/g) || [];
      const datedBlk = blks.filter((b) => /byMonth\[/.test(b) && /byDay\[/.test(b))[0] || '';
      if (!datedBlk) {
        fail('[바이럴] 월별·일별 추이가 작성일 밖에서 세어진다 — 카페 발견일이 섞여 이번 달만 거대해진다');
      } else console.log('OK: 바이럴 추이 — 작성일을 아는 글만 센다');

      /* ⓓ 화면이 실제로 그리는가. 함수만 있고 부르지 않으면 카드가 빈 채로 남는다. */
      const idxPath2 = new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url);
      const ix2 = fs.readFileSync(idxPath2, 'utf8');
      const misses = ['renderMap', 'renderTrend', 'renderDiag'].filter(
        (f) => !(new RegExp('function ' + f + '\\(').test(ix2)) || !(new RegExp('^\\s+' + f + '\\(\\);', 'm').test(ix2)));
      if (misses.length) {
        fail('[바이럴] 화면이 ' + misses.join(' · ') + ' 를 정의하지 않았거나 부르지 않는다');
      } else console.log('OK: 바이럴 화면 — 지도·추이·진단을 모두 그린다');

      /* ⓔ **함수가 `<style>` 안에 들어가지 않았는가.** 앵커가 CSS 주석과 겹쳐 실제로
         한 번 그렇게 들어갔다 — 브라우저가 조용히 무시해 문법 오류도 안 났다. */
      const styleEnd = ix2.indexOf('</style>');
      const firstFn = ix2.indexOf('function renderDiag(');
      if (styleEnd > 0 && firstFn > 0 && firstFn < styleEnd) {
        fail('[바이럴] 렌더 함수가 <style> 안에 있다 — 브라우저가 조용히 무시한다');
      } else console.log('OK: 바이럴 화면 — 렌더 함수가 스크립트 안에 있다');

      /* ⓕ **색 10단계** (2026-08-31 사장님: *"색상이 너무 단조롭습니다 10단계로"*).
         CSS 와 계산식이 따로 놀면 v7 을 계산해 놓고 그 색이 없어 **투명하게 그려진다** —
         화면에서는 「0건」과 똑같아 보여 못 잡는다. */
      {
        const miss = [];
        for (let i = 1; i <= 10; i++) if (!ix2.includes('.geo-svg path.v' + i + ' {')) miss.push('v' + i);
        if (miss.length) fail('[바이럴] 지도 색 단계가 빠졌다 — ' + miss.join(' ') + ' (계산은 되는데 색이 없어 투명해진다)');
        else console.log('OK: 바이럴 지도 색 — 10단계가 모두 정의돼 있다');

        /* 계산식을 **실제로 돌려** 본다. 정규식만 보면 지수가 뒤집혀도 통과한다. */
        const lvSrc = (ix2.match(/var lv = function \(v\) \{[\s\S]*?\n    \};/) || [''])[0];
        if (!lvSrc) {
          fail('[바이럴] 지도 색 단계 계산식을 찾지 못했다');
        } else {
          const lv = new Function('max', lvSrc + ' return lv;')(412);
          const vals = [412, 331, 268, 96, 88, 74, 41, 23, 1, 0];
          const steps = vals.map(lv);
          /* ①0건은 0단계 ②1건이라도 있으면 1단계 이상(0건과 색이 같아지면 안 된다)
             ③최대는 10단계 ④**값이 크면 단계도 크거나 같다**(단조) — 어느 지수를
             골라도 이것은 깨지지 않아야 하고, 깨지면 지도가 거짓말을 한다. */
          const bad = [];
          if (steps[steps.length - 1] !== 0) bad.push('0건이 0단계가 아니다');
          if (steps[steps.length - 2] < 1) bad.push('1건이 0단계로 떨어진다');
          if (steps[0] !== 10) bad.push('최대값이 10단계가 아니다');
          for (let i = 1; i < vals.length; i++) if (steps[i] > steps[i - 1]) bad.push('단조가 깨진다(' + vals[i] + '>' + vals[i - 1] + ')');
          if (bad.length) fail('[바이럴] 지도 색 단계가 틀리다 — ' + bad.join(' · '));
          else console.log('OK: 바이럴 지도 색 — 단조 · 0건 구분 · 10단계 (' + steps.slice(0, 8).join(' ') + ')');
        }
      }

      /* ⓖ **움직임은 OS 설정을 존중한다.** 어지럼증으로 움직임을 끈 사람에게
         움직이는 화면은 쓸 수 없는 화면이 된다 — 부드러움은 덤이지 기능이 아니다. */
      {
        const bad = [];
        if (!ix2.includes('prefers-reduced-motion: no-preference')) bad.push('CSS 전환이 reduced-motion 밖에 있다');
        if (!ix2.includes('prefers-reduced-motion: reduce')) bad.push('스크립트가 reduced-motion 을 안 본다');
        if (!/function countUp\(/.test(ix2)) bad.push('숫자 카운트업이 없다');
        /* **첫 화면에서만 움직인다** — 필터를 바꿀 때마다 0부터 다시 세면 기다림이 된다 */
        if (!/animated/.test(ix2)) bad.push('첫 렌더만 움직이는 장치가 없다');
        if (bad.length) fail('[바이럴] 움직임 — ' + bad.join(' · '));
        else console.log('OK: 바이럴 움직임 — 첫 화면만 · OS 가 끄라면 끈다');
      }

      /* ⓗ **카드 펼치기** (2026-08-31 사장님: *"클릭하면 1단으로 확대하고 축소하고"*).
         2단을 유지하되 한 장을 눌러 전체 폭으로 키운다 — 3단이냐 2단이냐를 미리 정할
         필요가 없어진다. 되돌아가면 화면에서만 보이는 종류라 검사가 붙든다. */
      {
        const bad = [];
        if (!/function wireZoom\(/.test(ix2)) bad.push('wireZoom 이 없다');
        if (!/^\s+wireZoom\(\);/m.test(ix2)) bad.push('render 가 wireZoom 을 부르지 않는다');
        if (!ix2.includes('.card.wide { grid-column: 1 / -1; }')) bad.push('펼친 카드가 전체 폭을 차지하지 않는다');
        /* **한 번만 붙인다** — `render()` 는 필터를 바꿀 때마다 도는데 그때마다 붙이면
           버튼이 쌓인다(카드는 다시 만들어지지 않는다). */
        /* **「그 문자열이 있는가」로 보면 안 된다** — 가드를 지워도 값을 *설정하는* 줄이
           남아 통과한다(실제로 되돌려 넣었더니 안 물었다). **조건문 안에서 return 을
           막고 있는지**를 본다. 이스케이프 대신 문자 클래스를 쓴다(heredoc·셸이 역슬래시를 먹는다). */
        if (!/if [(][^)]*dataset[.]zoomed[^)]*[)][^;]*return/.test(ix2)) {
          bad.push('버튼이 여러 번 붙는 것을 막지 않는다 — 필터를 바꿀 때마다 버튼이 쌓인다');
        }
        /* **카드 전체를 클릭 대상으로 삼지 않는다** — 지도 칸·매장 막대의 클릭과 부딪힌다.
           전용 버튼만 쓴다(안쪽 요소가 늘 우선이라는 이 저장소의 규칙). */
        if (/\bcard\.onclick\s*=/.test(ix2)) bad.push('카드 전체에 클릭을 걸었다 — 지도·막대 조작과 부딪힌다');
        /* 펼쳤는데 그림이 그대로면 펼친 뜻이 없다 */
        if (!ix2.includes('.card.wide .geo-svg')) bad.push('펼쳐도 지도가 커지지 않는다');
        /* 좁은 화면은 이미 1단이라 펼칠 것이 없다 */
        if (!/@media \(max-width: 720px\) \{ \.zoom/.test(ix2)) bad.push('좁은 화면에서 버튼을 숨기지 않는다');
        if (bad.length) fail('[바이럴] 카드 펼치기 — ' + bad.join(' · '));
        else console.log('OK: 바이럴 카드 펼치기 — 전용 버튼 · 한 번만 · 지도도 함께 커진다');
      }

      /* ⓘ **카드 자리 바꾸기 · 지도 보강** (2026-08-31 사장님 요청 묶음).
         화면에서만 보이는 것들이라 되돌아가면 아무도 모른다. */
      {
        const bad = [];

        /* ① 카드 키 — **제목을 키로 쓰지 않는다.** 이 저장소는 화면 이름을 자주 고치는데
           그때마다 사장님이 맞춰 둔 순서가 통째로 초기화된다. */
        const keys = (ix2.match(/data-card="[a-z]+"/g) || []);
        if (keys.length < 6) bad.push('카드 키(data-card)가 ' + keys.length + '개뿐이다');

        /* ② 끌기 */
        if (!/function wireDrag\(/.test(ix2)) bad.push('wireDrag 이 없다');
        if (!/^\s+wireDrag\(\);/m.test(ix2)) bad.push('render 가 wireDrag 을 부르지 않는다');
        /* **손잡이만 잡는다** — 카드 전체가 클릭 대상이면 지도 칸·매장 막대 조작이 죽는다 */
        if (!/h\.addEventListener\('pointerdown'/.test(ix2)) bad.push('손잡이가 아닌 곳에서 끌기가 시작된다');
        /* **move·up 은 document 가 받는다** — 손잡이에만 걸면 마우스가 벗어난 채 놓였을 때
           끝나는 이벤트가 안 와 화면이 끌린 채로 잠긴다(실측으로 잠겼다) */
        if (!/document\.addEventListener\('pointerup'/.test(ix2)) bad.push('놓기를 document 가 받지 않는다 — 화면이 잠길 수 있다');
        /* **버튼을 뗀 채 움직이면 스스로 풀린다** — pointerup 이 유실돼도 복구된다 */
        if (!/e\.buttons === 0/.test(ix2)) bad.push('놓기 이벤트가 유실됐을 때 스스로 풀리지 않는다');
        /* **놓은 자리를 마지막에 반영** — 빠르게 끌면 중간 이동이 거의 없어 자리가 안 바뀐다 */
        if (!/place\(e\);/.test(ix2)) bad.push('놓은 자리를 마지막으로 반영하지 않는다');

        /* ③ 맨 앞 카드가 전체 폭 — `:first-child` 로는 안 된다(hidden 카드가 첫 자리를 먹는다) */
        if (!ix2.includes('.card.lead { grid-column: 1 / -1; }')) bad.push('맨 앞 카드가 전체 폭이 아니다');
        if (!/function markLead\(/.test(ix2)) bad.push('보이는 첫 카드를 찾는 markLead 가 없다');
        if (/\.two > \.card:first-child \{ grid-column/.test(ix2)) {
          bad.push(':first-child 로 전체 폭을 준다 — hidden 카드가 첫 자리를 먹으면 어긋난다');
        }

        /* ④ 순서 기억 — localStorage 가 막힌 곳이 있어 통째로 감싸야 한다 */
        if (!/viral_card_order/.test(ix2)) bad.push('바꾼 순서를 기억하지 않는다');

        /* ⑤ 지도 글자 선택 끄기 (사장님: *"깜빡깜빡거리는 텍스트"*) */
        if (!/\.geo-svg \{[^}]*user-select: none/.test(ix2)) {
          bad.push('지도에서 글자 선택이 켜져 있다 — 칸을 누르면 캐럿이 깜빡인다');
        }

        /* ⑥ 시·군 이름 전부 (사장님: *"지명을 알아야 공략하기가 좋습니다"*) */
        if (!/GW_MAP\.sigun/.test(ix2)) bad.push('관할 밖 시·군 이름이 지도에 안 뜬다');

        /* ⑦ 지도 아래 매장 목록 — **영업지역으로 묶는다**(사장님: *"원주 춘천 강릉 속초가
           모두 분리되어 있는데 하나로 묶어 주시면 됩니다"*). 칸으로 묶으면 강원이 넷으로 갈린다. */
        if (!/DATA\.byRegion \|\| \{\}, AC = DATA\.areaCells/.test(ix2)) {
          bad.push('지도 아래 목록이 영업지역으로 묶이지 않는다 — 강원이 넷으로 갈린다');
        }
        if (!/data-cells=/.test(ix2)) bad.push('한 지역이 덮는 칸 목록이 없다 — 강원 네 칸이 함께 강조되지 않는다');
        if (!/areaCells/.test(rv)) bad.push('서버가 영업지역→지도 칸 매핑을 내지 않는다');
        if (!/byMapStores/.test(rv)) bad.push('서버가 칸별 매장 목록을 내지 않는다');

        if (bad.length) fail('[바이럴] 카드/지도 — ' + bad.join(' · '));
        else console.log('OK: 바이럴 카드 자리 바꾸기 · 지도 지명·매장 목록 (' + keys.length + '개 카드)');
      }

      /* ⓙ **목록 쪽 나누기** (2026-08-31 사장님: *"20 40 60 80 100개로 보고 나머지는
         페이지화"*). 3,000건을 한 번에 그리면 화면이 끝없이 길어져 아래 카드가 안 보인다. */
      {
        const bad = [];
        if (!/var pageSize = 20, page = 1;/.test(ix2)) bad.push('쪽 크기·쪽 번호가 없다');
        if (!/[20, 40, 60, 80, 100]/.test(ix2)) bad.push('쪽 크기 선택(20·40·60·80·100)이 없다');
        /* **정규식 대신 문자열 포함으로 본다** — 이스케이프가 없으면 heredoc·셸이
           역슬래시를 먹어도 뜻이 안 바뀐다(이 회차에 여섯 번 데었다). */
        if (!ix2.includes('rows.slice(from, from + pageSize)')) bad.push('한 쪽 분량만 그리지 않는다 — 전부 그리면 쪽이 뜻이 없다');
        /* **쪽 수가 줄면 마지막 쪽으로 당긴다** — 안 그러면 필터를 좁혔을 때 빈 화면이 뜬다 */
        if (!ix2.includes('if (page > pages) page = pages;')) bad.push('쪽 수가 줄었을 때 빈 화면이 뜬다');
        /* **필터가 바뀌면 1쪽으로** — 바꾸는 길이 여덟이라 한 곳(서명)에서 본다 */
        if (!/lastSig/.test(ix2)) bad.push('필터를 바꿔도 쪽이 그대로다 — 빈 화면이 뜬다');
        if (bad.length) fail('[바이럴] 목록 쪽 나누기 — ' + bad.join(' · '));
        else console.log('OK: 바이럴 목록 쪽 나누기 — 20~100 · 필터 바뀌면 1쪽');
      }

      /* ⓚ **월별 추이 막대를 눌러 그 달만 본다** (2026-08-31 사장님 요청). */
      {
        const bad = [];
        if (!ix2.includes('var monthFilter')) bad.push('월 필터가 없다');
        /* **작성일에만 건다** — 추이 막대가 작성일 아는 글만 세므로, 발견일까지 걸면
           막대 건수와 목록 건수가 어긋난다(누른 것과 다른 수가 나온다). */
        if (!ix2.includes("if (monthFilter && (!r.dated || String(r.date).slice(0, 7) !== monthFilter)) return false;")) {
          bad.push('월 필터가 작성일 기준이 아니다 — 막대 건수와 목록이 어긋난다');
        }
        /* **0건인 달은 안 걸린다** — 눌러도 빈 목록이 뜨고 「고장」으로 읽힌다 */
        if (!ix2.includes("if (!k || !(bm[k] > 0))")) bad.push('0건인 달도 눌린다 — 빈 목록이 뜬다');
        /* 달을 바꾸면 1쪽으로 */
        if (!ix2.includes("watchFilter, mapFilter, monthFilter,")) bad.push('달을 바꿔도 쪽이 그대로다');
        if (bad.length) fail('[바이럴] 월별 필터 — ' + bad.join(' · '));
        else console.log('OK: 바이럴 월별 필터 — 작성일 기준 · 0건 달 제외 · 1쪽 복귀');
      }




    }

    /* ⑥ 동시 실행 자물쇠 — 두 벌이 같은 시트에 쓰면 같은 글이 두 줄로 들어간다 */
    if (!/LockService\.getScriptLock\(\)/.test(rv) || !/releaseLock\(\)/.test(rv)) {
      fail('[바이럴] 동시 실행 자물쇠가 없다 — 이어달리기 중에 사람이 누르면 중복 줄이 쌓인다');
    } else {
      console.log('OK: 바이럴 자물쇠 — 이어달리기와 손수 수집이 겹쳐도 중복이 안 쌓인다');
    }
  }
}

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
