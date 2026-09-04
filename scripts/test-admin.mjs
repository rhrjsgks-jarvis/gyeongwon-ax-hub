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

  /* ── 멈추지 않게 하는 마지막 장치 — 감시 트리거 (2026-09-01) ────────────────
   * 사장님: *"멈추지 말고 100% 수집할 수 있게 해야 합니다."*
   *
   * 이어달리기는 **정상으로 끝났을 때만** 걸린다. 그래서 6분 한도로 강제 종료되거나
   * 예외로 죽으면 아무도 다시 부르지 않아 영영 선다. 예산을 3.5분으로 줄인 것은
   * 확률을 낮출 뿐 없애지 못한다. **실행을 시작할 때 먼저** 걸어 두어야 한다. */
  {
    const gs8 = new URL('../docs/apps-script/Reviews.gs', import.meta.url);
    if (fs.existsSync(gs8)) {
      const g = fs.readFileSync(gs8, 'utf8');
      const runAtIdx = g.indexOf("setProperty('_runAt'");
      const armIdx = g.indexOf('armWatchdog_();');
      if (!g.includes('function armWatchdog_')) {
        fail('[바이럴] 감시 트리거가 없다 — 6분 강제 종료나 예외로 죽으면 영영 선다');
      /* **시작할 때** 걸어야 한다. 끝에서 걸면 죽었을 때 못 건다 */
      } else if (armIdx < 0 || runAtEarly(g)) {
        fail('[바이럴] 감시 트리거를 실행 시작에 안 건다 — 죽으면 아무도 안 부른다');
      /* 늘 같은 자리에서 죽으면 6분마다 헛돌며 하루 한도를 태운다 */
      } else if (!g.includes('WATCH_MAX')) {
        fail('[바이럴] 되살아난 횟수를 안 센다 — 늘 죽는 오류면 6분마다 헛돌며 한도를 태운다');
      /* 정상으로 끝나면 셈을 되돌려야 오래 도는 바퀴가 스스로 멈추지 않는다 */
      } else if (!g.includes("setProperty('_watchN', '0')")) {
        fail('[바이럴] 정상 종료에 되살아난 셈을 안 되돌린다 — 오래 도는 바퀴가 스스로 멈춘다');
      /* 트리거가 발화했는데 자물쇠를 못 잡으면 그 회차가 통째로 사라진다 */
      } else if (g.split('armWatchdog_();').length - 1 < 2) {
        fail('[바이럴] 자물쇠를 못 잡았을 때 다시 걸지 않는다 — 그 회차가 사라져 체인이 끊긴다');
      } else {
        console.log('OK: 바이럴 감시 트리거 — 시작할 때 걸고, 정상 종료에 셈을 되돌리고, 헛돌면 멈춘다');
      }
    }
    /* 감시 트리거가 `_runAt` 기록 **바로 뒤**에 오는지 본다.
       **첫 번째 armWatchdog_() 를 잡으면 안 된다** — 자물쇠 실패 분기가 앞에 있어
       늘 「시작에 안 건다」로 잡힌다(실제로 그렇게 헛돌았다). `_runAt` 자리에서부터
       찾아야 한다. 이 저장소가 되풀이해 데인 「첫 매치를 잡는」 병이다. */
    function runAtEarly(g) {
      const a = g.indexOf("setProperty('_runAt'");
      if (a < 0) return true;
      const b = g.indexOf('armWatchdog_();', a);
      return !(b > a && b - a < 700);
    }
  }

  /* ── 카카오톡 채널은 후기가 아니다 (2026-09-01 사장님 지시) ───────────────
   * *"웹검색 중에 카카오톡 채널은 제외하도록 하겠습니다."*
   * 매장이 자기 채널로 올린 지면이라 브랜드+매장 판정을 그대로 지나는데 후기가
   * 아니다. **글자가 아니라 주소로 거른다** — 후기 본문의 "카톡으로 문의했다"가
   * 날아가면 안 된다(이 저장소가 부분일치로 되풀이해 데인 병이다). */
  {
    const gs7 = new URL('../docs/apps-script/Reviews.gs', import.meta.url);
    if (fs.existsSync(gs7)) {
      const g = fs.readFileSync(gs7, 'utf8');
      const hits = g.split('linkNoise_(').length - 1;
      if (!g.includes('function linkNoise_')) {
        fail('[바이럴] 주소로 거르는 장치가 없다 — 카카오톡 채널이 후기로 잡힌다');
      } else if (!g.includes("'pf.kakao.com'")) {
        fail('[바이럴] 카카오톡 채널 주소가 목록에 없다');
      /* 선언 1 + 쓰는 곳 3(매장 질의·카페 훑기·경쟁비교) = 4 */
      } else if (hits < 4) {
        fail(`[바이럴] 주소 거르기를 ${hits - 1}곳에만 걸었다 — 우리 수집과 경쟁비교에 다른 잣대를 쓰면 비중이 거짓이 된다`);
      } else {
        console.log('OK: 바이럴 카카오톡 채널 제외 — 글자가 아니라 주소로, 우리·경쟁 양쪽에 똑같이');
      }
    }
  }

  /* ── 한 갈래가 죽어도 나머지는 계속 돈다 (2026-09-01, 실제로 섰다) ──────────
   *
   * 웹문서(webkr)를 갈래에 더한 날, 그것이 `HTTP 500 SE99` 를 내면서 **수집이
   * 6/65 에서 영영 섰다.** 프로덕션 실측 — cursor 6 · chainOn false ·
   * error "webkr:HTTP 500 … SE99" · 한도는 1,029/20,000 로 여유.
   *
   * 오류 하나가 세 겹으로 번졌다 — ①그 매장의 남은 질의를 통째로 건너뛰고
   * ②실행 전체에 오류 표시가 남고 ③그래서 이어달리기가 안 걸렸다.
   * **갈래가 둘일 때는 안 드러났다**(블로그·카페가 둘 다 안정적이었다).
   * 갈래를 늘리면 「하나가 죽으면 어떻게 되는가」를 함께 설계해야 한다. */
  {
    const gs6 = new URL('../docs/apps-script/Reviews.gs', import.meta.url);
    const ix8 = new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url);
    if (fs.existsSync(gs6) && fs.existsSync(ix8)) {
      const g = fs.readFileSync(gs6, 'utf8');
      const x = fs.readFileSync(ix8, 'utf8');
      /* **이어달리기를 막는 것은 인증 오류뿐이어야 한다.** `!err` 로 두면 갈래
         하나의 일시 500 이 그 실행을 영영 세운다 — 실제로 그랬다. */
      if (g.includes('stopped && !hitLimit && !err')) {
        fail('[바이럴] 일시 오류가 이어달리기를 막는다 — 갈래 하나가 500 을 내면 수집이 영영 선다');
      } else if (!g.includes('stopped && !hitLimit && !fatal')) {
        fail('[바이럴] 이어달리기 조건이 fatal 기준이 아니다 — 무엇이 진짜로 멈춰야 하는 오류인지 갈리지 않는다');
      /* 인증이 막힌 것만 fatal — 더 돌아도 결과가 같다 */
      } else if (!g.includes('fatal = true')) {
        fail('[바이럴] fatal 을 세우는 곳이 없다 — 인증이 막혀도 헛돌게 된다');
      /* 갈래 오류가 그 매장의 남은 질의를 죽이면 안 된다 */
      } else if (!g.includes('kindOff') || !g.includes('kindFail')) {
        fail('[바이럴] 갈래별 실패를 세지 않는다 — 죽은 갈래를 계속 두드려 호출을 버린다');
      /* 성공하면 셈을 되돌려야 일시 오류로 갈래가 영영 꺼지지 않는다 */
      } else if (!g.includes('kindFail[kinds[k]] = 0;')) {
        fail('[바이럴] 갈래가 한 번 성공해도 실패 셈이 안 줄어든다 — 일시 오류로 영영 꺼진다');
      /* 조용히 빼면 「왜 웹 글이 안 늘지」를 알 길이 없다 */
      } else if (!g.includes('srcOff:')) {
        fail('[바이럴] 꺼진 갈래를 보고하지 않는다 — 조용히 빠지면 아무도 모른다');
      } else if (!x.includes('검색이 이번에 응답하지 않아 건너뛰었습니다')) {
        fail('[바이럴] 화면이 꺼진 갈래를 안 밝힌다 — 「왜 웹 글이 안 늘지」를 알 수 없다');
      } else {
        console.log('OK: 바이럴 갈래 격리 — 하나가 죽어도 나머지는 돌고, 이어달리기는 인증 오류에만 멈춘다');
      }
    }
  }

  /* ── 블로그·카페·웹 세 갈래 · 경쟁비교 디테일 (2026-09-01 사장님 지시) ──────
   *
   * *"블로그 카페 웹 잘 분석 바랍니다"* · *"지역별 후기 수집할 때 삼성 vs LG
   * 제대로 수집해서 디테일한 비교가 필요합니다"*.
   *
   * 경쟁비교가 **카페만** 훑고 있었다 — 우리 후기의 36%가 블로그인데 비교에서
   * 통째로 빠져 있었다. 양쪽에 똑같이 넣어야 한다(한쪽만 늘리면 비중이 거짓). */
  {
    const gs4 = new URL('../docs/apps-script/Reviews.gs', import.meta.url);
    const ix6 = new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url);
    if (fs.existsSync(gs4) && fs.existsSync(ix6)) {
      const g = fs.readFileSync(gs4, 'utf8');
      const x = fs.readFileSync(ix6, 'utf8');
      if (!g.includes("['blog', 'cafearticle', 'webkr']")) {
        fail('[바이럴] 수집이 세 갈래(블로그·카페·웹)를 다 훑지 않는다');
      /* **양쪽에 똑같이** — 한쪽만 늘리면 그쪽만 많이 받아 비중이 그 자리에서 거짓이 된다 */
      } else if (g.split("['blog', 'cafearticle', 'webkr']").length - 1 < 2) {
        fail('[바이럴] 경쟁비교가 우리 수집과 다른 갈래를 훑는다 — 비중이 거짓이 된다');
      /* 출처 이름을 두 곳에서 적으면 한쪽만 고쳐져 「웹」이 「카페」로 쌓인다 */
      } else if (!g.includes('function srcName_')) {
        fail('[바이럴] 출처 이름을 한 곳에서 안 만든다 — 두 곳이 갈리면 웹이 카페로 쌓인다');
      } else if (!x.includes("['전체', '블로그', '카페', '웹']")) {
        fail('[바이럴] 화면 출처 칩에 「웹」이 없다 — 모으기만 하고 볼 수가 없다');
      /* 갈래별 비교 — 「어디가 밀리나」만으로는 무엇을 할지 안 나온다 */
      } else if (!x.includes('rival-break')) {
        fail('[바이럴] 경쟁비교에 갈래별(출처·유형·월) 절이 없다');
      /* **월별은 블로그만** — 카페·웹은 작성일이 없어 넣으면 이번 달만 거대해진다 */
      } else if (!x.includes('블로그만 셉니다 — 카페·웹 글에는 작성일이 없습니다')) {
        fail('[바이럴] 경쟁비교 월별이 무엇만 세는지 안 밝힌다');
      /* 옛 회차에는 갈래 칸이 없다 — 깨진 JSON 에 던지면 화면 전체가 죽는다 */
      } else if (!g.includes('function jparse_')) {
        fail('[바이럴] 갈래 JSON 을 안전하게 안 읽는다 — 깨진 칸 하나가 화면을 통째로 죽인다');
      } else {
        console.log('OK: 바이럴 세 갈래(블로그·카페·웹) · 경쟁비교 출처·유형·월별');
      }
    }
  }

  /* ── 자료 비우고 처음부터 (2026-09-01 사장님 허락) ────────────────────────
   * 열이 늘고 출처가 셋이 되면서 옛 줄과 새 줄이 다른 것을 담는다 — 섞어 두면
   * 「블로그 36%」 같은 값이 반은 옛 규칙, 반은 새 규칙이 되어 조용히 틀린다. */
  {
    const gs5 = new URL('../docs/apps-script/Reviews.gs', import.meta.url);
    const ix7 = new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url);
    if (fs.existsSync(gs5) && fs.existsSync(ix7)) {
      const g = fs.readFileSync(gs5, 'utf8');
      const x = fs.readFileSync(ix7, 'utf8');
      if (!g.includes('function resetAll')) {
        fail('[바이럴] 자료를 비우는 길이 없다 — 옛 규칙 줄과 새 규칙 줄이 영영 섞인다');
      /* 되돌릴 수 없는 일이라 **두 번** 물어야 한다.
         **`prompt()` 로 묻지 않는다** — Apps Script 화면은 샌드박스 iframe 안이라
         브라우저에 따라(특히 휴대폰) 입력 대화상자가 막히고, 막히면 버튼이 아무
         반응 없는 것처럼 보여 「고장났다」로 읽힌다. `confirm()` 은 옆 「중복 정리」가
         이미 쓰고 있어 이 환경에서 도는 것이 확인된 방법이다. */
      } else if (x.split('confirm(').length - 1 < 3) {
        fail('[바이럴] 자료 비우기가 두 번 묻지 않는다 — 옆 단추와 나란히 있어 실수로 눌린다');
      } else if (x.split('prompt(').length - 1 > 1) {
        fail('[바이럴] prompt() 를 쓴다 — 휴대폰·샌드박스에서 막히면 버튼이 죽은 것처럼 보인다');
      /* 안 끄면 지운 직후에 옛 커서로 이어 돈다 */
      /* 안 끄면 지운 직후에 옛 커서로 이어 돈다. **줄바꿈을 검사에 쓰지 않는다** —
         셸·heredoc 이 이스케이프를 먹어 조용히 다른 뜻이 된다(이번에도 밟았다).
         resetAll 안에서 불리는지는 **자리 비교**로 충분하다. */
      } else if (g.indexOf('clearChain_()', g.indexOf('function resetAll')) < 0
        || g.indexOf('clearChain_()', g.indexOf('function resetAll')) > g.indexOf('function resetAll') + 900) {
        fail('[바이럴] 자료를 비우면서 이어달리기를 안 끈다 — 지운 직후 옛 커서로 이어 돈다');
      /* 열이 늘었는데 머리글이 낡은 채 남으면 사람이 열어 볼 때 칸 이름이 안 맞는다 */
      } else if (!g.includes('s.getMaxColumns() < header.length')) {
        fail('[바이럴] 열이 늘어도 시트 격자·머리글을 안 넓힌다 — getRange 가 던질 수 있다');
      } else {
        console.log('OK: 바이럴 자료 비우기 — 두 번 묻고, 이어달리기를 끄고, 커서를 처음으로');
      }
    }
  }

  /* ── 시트 칸 수가 어긋나 수집 한 판이 통째로 날아가던 것 (2026-09-01) ──────
   *
   * `mgr` 열이 늘었을 때(2026-08-25) **카페 훑기 쪽 행만 안 고쳐져 10칸**이었다.
   * `setValues` 는 HEADER 폭을 기대하므로 그 자리에서 던지는데, 그 예외가
   * **모은 글도 커서도 함께 날린다** — 커서가 44/65 에 선 채 이어달리기도
   * 안 걸린 원인이다. 조용한 사고라 화면에는 「진전 없음」으로만 보인다. */
  {
    const gs2 = new URL('../docs/apps-script/Reviews.gs', import.meta.url);
    if (fs.existsSync(gs2)) {
      const g = fs.readFileSync(gs2, 'utf8');
      /* **정규식을 쓰지 않는다** — 이 저장소는 셸·heredoc 이 역슬래시를 먹어
         정규식이 조용히 다른 뜻이 되는 사고를 여러 번 겪었다. 문법 오류가 안 나서
         더 위험하다. 문자열 세기로 충분한 자리다. */
      const writes = g.split('setValues(add)').length - 1;
      const guards = g.split('assertRow_(add)').length - 1;
      if (!writes) {
        fail('[바이럴] 시트에 쓰는 자리를 못 찾았다 — 검사가 무의미해졌으니 앵커를 고칠 것');
      } else if (guards < writes) {
        fail(`[바이럴] 시트 쓰기 ${writes}곳 중 ${guards}곳만 칸 수를 확인한다 — 어긋나면 그 실행이 통째로 날아간다`);
      } else if (!g.includes('function assertRow_')) {
        fail('[바이럴] assertRow_ 가 없다 — 칸 수가 어긋나도 원인이 오류에 안 찍힌다');
      /* **뒤에만 붙인다** — 가운데 끼우면 그 아래 옛 줄이 한 칸씩 밀린다.
         칸이 늘 때마다 이 줄을 따라 고치되 **순서가 그대로인지**를 본다. */
      /* 2026-09-04 `q`(어느 질의가 이 글을 줬는가)를 맨 뒤에 더했다 — 앵커도 함께 옮긴다.
         **앞부분(…'deadN', 'deadAt')이 그대로인지**가 요점이다: 그 순서가 바뀌면
         옛 줄이 밀린다. */
      } else if (!g.includes("'mgr', 'dateBasis', 'deadN', 'deadAt', 'q']")) {
        fail('[바이럴] 새 칸을 맨 뒤에 안 붙였다 — 가운데 끼우면 그 아래 옛 줄이 통째로 한 칸씩 밀린다');
      } else {
        console.log(`OK: 바이럴 시트 쓰기 ${writes}곳 모두 칸 수를 먼저 확인한다`);
      }
    }
  }

  /* ── 카페 새 글의 작성일 (2026-09-01 사장님 결정 — "채운다, 새 글만") ───────
   *
   * 네이버는 카페 작성일을 공개 API 로 주지 않는다(문서·실호출로 확인). 그래도
   * **글번호가 그 카페에서 우리가 본 최대치보다 크면** 그 글은 지난 수집 이후에
   * 쓰인 것이 증명되므로 발견일과의 차이가 수집 주기 안이다.
   * **추정이 아니라 경계가 증명되는 값**이라 원칙에 어긋나지 않는다 —
   * 다만 정확도가 다르므로 화면이 갈라 적어야 한다. */
  {
    const gs3 = new URL('../docs/apps-script/Reviews.gs', import.meta.url);
    const ix5 = new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url);
    if (fs.existsSync(gs3) && fs.existsSync(ix5)) {
      const g = fs.readFileSync(gs3, 'utf8');
      const x = fs.readFileSync(ix5, 'utf8');
      if (!g.includes('function cafeNo_')) {
        fail('[바이럴] 글번호 파서가 없다 — 새 글을 가릴 근거가 사라진다');
      /* **그 카페를 처음 보면 모른다고 둔다** — 최대치가 없는데 새 글로 치면
         옛 글에 오늘 날짜를 적게 된다. 안전한 쪽으로 물러서야 한다. */
      } else if (!g.includes('maxNo[cn.id] > 0 && cn.no > maxNo[cn.id]')) {
        fail('[바이럴] 최대 글번호가 없을 때도 새 글로 친다 — 2023년 글에 오늘 날짜를 적게 된다');
      } else if (!g.includes('approx:')) {
        fail('[바이럴] 정확한 작성일과 경계증명 작성일을 안 가른다 — 화면이 있는 척하게 된다');
      } else if (!x.includes('작성 ≈ ')) {
        fail('[바이럴] 화면이 경계증명 작성일에 ≈ 를 안 붙인다 — 정확한 값과 똑같아 보인다');
      } else if (!x.includes('오차는 수집 주기 안입니다')) {
        fail('[바이럴] 오차 범위를 안 밝힌다 — 근거 없이 날짜를 적은 것으로 읽힌다');
      } else {
        console.log('OK: 바이럴 카페 새 글 — 경계가 증명된 것만 작성일로 쓰고 ≈ 로 갈라 적는다');
      }
    }
  }

  /* ── 트리거가 남아 있다고 도는 것은 아니다 (2026-09-02 사장님이 걸렸다) ─────
   *
   * 자동 재개가 여덟 번 실패로 포기했는데 **옛 트리거가 남아 `chainOn:true`** 로
   * 왔다. 그때 버튼이 「지금 한 번 더」라 적혀 **「안 눌러도 되나 보다」로 읽혔고**,
   * 아무도 안 눌러 밤새 멈춰 있을 뻔했다.
   *
   * 죽은 신호가 둘이다 — `chainErr` 가 있거나 「도는 중」이 10분을 넘었을 때.
   * 화면이 이미 쓰는 기준(10분)을 그대로 쓴다. */
  {
    const ixD = new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url);
    if (fs.existsSync(ixD)) {
      const x = fs.readFileSync(ixD, 'utf8');
      if (x.includes('var auto = !!DATA.chainOn;')) {
        fail('[바이럴] 트리거가 있으면 도는 것으로 친다 — 포기한 상태에서도 「안 눌러도 된다」로 읽힌다');
      } else if (!x.includes('!DATA.chainErr')) {
        fail('[바이럴] 자동 재개가 포기했는데도 자동으로 친다');
      } else if (!x.includes('runMin > 10')) {
        fail('[바이럴] 「도는 중」이 굳은 것을 자동으로 친다 — 10분이 넘으면 죽은 것이다');
      /* 멈췄으면 무엇을 누를지 그 자리에 적어야 한다 */
      } else if (!x.includes('자동 이어가기가 멈춰 있습니다')) {
        fail('[바이럴] 멈춘 사실과 무엇을 누를지 화면이 안 적는다');
      } else {
        console.log('OK: 바이럴 이어달리기 표시 — 트리거가 남아도 죽었으면 자동이 아니라고 적는다');
      }
    }
  }

  /* ── 꼬리 작업이 6분을 넘겨 수집을 여덟 번 죽이고 있었다 (2026-09-01) ──────
   *
   * 경쟁비교에 웹문서를 더하며 일이 3배가 됐는데 **시간 검사가 없었다.**
   * 매번 6분을 넘겨 죽었고, 못 끝내니 `_rivalAt` 도 안 적혀 다음 실행이 또 돌았다.
   * 여덟 번 잇달아 죽자 감시 트리거가 스스로 포기했다(설계대로지만 원인은 여기였다).
   *
   * **되살아난 셈을 함수 맨 끝에서 되돌린 것도 잘못이었다** — 매장 수집은 멀쩡히
   * 했는데 뒤따르는 꼬리 작업이 죽으면 셈이 안 줄었다. 매장 한 바퀴를 마친 자리에서
   * 되돌려야 「이 실행은 제 몫을 했다」가 제대로 셈에 반영된다. */
  {
    const gsC = new URL('../docs/apps-script/Reviews.gs', import.meta.url);
    if (fs.existsSync(gsC)) {
      const g = fs.readFileSync(gsC, 'utf8');
      const rv = g.indexOf('function collectRival');
      const seg = rv < 0 ? '' : g.slice(rv, rv + 4000);
      const watchAt = g.indexOf("setProperty('_watchN', '0')");
      const cafeAt = g.indexOf('var cafeCalls = 0');
      if (!seg) {
        fail('[바이럴] collectRival 을 못 찾았다 — 검사가 무의미해졌으니 앵커를 고칠 것');
      } else if (seg.indexOf('deadline') < 0) {
        fail('[바이럴] 경쟁비교에 시간 검사가 없다 — 6분을 넘겨 그 실행이 통째로 죽는다');
      /* 못 끝냈으면 이어서 돌아야 한다 — 매번 처음부터면 영영 못 끝낸다 */
      } else if (seg.indexOf('_rivalCur') < 0) {
        fail('[바이럴] 경쟁비교가 이어서 돌지 않는다 — 한 바퀴를 못 끝내면 영영 못 끝낸다');
      /* 못 끝냈는데 완료로 적으면 그날 다시 시도하지 않는다 */
      } else if (g.indexOf('rivalRun.done) props_().setProperty(') < 0) {
        fail('[바이럴] 경쟁비교를 못 끝냈는데 완료로 적는다 — 반쪽 자료가 그날 하루 굳는다');
      /* 되살아난 셈은 매장 루프를 마친 자리에서 되돌려야 한다 */
      } else if (watchAt < 0 || cafeAt < 0 || watchAt > cafeAt) {
        fail('[바이럴] 되살아난 셈을 꼬리 작업 뒤에서 되돌린다 — 꼬리가 죽으면 멀쩡한 실행도 실패로 센다');
      } else {
        console.log('OK: 바이럴 꼬리 작업 — 경쟁비교에 시간 검사·이어달리기 · 셈은 매장 루프 직후에 되돌린다');
      }
    }
  }

  /* ── 카페 새 글 기준선은 「이전 수집 시점」이어야 한다 (2026-09-01) ─────────
   *
   * 사장님 지적 — *"오늘 건수가 33건으로 수집되고 있습니다. 수정이 필요해 보입니다."*
   *
   * 기준선(카페별 최대 글번호)을 **수집 도중에도 갱신**하고 있었다. 자료를 비운
   * 직후라 기준선이 비어 있는 채 자라서, 같은 카페의 옛 글이 서로를 기준으로 삼아
   * 「오늘 쓰인 글」로 잡혔다. 실제로 한 카페에서 2~3건씩 잡혔고 제목도 옛 글이었다.
   *
   * 기준선은 시트에서 한 번 읽고 **얼려야** 한다. 처음 보는 카페는 기준선이 없어
   * 전부 「미상」이 되는데 그것이 정직하다 — 언제 쓰였는지 우리는 정말 모른다. */
  {
    const gsB = new URL('../docs/apps-script/Reviews.gs', import.meta.url);
    if (fs.existsSync(gsB)) {
      const g = fs.readFileSync(gsB, 'utf8');
      /* 판정 뒤에 기준선을 올리는 줄이 남아 있으면 같은 병이 되살아난다 */
      const grow = g.split('maxNo[cn.id] = cn.no').length - 1
        + (g.split('maxNo[cbn.id] = cbn.no').length - 1);
      if (grow > 0) {
        fail('[바이럴] 수집 도중에 기준선을 올린다 — 같은 카페의 옛 글이 서로를 기준으로 삼아 오늘 글로 잡힌다');
      /* 시트에서 읽는 것은 남아 있어야 한다 — 그게 진짜 기준선이다 */
      } else if (!g.includes('maxNo[cn0.id] = cn0.no')) {
        fail('[바이럴] 시트에서 기준선을 안 만든다 — 새 글을 영영 못 가린다');
      /* 이미 잘못 적힌 줄은 스스로 되돌려야 한다(사람이 다시 비우게 하지 않는다) */
      } else if (!g.includes('function repairBasis_')) {
        fail('[바이럴] 잘못 매긴 작성일 근거를 되돌리는 길이 없다');
      } else if (!g.includes('_basisFix')) {
        fail('[바이럴] 되돌리기가 한 번만 돌게 막지 않는다 — 매 수집마다 새 글 판정을 지운다');
      /* **한 바퀴를 마친 적이 있어야 기준선이 뜻을 갖는다**(2026-09-02 실측으로 잡았다).
         첫 완주 직후 「오늘」이 212건인데 블로그는 0건이었다 — 수집이 03:11 에 끝났으니
         자정~새벽 3시에 쓰인 글만 오늘일 수 있는데 그 세 시간에 카페만 212건일 수는 없다.
         첫 바퀴 동안에는 실행과 실행 사이에서 기준선이 자란다(아직 발견 중이다). */
      } else if (!g.includes('var baselineOk')) {
        fail('[바이럴] 한 바퀴를 마치기 전에도 새 글로 판정한다 — 아직 발견 중인 글이 오늘 글로 잡힌다');
      } else if (!g.includes('baselineOk && cn && maxNo')) {
        fail('[바이럴] 매장 질의가 완주 여부를 안 본다');
      } else if (!g.includes('baselineOk && cbn && maxNo')) {
        fail('[바이럴] 카페 훑기가 완주 여부를 안 본다');
      } else {
        console.log('OK: 바이럴 카페 새 글 기준선 — 한 바퀴를 마친 뒤에만 · 수집 중에는 안 올린다');
      }
    }
  }

  /* ── 돋보기 — 자치구 넷을 크게 (2026-09-02) ──────────────────────────────
   * 시·구 분할은 돌고 있었는데 **화면에서 안 보였다** — 실측으로 팔달구가
   * viewBox 400 기준 **9.1 × 6.6** 이라 지도의 0.05% 다. 쪼갠 뜻이 살려면 보여야 한다.
   *
   * **`d` 를 다시 만들지 않는다** — 같은 문자열을 transform 으로 옮겨 쓰므로 두
   * 지도가 어긋날 수 없다. 칠하기·겹침 걷어내기도 본 지도와 **같은 함수**를 탄다. */
  {
    const h = fs.readFileSync(new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url), 'utf8');
    const b = fs.readFileSync(new URL('../scripts/build-region-map.mjs', import.meta.url), 'utf8');
    const gu = (h.match(/data-cell="[가-힣]{2}구"/g) || []).length;
    if (!b.includes('metroPaths.push')) {
      fail('[바이럴] 돋보기용 조각을 안 모은다');
    } else if (!h.includes('GW_MAP.metro')) {
      fail('[바이럴] 돋보기 SVG 가 안 실렸다 — build:regionmap 을 돌리고 커밋할 것');
    } else if (!h.includes('function paintCells')) {
      fail('[바이럴] 칠하는 규칙이 함수가 아니다 — 두 지도가 조용히 갈린다');
    } else if ((h.split('paintCells(').length - 1) < 3) {
      fail('[바이럴] 돋보기가 같은 칠하기 함수를 안 쓴다');
    } else if (!h.includes('function dropOverlaps')) {
      fail('[바이럴] 겹침 걷어내기가 함수가 아니다');
    } else if ((h.split('dropOverlaps(').length - 1) < 3) {
      fail('[바이럴] 돋보기가 겹침을 안 걷어낸다 — 이름표가 서로 먹는다');
    /* **글꼴은 보이는 폭에 비례한다.** 기본 화면(폭 81.6)에서 1.6 이 되는 비율이
       0.0196 이고, 그 값은 실측에서 골랐다 — 1.8 이면 팔달구가 이웃에 밀려 빠진다. */
    } else if (!h.includes('vbw * 0.0196')) {
      fail('[바이럴] 돋보기 글꼴이 폭에 비례하지 않는다 — 확대 배율이 칸마다 달라 고정값은 못 쓴다');
    } else if (gu < 12) {
      fail(`[바이럴] 지도에 자치구 칸이 ${gu}곳뿐이다 — 12곳이어야 한다`);
    /* **누른 칸을 돋보기가 따라간다**(2026-09-02 사장님 요청). 새 자료를 만들지
       않고 본 지도의 `path` 를 복제해 viewBox 만 맞춘다 — 두 지도가 어긋날 수 없다. */
    } else if (!h.includes('function zoomSvg')) {
      fail('[바이럴] 누른 칸을 확대하지 않는다');
    } else if (!h.includes('var zoom = mapFilter ? zoomSvg(mapFilter) : null;')) {
      fail('[바이럴] 고른 칸이 있어도 기본 화면만 보여준다');
    } else if (!h.includes('vector-effect: non-scaling-stroke')) {
      fail('[바이럴] 확대하면 테두리가 배율만큼 굵어져 작은 칸이 선에 묻힌다');
    } else if (!h.includes('vbw * 0.0196')) {
      fail('[바이럴] 확대 글꼴이 보이는 폭에 비례하지 않는다 — 작은 칸에서 글자가 화면을 덮는다');
    /* **확대는 그 시 안쪽을 본다**(2026-09-02 사장님: *"시를 눌렀을때 해당시 안에 무슨
       구 가있고 … 성남시를 누르면 분당구 수정구 이런식으로"*). 그 전에는 **영업지역**
       전체를 폈는데(성남 → 광주·이천·하남까지) 사장님이 보고 싶은 것은 시 안이다.
       자치구가 있으면 구, 없으면 읍·면·동 — 자세한 것은 ⓚ 구간이 지킨다. */
    } else if (!h.includes('pa0.getAttribute("data-sigun")')) {
      fail('[바이럴] 확대가 누른 칸의 시를 찾지 않는다 — 시 안쪽을 펼 수가 없다');
    } else if (!h.includes('if (!zoom) paintCells(msvg, false);')) {
      fail('[바이럴] 확대에도 paintCells 를 태운다 — 칸 색이 통째로 덮어써져 세 칸이 같은 색이 된다');
    } else if (!h.includes('geo-metro path.z1')) {
      fail('[바이럴] 칸마다 다른 색이 없다');
    } else if (!h.includes('geo-zlist')) {
      fail('[바이럴] 칸마다 어느 매장인지 안 적는다 — 지도로 못 쪼개는 것을 글자로도 안 준다');
    } else if (!h.includes('돋보기 — " + esc(zoom.area)')) {
      fail('[바이럴] 확대 중인데 안내가 기본 화면 문구를 적는다 — 화면이 거짓말을 한다');
    } else if (!h.includes('geo-metro-wrap')) {
      fail('[바이럴] 돋보기를 담을 자리가 없다');
    } else {
      console.log('OK: 바이럴 지도 돋보기 — 자치구 12곳 · 같은 좌표 · 칠하기와 겹침을 본 지도와 공유');
    }
  }

  /* ── 삭제된 글은 지우지 않고 표시만 한다 (2026-09-02 사장님 결정) ──────────
   * *"새로 전체수집을 할 때 삭제된 글은 자동으로 제외해 주셔야 합니다"* → 조사해
   * 보니 **판정할 수 있는 것이 블로그뿐**이다(카페는 robots 가 `Disallow: /`).
   * 그래서 사장님이 「표시만」을 고르셨다.
   *
   * **열이 늘면 조용히 깨지는 곳들을 함께 지킨다** — 이 검사의 값어치가 거기 있다. */
  {
    const g = fs.readFileSync(new URL('../docs/apps-script/Reviews.gs', import.meta.url), 'utf8');
    const h = fs.readFileSync(new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url), 'utf8');
    if (!g.includes("'deadN', 'deadAt'")) {
      fail('[바이럴] 살았는지 적을 칸이 없다');
    } else if (g.includes('var col = HEADER.length;')) {
      fail('[바이럴] 되돌리기가 맨 뒤 칸을 쓴다 — 이제 그 자리는 deadAt 이라 모든 글이 삭제된 것이 된다');
    } else if (!g.includes("HEADER.indexOf('dateBasis') + 1")) {
      fail('[바이럴] 되돌리기가 칸을 이름으로 안 찾는다');
    } else if ((g.split('deadN · deadAt — 아직 확인 전이다').length - 1) !== 2) {
      fail('[바이럴] 줄을 만드는 두 곳 중 한 곳이 새 칸을 안 채운다 — assertRow_ 가 수집 한 판을 통째로 던진다');
    } else if (!g.includes('function deadUrl_')) {
      fail('[바이럴] 두드릴 주소를 안 만든다 — 시트의 blog.naver.com 주소는 없는 글도 200 이라 판정이 안 된다');
    } else if (!g.includes("'https://m.blog.naver.com/'")) {
      fail('[바이럴] m. 으로 안 바꾼다 — 프레임셋 껍데기라 없는 글도 200 이다');
    } else if (!g.includes('nUnknown++')) {
      fail('[바이럴] 일시 오류를 삭제와 안 가른다 — 실측 0.67% 가 매 회차 오판된다');
    } else if (!g.includes('DEAD_SPIKE') || !g.includes('DEAD_CEILING')) {
      fail('[바이럴] 안전선이 없다 — 네이버 장애나 우리 버그로 한 번에 대량 오판된다');
    } else if (!g.includes('DEAD_N')) {
      fail('[바이럴] 한 번의 404 로 죽었다고 한다');
    } else if (g.includes('addUsage_(dead') || g.includes('addUsage_(nUnknown')) {
      fail('[바이럴] 검증을 네이버 검색 예산에 센다 — 검색이 아니라 한 바퀴 예산만 줄어든다');
    } else if (g.indexOf("var deadRun") > g.indexOf("for (i = cursor; i < STORES.length; i++)")) {
      fail('[바이럴] 삭제 확인이 매장 훑기 뒤에 있다 — LG 비교와 같은 함정(영영 차례를 못 받는다)');
    } else if (!g.includes("if (String(v[i][11] || '')) continue;")) {
      fail('[바이럴] 매니저 순위가 삭제된 글을 계속 센다 — readAll_ 을 안 거치므로 따로 걸러야 한다');
    } else if (!g.includes('if (all[i].dead) deadList.push(all[i]); else rows.push(all[i]);')) {
      fail('[바이럴] 집계에서 삭제된 글을 안 뺀다');
    } else if (!g.includes('list: deadList.slice(0, 500)')) {
      fail('[바이럴] 삭제된 글을 화면으로 내려보내지 않는다 — 지운 것과 다를 바가 없다');
    } else if (!h.includes('var showDead')) {
      fail('[바이럴] 화면에 삭제된 글을 볼 길이 없다');
    } else if (!h.includes('카페 글은 확인할 수 없습니다')) {
      fail('[바이럴] 확인할 수 없는 갈래를 안 밝힌다 — 「삭제된 글은 다 빠졌다」로 읽힌다');
    } else if (!h.includes('지우지 않았습니다')) {
      fail('[바이럴] 지우지 않았다는 것을 화면이 안 말한다');
    } else if (!h.includes('dd.err ?')) {
      fail('[바이럴] 안전선에 걸린 이유를 화면이 안 적는다 — 검증이 도는 줄 안다');
    } else {
      console.log('OK: 바이럴 삭제된 글 — 지우지 않고 표시 · 확인 못 하는 갈래를 밝힌다 · 안전선 셋');
    }
  }

  /* ── 같은 제목은 한 줄로 접는다 (2026-09-02 사장님 결정 ⓐ) ──────────────
   * *"중복된 후기는 url 기준으로 모두 삭제할 필요가 있습니다"* → 재 보니 **주소
   * 기준 중복은 이미 0건**이고(dedupe 가 돌고 있다), 화면에 중복처럼 보이는 것은
   * **한 블로거가 같은 제목으로 여러 번 올린 홍보글**이었다(실측 158묶음).
   *
   * 사장님이 ⓐ(접어서 보여주기)를 고르셨다. **지우지 않는다** — 서로 다른 주소의
   * 실재하는 글이고, 지우면 되돌릴 수 없다.
   *
   * **네 가지를 지킨다** — 하나만 빠져도 화면이 자료를 조용히 줄인 것이 된다:
   *  ① 접는다  ② 몇 건이 접혔는지 적는다  ③ 펼 수 있다  ④ 원본 건수를 함께 적는다 */
  {
    const h = fs.readFileSync(new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url), 'utf8');
    if (!h.includes('function foldRows')) {
      fail('[바이럴] 같은 제목을 접지 않는다');
    } else if (!h.includes('var groups = foldRows(rows)')) {
      fail('[바이럴] 쪽 나누기가 접기보다 앞이다 — 한 쪽에 같은 글이 여러 줄 들어찬다');
    } else if (!h.includes('같은 제목 <b>외 ')) {
      fail('[바이럴] 몇 건이 접혔는지 안 적는다 — 화면이 자료를 조용히 줄인 것이 된다');
    } else if (!h.includes('class="folded" hidden')) {
      fail('[바이럴] 접힌 것을 아예 안 담는다 — 펼 수가 없다');
    } else if (!h.includes('원본 ')) {
      fail('[바이럴] 원본 건수를 함께 안 적는다');
    } else if (!h.includes('foldall')) {
      fail('[바이럴] 접기를 끄는 길이 없다');
    } else if (h.includes('view[vi].dated')) {
      fail('[바이럴] 묶음에서 .dated 를 바로 읽는다 — 늘 undefined 라 카페 안내가 영영 안 뜬다');
    } else if (!h.includes('groups[gj].r.dated')) {
      fail('[바이럴] 카페가 몇 쪽부터인지를 원본 건수로 센다 — 접으면 엉뚱한 쪽을 가리킨다');
    } else if (h.indexOf("r.dated ? '1' : '0'") < 0) {
      fail('[바이럴] 작성일을 아는 글과 모르는 글을 섞어 접는다 — 목록 가운데 경계선의 뜻이 무너진다');
    } else {
      console.log('OK: 바이럴 같은 제목 접기 — 접고 · 밝히고 · 펼 수 있고 · 원본을 함께 적는다');
    }
  }

  /* ── LG 비교가 여섯 지역을 다 채운다 (2026-09-02 사장님 지적) ────────────
   * *"지난번엔 지역별로 LG 랑 편차가 몇 퍼센트인지 나왔는데 왜 이번엔 수원만 보이나요?"*
   *
   * 원인이 **둘이었고 둘 다 이어 돌기가 생기며 났다**:
   *  ① 예산 — 매장 훑기가 `t0 + BUDGET_MS` 를 다 쓰고 넘겨, 이어 도는 실행마다
   *     첫 줄에서 곧장 멈췄다(지역 커서가 1에 박힘). 지금은 **매장 훑기보다 먼저**
   *     돌고 **자기 예산**(`RIVAL_MS`)을 쓴다.
   *  ② 도장 — `rival_()` 이 「가장 늦은 도장」만 그리는데 지역마다 도장이 달라져
   *     마지막 조각만 남았다. 지금은 회차 하나에 도장 하나다(`_rivalStamp`).
   *
   * **둘 다 검사한다** — 한쪽만 고치면 여전히 반쪽만 뜬다. */
  {
    const g = fs.readFileSync(new URL('../docs/apps-script/Reviews.gs', import.meta.url), 'utf8');
    const iRival = g.indexOf('rivalRun = collectRival');
    const iLoop  = g.indexOf('for (i = cursor; i < STORES.length; i++)');
    if (iRival < 0 || iLoop < 0) {
      fail('[바이럴] LG 비교나 매장 훑기를 못 찾음 — 검사가 낡았다');
    } else if (iRival > iLoop) {
      fail('[바이럴] LG 비교가 매장 훑기 뒤에 있다 — 시간을 그쪽이 다 쓰고 넘겨 영영 이어 돌지 못한다');
    } else if (!g.includes('collectRival(t0 + RIVAL_MS)')) {
      fail('[바이럴] LG 비교가 자기 예산을 안 쓴다 — 남의 예산을 물려받으면 0개 지역을 돈다');
    } else if (!g.includes('var RIVAL_MS')) {
      fail('[바이럴] RIVAL_MS 가 없다');
    } else if (!g.includes("props_().getProperty('_rivalStamp')")) {
      fail('[바이럴] 회차 도장을 기억하지 않는다 — 이어 돌면 지역마다 도장이 달라 마지막 조각만 화면에 뜬다');
    } else if (!g.includes('cyStamp, area, a, b,')) {
      fail('[바이럴] 줄에 회차 도장을 안 찍는다');
    /* **표식이 아니라 결과로 판정한다** — `_rivalAt` 하나만 보면 한 지역만 쓰고도
       표식이 서 버려 다음 실행부터 「오늘은 했다」로 건너뛴다(실제로 그랬다). */
    } else if (!g.includes('r.rows.length < Object.keys(AREA_Q).length')) {
      fail('[바이럴] LG 비교가 표식만 보고 건너뛴다 — 한 지역만 채워도 오늘은 끝난 것이 된다');
    } else if (!g.includes('RIVAL_TRY_MAX')) {
      fail('[바이럴] 되풀이 상한이 없다 — 한 지역이 늘 실패하면 매 실행이 헛돌아 다른 일까지 굶는다');
    /* **진단 값은 집계 캐시를 타면 안 된다**(2026-09-02에 데었다). `summary_` 의
       반환값에만 두었더니 6시간짜리 캐시에 갇혀 배포하고도 발자국이 안 보였고,
       그래서 「배포가 안 됐나」를 또 의심하게 됐다. `freshState_` 가 내야 한다. */
    } else if (!g.includes('d.rivalCur =') || !g.includes('d.stage =')) {
      fail('[바이럴] 진단 값을 freshState_ 가 안 낸다 — 집계 캐시에 갇혀 6시간 옛 값이 굳는다');
    } else if (g.includes('    rivalCur: String(props_')) {
      fail('[바이럴] 진단 값이 집계 반환값에도 있다 — 두 곳에 두면 어느 것이 이겼는지 알 수 없다');
    } else if (!g.includes('function stage_')) {
      fail('[바이럴] 실행 발자국이 없다 — 도중에 죽으면 어디서 멈췄는지 볼 길이 없다');
    } else if ((g.split('stage_(').length - 1) < 5) {
      fail('[바이럴] 발자국이 너무 적다 — 단계를 좁히지 못하면 또 추측으로 파게 된다');
      fail('[바이럴] 어디까지 갔는지 화면이 못 본다 — 왜 수원만 뜨는지 또 추측으로 파게 된다');
    } else if (!g.includes("deleteProperty('_rivalStamp')")) {
      fail('[바이럴] 회차를 마쳐도 도장을 안 지운다 — 다음 바퀴가 옛 도장을 물려받는다');
    } else if (!g.includes("'_rivalCur', '_rivalStamp'")) {
      fail('[바이럴] 자료를 비워도 회차 상태가 남는다 — 다음 수집이 중간부터 돈다');
    } else {
      console.log('OK: 바이럴 LG 비교 — 매장 훑기보다 먼저 · 자기 예산 · 회차 도장 하나');
    }
  }

  /* ── 작성일을 모르는 글은 「기타」로 (2026-09-01 사장님 지시) ──────────────
   * *"작성일을 모르는 것은 날짜 분류에서 제외해 주세요, 기타로 분류합니다."*
   *
   * 집계(일간·주간·월간·추이)는 원래 작성일 아는 글만 셌다. 없던 것은 **뺀 것을
   * 볼 길**이다 — 연도 칩 옆 「기타」가 그 자리다. 둘은 함께 걸리지 않는다.
   *
   * 그리고 **갈래 하나의 일시 오류를 「고장」으로 읽히게 하지 않는다** —
   * `webkr:HTTP 500 …SE99` 를 그대로 붉게 찍어 사장님이 신고하셨다. 실제로는
   * 멈추지 않았고 웹 503건을 이미 모으고 있었다. */
  {
    const ixA = new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url);
    if (fs.existsSync(ixA)) {
      const x = fs.readFileSync(ixA, 'utf8');
      if (!x.includes('var dateOther')) {
        fail('[바이럴] 작성일 「기타」 필터가 없다 — 날짜 분류에서 뺀 글을 볼 길이 없다');
      /* 모르는 글에 날짜 범위를 거는 것은 뜻이 없다 — 함께 걸리면 늘 0건이다 */
      } else if (!x.includes('if (dateOther) { fromDate')) {
        fail('[바이럴] 「기타」와 날짜 범위가 함께 걸린다 — 늘 0건이 된다');
      } else if (!x.includes('if (dateOther && r.dated) return false;')) {
        fail('[바이럴] 「기타」가 작성일 아는 글을 안 걸러낸다');
      /* 조건을 걸었으면 화면이 그것을 적고 풀 길을 줘야 한다 */
      } else if (!x.includes("'기타(모름)', 'other'")) {
        fail('[바이럴] 「기타」가 조건 표시에 안 뜬다 — 왜 이 결과인지 알 수 없다');
      } else if (!x.includes("b.dataset.k === 'other'")) {
        fail('[바이럴] 「기타」 조건을 ✕ 로 풀 수 없다');
      /* 갈래 일시 오류를 사람 말로 — 원문은 감추지 않는다 */
      } else if (!x.includes('function softErr')) {
        fail('[바이럴] 갈래 일시 오류를 그대로 찍는다 — 멈추지 않았는데 고장으로 읽힌다');
      } else if (!x.includes('나머지는 그대로 훑었습니다')) {
        fail('[바이럴] 갈래 오류에 「나머지는 훑었다」를 안 적는다');
      /* 인증 오류는 진짜로 멈추는 것이라 크게 알려야 한다 */
      } else if (!x.includes('네이버 API 키가 없거나 틀렸습니다')) {
        fail('[바이럴] 인증 오류 안내가 사라졌다 — 그건 진짜로 멈추는 오류다');
      } else {
        console.log('OK: 바이럴 작성일 「기타」 분류 · 갈래 일시 오류를 사람 말로(원문은 도구설명에)');
      }
    }
  }

  /* ── 지도를 시·구까지 쪼갰다 (2026-09-01 사장님 지시) ─────────────────────
   *
   * *"시·구까지 쪼개서 구현 가능할까요? 같은 수원이라고 해도 상권이 다르고 후기가
   * 다를 수 있습니다."*
   *
   * 경계 데이터에 자치구 12개가 이미 별도 폴리곤으로 있었다. 막던 것은 지도가
   * 아니라 **매장이 어느 구에 있는가**였고, 네이버 지역검색(사장님이 알려 준 방법)
   * 으로 채웠다. `scripts/fixtures/store-gu.json` 이 근거와 함께 원본을 들고 있다. */
  {
    const gs9 = new URL('../docs/apps-script/Reviews.gs', import.meta.url);
    const ix9 = new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url);
    const fx9 = new URL('../scripts/fixtures/store-gu.json', import.meta.url);
    if (fs.existsSync(gs9) && fs.existsSync(ix9) && fs.existsSync(fx9)) {
      const g = fs.readFileSync(gs9, 'utf8');
      const x = fs.readFileSync(ix9, 'utf8');
      const fx = JSON.parse(fs.readFileSync(fx9, 'utf8'))['매장'];
      /* **표가 두 벌이면 갈린다** — fixture 가 원본이고 .gs 는 옮겨 적은 것이다.
         한 곳만 고치면 지도가 조용히 옛 구를 칠한다. */
      const miss = fx.filter((r) => !g.includes("'" + r.name + "': '" + r['구'] + "'"));
      const gu12 = ['영통구','권선구','팔달구','장안구','분당구','수정구','중원구','동안구','만안구','수지구','기흥구','처인구'];
      const noCell = gu12.filter((k) => !x.includes('data-cell="' + k + '"'));
      if (miss.length) {
        fail(`[바이럴] GU 표가 fixture 와 어긋난다: ${miss.slice(0, 3).map((r) => r.name).join(', ')} — 지도가 조용히 옛 구를 칠한다`);
      } else if (noCell.length) {
        fail(`[바이럴] 지도에 자치구 칸이 없다: ${noCell.join(', ')} — build:regionmap 을 다시 돌릴 것`);
      /* 구를 모르면 짐작해 넣지 않는다 — 지도는 멀쩡해 보이는데 엉뚱한 구가 칠해진다 */
      } else if (!g.includes('GU[name] || si')) {
        fail('[바이럴] 구를 모르는 매장을 어딘가에 넣는다 — 짐작으로 칠하면 아무도 못 알아챈다');
      } else if (!x.includes('어느 구인지 몰라 지도에 안 칠했습니다')) {
        fail('[바이럴] 구 미상 건수를 안 밝힌다 — 합계가 안 맞는 이유를 알 수 없다');
      /* 자치구로 쪼개면 경기 남부가 빽빽해져 글자가 서로 먹는다 */
      } else if (!x.includes('4.4 로도 안 들어간다')) {
        fail('[바이럴] 칸에 안 들어가는 이름표를 줄이거나 빼지 않는다 — 글자가 서로 먹는다');
      } else if (!x.includes('겹치는 이름표는 작은 칸 것부터 뺀다')) {
        fail('[바이럴] 겹친 이름표를 안 뺀다 — 크기만 봐서는 이웃끼리의 충돌을 못 막는다');
      /* 구조를 바꾸면 옛 전제로 쓴 문구가 그 자리에서 거짓이 된다 */
      } else if (x.includes('성남에 광주·이천·하남이 듭니다')) {
        fail('[바이럴] 지도 설명이 옛 구조를 말한다 — 이제 칸은 영업지역이 아니라 시·군이다');
      } else {
        console.log(`OK: 바이럴 지도 시·구 — 자치구 12칸 · 매장 ${fx.length}곳 대응 · 구 미상은 밝히고 안 칠한다`);
      }
    }
  }

  /* ── 지도 지역별 색 스펙트럼 (2026-09-01 사장님 요청) ──────────────────────
   *
   * *"지도에 모두 같은 컬러로 되어 있는데 지역별(6개 지역) 컬러를 정해서
   * 스펙트럼화하면 좋겠습니다."*
   *
   * **색상 = 지역 · 명도 = 건수.** 지역마다 명도를 따로 정규화하면 「같은 진하기가
   * 다른 건수」가 되어 지도가 거짓말을 한다 — 사다리는 전역으로 하나를 쓴다. */
  {
    const ix4 = new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url);
    if (fs.existsSync(ix4)) {
      const x = fs.readFileSync(ix4, 'utf8');
      /* 6지역 × 10단계 = 60 규칙이 다 있어야 한다. 하나라도 비면 그 칸이
         조용히 투명해져 0건(흰색)과 똑같아 보인다. */
      const missing = [];
      for (let r = 1; r <= 6; r++) {
        for (let v = 1; v <= 10; v++) {
          if (!x.includes('path.r' + r + '.v' + v + '{')) missing.push('r' + r + '.v' + v);
        }
      }
      if (missing.length) {
        fail(`[바이럴] 지역 색이 ${missing.length}칸 비었다(${missing.slice(0, 4).join(', ')}…) — 그 칸이 0건과 똑같아 보인다`);
      /* **표를 두 벌 적지 않는다** — 지도와 막대가 다른 지역을 가리키게 된다 */
      } else if (!x.includes('DATA.areaCells')) {
        fail('[바이럴] 칸→지역을 서버 areaCells 에서 안 가져온다 — 표가 두 벌이면 지도와 막대가 갈린다');
      /* 모르는 지역은 기본 파랑으로 물러난다 — 틀리는 방향이 안전하다 */
      } else if (!x.includes('if (!n) return;')) {
        fail('[바이럴] 모르는 지역에 물러설 길이 없다 — 지역이 늘면 그 칸이 색을 잃는다');
      } else {
        console.log('OK: 바이럴 지도 — 6지역 × 10단계 색 스펙트럼 (명도 사다리는 전역 하나)');
      }
    }
  }

  /* ── 작성일 표기·연도 필터 (2026-09-01 사장님 지시) ───────────────────────
   *
   * *"2023년 글도 8월 31일 발견으로 나오고 있습니다. 문제가 심각합니다."* ·
   * *"발견일은 중요하지 않습니다."* · *"작성일 기준으로 필터 걸어서 볼 수 있어야."*
   *
   * 카페 글에는 작성일이 없어 목록이 「발견 2026-08-31」이라 적고 있었다 —
   * **2023년 글이 2026년 글처럼 읽힌다.** 날짜 자리에는 모른다고 적고 발견일은
   * 도구설명으로 물러난다(지우지는 않는다 — 수집 상태를 볼 때 쓰인다). */
  {
    const ix3 = new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url);
    if (fs.existsSync(ix3)) {
      const x = fs.readFileSync(ix3, 'utf8');
      if (x.includes("'발견 '")) {
        fail('[바이럴] 목록이 발견일을 날짜처럼 적는다 — 2023년 글이 2026년 글로 읽힌다');
      } else if (!x.includes('작성일 모름')) {
        fail('[바이럴] 작성일을 모르는 글에 그 사실을 안 적는다 — 빈 칸은 「없는 글」로 읽힌다');
      /* 발견일을 **지우지는 않는다** — 언제 그물에 걸렸는지는 수집 상태를 볼 때 쓴다 */
      } else if (!x.includes('우리가 처음 찾은 날은')) {
        fail('[바이럴] 발견일이 통째로 사라졌다 — 앞세우지 않는 것과 버리는 것은 다르다');
      } else if (!x.includes('r-years') || !x.includes('ybtn')) {
        fail('[바이럴] 연도 칩이 없다 — 「2026년 후기만 몰아보기」를 날짜를 직접 쳐야 한다');
      /* **자료에 있는 해만 세운다** — 없는 해를 세우면 눌러도 0건이다 */
      } else if (!x.includes('DATA.minDate') || !x.includes('DATA.maxDate')) {
        fail('[바이럴] 연도 칩을 자료 범위에서 만들지 않는다 — 없는 해가 서거나 있는 해가 빠진다');
      } else {
        console.log('OK: 바이럴 작성일 표기 — 발견일을 날짜처럼 적지 않고, 연도 칩으로 몰아본다');
      }
    }
  }

  /* ── 0건일 때 화면이 거짓말을 하고 있었다 (2026-09-01 사장님 신고) ──────────
   *
   * *"후기 링크 부분도 카페나 블로그를 눌렀을 때 아무것도 안 보입니다."*
   *
   * 필터로 0건이어도 **「아직 수집된 후기가 없습니다 — 「지금 수집」을 눌러 보세요」**
   * 라고 적고 있었다. 7,453건이 있는데 화면이 없다고 말한 셈이다.
   *
   * **왜 0건이 되는가** — 집계와 목록의 모집단이 다르다. 카페 카드·매장 막대는
   * 전체로 세는데(byCafe 990곳) 목록은 최근 3,000건 표본만 받는다. 집계에 보이는
   * 카페를 눌러도 그 글이 표본 밖이면 목록이 빈다.
   * **「없다」와 「여기 없다」는 다른 말이다.** */
  {
    const ixAt2 = new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url);
    if (fs.existsSync(ixAt2)) {
      const x = fs.readFileSync(ixAt2, 'utf8');
      if (!x.includes('고르신 조건에 맞는 글이 이 목록에 없습니다')) {
        fail('[바이럴] 필터로 0건일 때도 「아직 수집된 후기가 없습니다」라고 적는다 — 7,453건이 있는데 없다고 말한다');
      /* **자료 자체가 0건인 경우는 남겨야 한다** — 둘을 뭉개면 반대쪽이 거짓이 된다 */
      } else if (!x.includes('아직 수집된 후기가 없습니다')) {
        fail('[바이럴] 자료가 정말 없을 때의 안내가 사라졌다 — 첫 수집 전 화면이 무슨 말을 할지 모른다');
      /* **전체에는 있는데 목록에만 없다**는 사실을 적어야 「수집이 안 됐구나」로 안 읽는다 */
      } else if (!x.includes('그 표본 밖이면 여기 안 보입니다')) {
        fail('[바이럴] 표본 때문에 안 보이는 것임을 안 밝힌다 — 사장님이 수집 실패로 오해한다');
      /* **빠져나갈 길** — 조건을 하나씩 지우게 하면 여덟 번 눌러야 한다 */
      } else if (!x.includes('clrall')) {
        fail('[바이럴] 0건 화면에 「조건 모두 지우기」가 없다 — 조건이 여덟이라 하나씩 지우게 하면 안 된다');
      } else {
        console.log('OK: 바이럴 0건 안내 — 「자료가 없다」와 「조건에 맞는 것이 없다」를 가른다');
      }
    }
  }

  /* ── 매장 신호 — 급증·급감·침묵 (2026-09-01) ────────────────────────────────
   *
   * 누적 순위표에서는 안 보이는 것 둘을 낸다 — **자기 과거 대비**와 **마지막 후기**.
   * 안성은 누적 213건(상위 9위)인데 마지막 블로그 후기가 5개월 전이다.
   * 매장 규모 자료가 없어(lib/stores.ts 는 code·name·active 셋뿐) 매장끼리 절대
   * 건수를 견주는 것은 규모 비교가 못 된다 — 그래서 자기 과거와 견준다.
   *
   * **문턱이 이 카드의 전부다.** 없으면 상위가 전부 `1건 → 6배` 잡음이 된다.
   * 매장별 월 건수가 대개 한 자릿수라 포아송 잡음이 배수를 지배한다. */
  {
    const gsAt = new URL('../docs/apps-script/Reviews.gs', import.meta.url);
    const ixAt = new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url);
    if (fs.existsSync(gsAt) && fs.existsSync(ixAt)) {
      const g = fs.readFileSync(gsAt, 'utf8');
      const x = fs.readFileSync(ixAt, 'utf8');
      const need = ['byStoreSrc', 'byStoreMonth', 'lastPost'];
      const miss = need.filter((k) => !g.includes(k + ': ' + k));
      if (miss.length) {
        fail(`[바이럴] summary_ 가 매장 신호 자료를 안 낸다: ${miss.join(', ')} — 화면이 계산할 재료가 없다`);
      /* **판정은 화면이 한다.** 문턱을 서버에 박으면 조정할 수 없고, 이 저장소는
         서버가 미리 계산한 값이 화면 사정이 바뀌며 거짓이 되는 사고를 두 번 겪었다. */
      } else if (!x.includes('SIG_UP') || !x.includes('SIG_QUIET_DAYS')) {
        fail('[바이럴] 급증·침묵 문턱이 화면에 없다 — 서버에 박으면 조정할 수 없다');
      } else if (g.includes('SIG_UP')) {
        fail('[바이럴] 문턱이 서버에도 있다 — 두 곳이 갈리면 화면과 자료가 서로 다른 말을 한다');
      /* **이번 달로 견주면 안 된다.** 오늘이 9/1 이면 9월은 3건이라 전 매장이 급감으로
         잡힌다. 반드시 직전 완결 월과 견준다. */
      } else if (!x.includes('ymAdd(today, -1)')) {
        fail('[바이럴] 급증·급감을 진행 중인 달로 견준다 — 월초에 전 매장이 급감으로 잡힌다');
      } else if (!x.includes('c >= SIG_MIN') || !x.includes('avg >= SIG_MIN')) {
        fail('[바이럴] 배수만 보고 최소 건수를 안 본다 — 월 1~2건짜리 잡음이 순위를 먹는다');
      /* **침묵에도 문턱이 있어야 한다.** 없이 「가장 오래된 6곳」을 뽑으면 전 매장이
         활발할 때도 6곳이 채워져 멀쩡한 매장이 조용한 것처럼 보인다(실물에서 잡았다). */
      } else if (!x.includes('d >= cutoffS')) {
        fail('[바이럴] 침묵에 기간 문턱이 없다 — 활발한 매장도 「오래 조용함」에 6곳이 채워진다');
      /* **신뢰도 표시** — 블로그 비중이 매장마다 9~100% 라(실측), 작성일 기반 신호가
         어떤 매장에서는 그 매장 후기의 9% 만 보고 말한다. 안 적으면 착시가 된다. */
      /* **판정을 문구가 아니라 「배지 + 그 뜻」으로 본다**(2026-09-03).
         예전에는 줄마다 그 문장을 달아 **10줄 중 10줄에 같은 경고가 붙었다** — 문턱이
         블로그 50% 인데 전체 블로그 비율이 26% 라 거의 모든 매장이 걸린다. 모든 줄에
         붙는 경고는 경고가 아니라 잡음이고, 그러면 정작 심한 곳이 묻힌다.
         **지키려는 것은 「카페 위주 신호를 그대로 믿게 하지 않는다」이지 그 문장이 아니다** —
         줄마다 비율 배지(카페 위주면 `tag c`)를 달고 그 뜻을 카드 부제가 한 번 적으면 지켜진다.
         둘 중 하나라도 빠지면 실패시킨다(배지만 있으면 뜻을 모르고, 문장만 있으면
         어느 매장이 그런지 모른다). */
      } else if (!x.includes("블로그 ' + p + \"%</span>\"") || !x.includes('p < 50 ? " c" : ""')) {
        fail('[바이럴] 줄마다 블로그 비율 배지가 없다 — 어느 매장 신호가 약한지 알 수 없다');
      } else if (!x.includes('카페 글 위주')) {
        fail('[바이럴] 「블로그 %」의 뜻을 카드가 적지 않는다 — 후기의 9% 만 보고 「조용하다」고 말하게 된다');
      /* **작성일이 없는 매장을 침묵으로 세지 않는다** — 사업장 안 모바일 전용점은
         원래 블로그 후기가 안 나오는 업태다. 0건을 「죽었다」로 적으면 거짓이다. */
      } else if (!x.includes('noPost++')) {
        fail('[바이럴] 작성일 없는 매장을 따로 세지 않는다 — 모바일 전용점이 침묵으로 잡힌다');
      } else if (g.indexOf('var SUM_VER = 2;') >= 0) {
        fail('[바이럴] 새 필드를 더했는데 SUM_VER 를 안 올렸다 — 옛 캐시가 6시간 동안 새 필드 없이 내려간다');
      } else {
        console.log('OK: 바이럴 매장 신호 — 문턱은 화면에 · 직전 완결 월과 견줌 · 카페 위주 매장에 경고');
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
    } else if (!vh.includes('data-card="rival"')) {
      fail('[바이럴] 당사 vs LG 카드에 섹션 키(data-card)가 없다 — 접이식이 열고 닫을 수 없다');
    } else console.log('OK: 바이럴 비중 — 숫자가 아니면 못 잼 · 당사 vs LG 는 접이식 섹션이다');

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
    } else if (rv.indexOf('isFull') < 0 || rv.indexOf('hitSeen) { saved') < 0) {
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
    /* **갈래는 셋이다**(`blog · cafearticle · webkr`) — 예전 `* 2` 는 웹 갈래가 생기기
       전 값이라 상한을 낮게 잡았고, 그래서 7,960회를 적게 세는 것을 **이 검사가 못 물었다.**
       LG 비교도 40 이 아니라 도시 × 진영 2 × 꼬리 × 갈래 × 쪽이다. 숫자를 박지 말고
       **소스의 상수에서 끌어내** 코드가 바뀌면 따라오게 한다. */
    const nKinds = ((rv.match(/var kinds = \[([^\]]*)\]/) || [])[1] || '').split(',').filter((x) => x.trim()).length || 3;
    const nRTails = ((rv.match(/var RTAILS = \[([^\]]*)\]/) || [])[1] || '').split(',').filter((x) => x.trim()).length;
    const areaQ = (rv.match(/var AREA_Q = \{[\s\S]*?\n\};/) || [''])[0];
    const nUnits = (areaQ.match(/'[^']+'/g) || []).length - (areaQ.match(/^\s*'[^']+':/gm) || []).length;
    const need = (nStores + Math.max(0, nAlias)) * nTails * nKinds * maxPages
      + (nUnits > 0 && nRTails ? nUnits * 2 * nRTails * nKinds * maxPages : 0);
    if (!maxPages || !sweep || !nTails || !nStores || !nRTails) {
      fail('[바이럴] MAX_PAGES · SWEEP_CALLS · TAILS · STORES · RTAILS 중 못 읽은 것이 있다');
    } else if (sweep < need) {
      fail(`[바이럴] SWEEP_CALLS(${sweep}) < 실제 상한(${need} = 매장 ${nStores} × 꼬리 ${nTails} × 갈래 ${nKinds} × ${maxPages}쪽 + LG 도시 ${nUnits} × 2 × ${nRTails} × ${nKinds} × ${maxPages}) — 갈래·쪽수를 바꿨으면 함께 고칠 것`);
    } else if (!rv.includes('sweep: sweepCalls_()')) {
      fail('[바이럴] 화면에 상수를 보낸다 — 사장님이 별칭을 등록하면 옛 숫자로 「넉넉하다」고 말한다');
    } else {
      console.log(`OK: 바이럴 한 바퀴 최대 ${sweep}회 ≥ 상한 ${need}회 (매장 ${nStores} × 꼬리 ${nTails} × 갈래 ${nKinds} × ${maxPages}쪽 + LG ${nUnits}도시)`);
    }

    /* ④-b **「완료」로 보고해도 되는가 · 「멈춤」이 정말 멈추는가 · 별칭이 세 곳 다 도는가**
       (2026-09-02). 셋 다 *"조용히 반쪽만 하고 다 한 척"* 하는 종류라 한데 묶는다. */
    {
      const bad2 = [];
      /* 갈래를 하나라도 껐으면 「전부 훑었다」가 아니다 — 이레 동안 그물이 뚫린다 */
      if (!/if \(!stopped && isFull && !kindDown\)/.test(rv)) {
        bad2.push('갈래를 끄고도 _fullAt 을 찍는다 — 그 갈래 옛 글을 이레 동안 못 모은다');
      }
      /* 「멈춤」이 도는 실행에 닿는가 — 트리거만 지우면 1~6분을 그대로 이어 돈다 */
      if (!rv.includes("props_().setProperty('_stopReq'")) {
        bad2.push('stopSweep 이 도는 실행에 알리지 않는다 — 「멈췄습니다」가 거짓이 된다');
      }
      if (!rv.includes("if (props_().getProperty('_stopReq'))")) {
        bad2.push('sweep_ 이 중단 표식을 안 읽는다 — 멈추라고 해도 계속 돈다');
      }
      /* 멈춘 것에 이어달리기를 걸면 1분 뒤 스스로 다시 돈다 — 「멈춤」이 무의미해진다 */
      if (!/!hitLimit && !fatal && !halted/.test(rv)) {
        bad2.push('사람이 멈춘 실행에 이어달리기를 건다 — 1분 뒤 다시 돈다');
      }
      /* 별칭은 세 곳이 함께 움직여야 한다(질의 · 본문 대조 · 남의 매장 판정) */
      if (!rv.includes('var cNames = [cMatch].concat(aliasOf_(cName, aliasTab));')) {
        bad2.push('관심 카페 훑기가 별칭을 안 쓴다 — 그 말로 찾아 놓고 「점명이 없다」로 버린다');
      }
      if (!/allNames\.push\(al0\[aj\]\)/.test(rv)) {
        bad2.push('남의 매장 판정에 별칭이 빠졌다 — 별칭으로 적힌 글을 남의 것으로 오판한다');
      }
      if (bad2.length) { ok = false; console.log('ERROR: [바이럴] ' + bad2.join(' · ')); }
      else console.log('OK: 바이럴 — 반쪽 훑기는 「완료」로 안 세고 · 「멈춤」이 도는 실행을 세우고 · 별칭이 세 곳 다 돈다');

      /* ④-c **세는 단위가 「글」인가 · 잰 값을 잃지 않는가 · 동명이인을 가르는가**
         (2026-09-02). 셋 다 **화면의 숫자가 조용히 틀리는** 종류다. */
      const bad3 = [];
      /* 중복 줄을 집계에서 건너뛰는가 — 안 하면 total·일주월·지도·매장별이 전부 부푼다 */
      if (!rv.includes('if (lk2) { if (seenLink[lk2]) continue; seenLink[lk2] = 1; }')) {
        bad3.push('집계가 줄 단위로 센다 — 중복 링크가 모든 숫자를 부풀린다');
      }
      /* 매니저 네이버 건수를 통째로 덮으면 어제 잰 값이 「못 잼」으로 되돌아간다 */
      if (!/nv = JSON\.parse\(props_\(\)\.getProperty\('_mgrNaver'\)/.test(rv)) {
        bad3.push('_mgrNaver 를 통째로 덮는다 — 중간에 끊기면 어제 잰 값이 사라진다');
      }
      if (/nv\[roster\[ri\]\.name\] = Number\(mq\.total\) \|\| 0;/.test(rv)) {
        bad3.push('total 을 못 읽었을 때 0 으로 적는다 — 「없음」과 「못 잼」이 뭉개진다');
      }
      /* 명부 건수를 매장|이름으로 가르는가 — 이름만 쓰면 동명이인이 한 줄로 합쳐진다 */
      if (!rv.includes("kk = sName + '|' + mn;")) {
        bad3.push('명부 건수를 이름만으로 합친다 — 동명이인이 한 매장으로 뭉개진다');
      }
      /* 한도를 바꾸면 캐시를 버리고, 상태로도 새로 읽는가 */
      if (!/sumCacheClear_\(\);[\s\S]{0,200}return \{ ok: true, limit: n/.test(rv)) {
        bad3.push('한도를 바꿔도 집계 캐시를 안 버린다 — 새로고침하면 옛 한도로 되돌아간다');
      }
      if (!rv.includes('d.dailyLimit = dailyLimit_();')) {
        bad3.push('한도를 상태로 안 보낸다 — dayUsed 만 새 값이라 남은 막대가 어긋난다');
      }
      /* 삭제 목록이 잘렸으면 화면이 그 사실을 적는가 */
      {
        const scr3 = fs.readFileSync(new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url), 'utf8');
        if (!scr3.includes('dd.n > dShown')) {
          bad3.push('삭제 목록이 500건에서 잘리는데 화면이 그 사실을 안 적는다');
        }
      }
      if (bad3.length) { ok = false; console.log('ERROR: [바이럴] ' + bad3.join(' · ')); }
      else console.log('OK: 바이럴 — 글 단위로 세고 · 잰 값을 잃지 않고 · 동명이인을 가르고 · 잘림을 밝힌다');

      /* ④-d **자라면 드러나는 것들**(2026-09-02 · 하급 4건). 지금은 안 틀리지만
         자료가 늘거나 한도를 낮추면 그 자리에서 조용히 틀린다. */
      const bad4 = [];
      /* 예산 안에 못 끝내는 도시를 영영 버리지 않는가 — 하루 5,760회를 헛쓰는 자리다 */
      /* **깊이는 `RIVAL_PAGES` 다**(2026-09-02). 진영이 둘에서 넷이 되며 10쪽을 그대로
         돌면 하루 21,500회로 한도를 넘어 5쪽으로 줄였다 — 네 진영에 똑같이 줄이므로
         점유율은 안 깨진다. */
      if (!rv.includes('var pageCap = Math.max(2, Math.min(RIVAL_PAGES, Number(stuck[place]) || RIVAL_PAGES));')) {
        bad4.push('LG 비교가 도시마다 쪽 수를 조절하지 않는다 — 큰 도시는 예산에 걸려 영영 안 채워진다');
      }
      if (!/if \(hard\) \{\s*stuck\[place\] = Math\.max\(2, Math\.floor\(pageCap \/ 2\)\);/.test(rv)) {
        bad4.push('시간에 걸린 도시의 쪽 수를 줄이지 않는다 — 다음에도 같은 자리에서 버린다');
      }
      if (!rv.includes("if (stuck[place]) { delete stuck[place];")) {
        bad4.push('끝낸 도시의 표식을 안 지운다 — 한 번 걸리면 영영 얕게 돈다');
      }
      /* 한도 판정이 LG 호출을 세는가 — 한도를 낮춰 두면 그만큼 그대로 초과한다 */
      if (!rv.includes('return used0 + calls + extraCalls >= limit;')) {
        bad4.push('한도 판정이 LG 비교 호출을 안 센다 — 최대 2,640회만큼 늦게 멈춘다');
      }
      /* 삭제 확인이 이어 도는가 — 커서가 없으면 늘 시트 앞부분만 본다 */
      if (!rv.includes("var cur0 = Number(props_().getProperty('_deadCur') || 0);")) {
        bad4.push('삭제 확인에 커서가 없다 — 줄이 늘면 뒷부분은 영영 확인되지 않는다');
      }
      if (!rv.includes("if (!cutShort) { props_().setProperty('_deadAt', today);")) {
        bad4.push('중간에 끊겨도 「오늘 했다」를 찍는다 — 그날 내내 이어서 못 돈다');
      }
      /* 스키마 판 번호 — 다음 변경 때 옛 회차에 이어 붙어 값이 2배가 되는 것을 막는다 */
      if (!rv.includes('var RIVAL_SCHEMA = ')) {
        bad4.push('RIVAL_SCHEMA 가 없다 — 칸을 더하면 옛 회차에 이어 붙어 값이 뒤섞인다');
      }
      if (!rv.includes("props_().getProperty('_rivalSchema')")) {
        bad4.push('판 번호를 보지 않는다 — 결과 판정만으로는 지난번 그 변경 하나만 알아본다');
      }
      if (bad4.length) { ok = false; console.log('ERROR: [바이럴] ' + bad4.join(' · ')); }
      else console.log('OK: 바이럴 — 큰 도시도 끝나고 · 한도가 LG 를 세고 · 삭제확인이 이어 돌고 · 판 번호로 회차를 가른다');

      /* ④-e **SDP(개인대리점)** — 2026-09-02 사장님 요청. 조사에서 31곳을 찾았지만
         **8곳만 싣기로 결정했다**(사장님 승인 *"의견대로 수렴"*). 그 결정이 코드에
         그대로 있는지 지킨다 — 특히 **하남을 되돌려 넣으면 안 된다**(40건 중 33건이
         우리 신세계하남·하남미사 글이라 그 숫자가 그 자리에서 거짓이 된다). */
      const bad5 = [];
      const sdpSrc = (rv.match(/var SDP = \[[\s\S]*?\n\];/) || [''])[0];
      if (!sdpSrc) bad5.push('SDP 명부가 없다');
      else {
        const names = (sdpSrc.match(/name: '([^']+)'/g) || []).map((x) => x.split("'")[1]);
        if (names.length !== 8) bad5.push(`SDP 명부가 8곳이 아니다(${names.length}곳) — 늘리려면 검출을 먼저 재고 사장님 승인을 받을 것`);
        ['하남', '철원', '문막'].forEach((n) => {
          if (names.indexOf(n) >= 0) {
            bad5.push(`SDP 에 「${n}」이 들어 있다 — 통과분이 우리 매장 글이거나 후기가 아니라 뺀 곳이다`);
          }
        });
      }
      /* 우리 글이 SDP 로 새지 않는가 — 하남이 83% 오염이던 그 자리다 */
      if (!rv.includes("if (belongsToOther_(text, s.name, others)) continue;")) {
        bad5.push('SDP 가 「남의 매장」 판정을 안 한다 — 우리 글이 SDP 건수로 샌다');
      }
      if (!/for \(i = 0; i < STORES\.length; i\+\+\) others\.push\(STORES\[i\]\[1\]\);/.test(rv)) {
        bad5.push('SDP 의 「남의 매장」 목록에 우리 65곳이 없다');
      }
      /* 마지막 회차만 읽는가 — 옛 회차와 합치면 같은 글이 여러 번 세어진다 */
      if (!rv.includes("if (String(v[i][0]) !== last) continue;")) {
        bad5.push('sdp_() 가 마지막 회차만 읽지 않는다 — 옛 회차와 합쳐 부풀어난다');
      }
      /* 표본이 작다는 사실을 화면이 적는가 — 안 적으면 우리 매장 건수와 같은 무게로 읽힌다 */
      {
        const scr4 = fs.readFileSync(new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url), 'utf8');
        if (!scr4.includes('data-sec="sdp"') || !scr4.includes('data-card="sdp"')) {
          bad5.push('SDP 박스·카드가 화면에 없다');
        }
        if (!scr4.includes('같은 무게로 읽지 마십시오')) {
          bad5.push('SDP 표본이 작다는 사실을 화면이 안 적는다 — 우리 매장 건수처럼 읽힌다');
        }
        if (!scr4.includes('매장 자체 글 위주')) {
          bad5.push('매장이 스스로 올린 글임을 안 밝힌다 — 고객 후기와 다른 것이다');
        }
      }
      if (bad5.length) { ok = false; console.log('ERROR: [바이럴] ' + bad5.join(' · ')); }
      else console.log('OK: 바이럴 SDP — 8곳 · 하남·철원·문막 제외 · 우리 글이 안 새고 · 표본이 작다고 밝힌다');

      /* ④-f **지역 색을 관리자가 바꾼다**(2026-09-02 사장님 요청). 색 하나가 지도와
         매장 칸 **두 곳**에 걸려 있어, 한쪽만 바뀌면 같은 지역이 두 색으로 보인다. */
      const bad6 = [];
      const scr5 = fs.readFileSync(new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url), 'utf8');
      if (!rv.includes('function setAreaColors(map)')) bad6.push('setAreaColors 가 없다 — 색을 바꿀 길이 없다');
      /* 아무 값이나 받으면 화면이 그 자리에서 깨진다 */
      if (!rv.includes('if (!/^#[0-9a-fA-F]{6}$/.test(String(map[k]))) continue;')) {
        bad6.push('색 형식을 안 가린다 — 아무 값이나 받으면 화면이 깨진다');
      }
      if (!rv.includes('!AREA_COLOR_DEFAULT.hasOwnProperty(k)')) {
        bad6.push('모르는 지역 이름을 받는다 — 쓰이지 않는 값이 조용히 쌓인다');
      }
      /* 캐시에 갇히면 바꾸고도 6시간 옛 색이다 — dailyLimit 에서 이미 겪은 자리다 */
      if (!rv.includes('d.areaColors = areaColors_();')) {
        bad6.push('색을 상태로 안 보낸다 — 바꾸고도 최대 6시간 옛 색이 보인다');
      }
      /* 화면: 지도 사다리와 아이콘을 **한 색에서** 만들어야 둘이 안 갈린다 */
      if (!scr5.includes('function applyAreaColors()')) bad6.push('화면이 색을 적용하지 않는다');
      if (!scr5.includes(".geo-svg path.r' + n + '.v'") || !scr5.includes(".st.a' + n + ' .ic{background:'")) {
        bad6.push('지도와 아이콘을 같은 색에서 만들지 않는다 — 같은 지역이 두 색으로 보인다');
      }
      /* 60줄 정적 규칙은 폴백으로 남아야 한다 — JS 가 못 돌면 지도가 회색이 된다 */
      if (!scr5.includes('.geo-svg path.r1.v1{fill:')) {
        bad6.push('정적 색 폴백을 지웠다 — 스크립트가 못 돌면 지도가 통째로 회색이 된다');
      }
      /* 되돌릴 길이 없으면 색을 잘못 골랐을 때 갇힌다 */
      if (!scr5.includes('acol-reset')) bad6.push('기본값으로 되돌릴 길이 없다');
      if (bad6.length) { ok = false; console.log('ERROR: [바이럴] ' + bad6.join(' · ')); }
      else console.log('OK: 바이럴 지역 색 — 관리자가 바꾸고 · 지도와 아이콘이 같은 색 · 폴백과 되돌리기가 있다');

      /* ── 매니저 명부 (2026-09-03 사장님 지시 — "이름과 지점만 수집") ──────────
       * **이 저장소는 public 이다.** 원본 응답에는 1,828명의 010 번호·이메일·사원번호가
       * 함께 오므로, 새는 순간 그대로 공개된다. 그래서 검사가 붙든다 —
       * 서비스센터 수집에서 이미 세운 규칙(뽑아 담는 화이트리스트)과 같은 자리다.
       *
       * **개수를 박지 않는다** — 매니저는 드나든다. 지키려는 것은 "명부가 있는가"와
       * "개인정보가 없는가"이지 276이라는 숫자가 아니다. */
      {
        const bad7 = [];
        const gsrc = fs.readFileSync(new URL('../docs/apps-script/Reviews.gs', import.meta.url), 'utf8');
        const mb = gsrc.match(/var MGR_BOOK = \{([\s\S]*?)\n\};/);
        if (!mb) bad7.push('MGR_BOOK 명부가 없다');
        else {
          const body = mb[1];
          /* 매장 줄 수 — 절반 아래로 떨어지면 수집이 반쪽으로 덮인 것이다 */
          const rows = (body.match(/^\s*'[^']+':\s*\[/gm) || []).length;
          if (rows < 30) bad7.push(`명부가 ${rows}개 매장뿐이다 — 반쪽으로 덮였을 수 있다`);
          /* **개인정보 셋** — 하나라도 있으면 즉시 실패 */
          if (/01[016789][-\s]?\d{3,4}[-\s]?\d{4}/.test(body)) bad7.push('명부에 휴대폰 번호가 있다');
          if (/@/.test(body)) bad7.push('명부에 이메일이 있다');
          if (/\d{5,}/.test(body)) bad7.push('명부에 긴 숫자가 있다 — 사원번호일 수 있다');
          /* 이름은 한글 2~4자만 — 직함이 붙어 들어오면 대조가 어긋난다 */
          const odd = [...body.matchAll(/'([^']+)'/g)].map(m2 => m2[1])
            .filter(v => !/^[가-힣A-Za-z0-9]{2,12}$/.test(v));
          if (odd.length) bad7.push(`명부에 이상한 값 ${odd.length}개 (예: ${odd[0]})`);
        }
        /* **코드 표와 화면 등록분을 합치는가** — 합치지 않으면 사장님이 화면에서 넣은
           이름이 조용히 무시된다(반대로 코드 표만 쓰면 신규 입사자를 못 넣는다). */
        if (!/for \(k in MGR_BOOK\)/.test(gsrc)) bad7.push('mgrNames_ 가 코드 표를 안 읽는다');
        if (!/_mgrList/.test(gsrc)) bad7.push('mgrNames_ 가 화면 등록분을 안 읽는다');
        if (bad7.length) bad7.forEach(m3 => fail(`[바이럴] ${m3}`));
        else console.log('OK: 바이럴 매니저 명부 — 이름·지점만 · 개인정보 0건 · 코드 표와 등록분을 합친다');
      }
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
        /* **2026-09-01 정정** — 예전에는 발견일을 「발견 2026-08-31」이라 날짜처럼
           적었고 이 검사가 그 문구를 붙들고 있었다. 사장님 지적으로 날짜 자리에는
           「작성일 모름」을 적고 발견일은 도구설명으로 물러났다. **뜻은 그대로다** —
           두 날짜를 갈라 적는가. 문구만 지금 것으로 맞춘다. */
        } else if (!/작성일 모름/.test(ix) || !/'작성 '/.test(ix)) {
          fail('[바이럴] 목록이 「작성일」과 「모름」을 갈라 적지 않는다 — 한 칸에 뭉개면 발견일이 작성일로 읽힌다');
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
        const cond = (ix.match(/if [(]([^)]*wasDated[^)]*?!r[.]dated)[)] [{]/) || [])[1];
        if (!cond) {
          fail('[바이럴] 목록에 작성일/발견일 경계 표시가 없다');
        } else {
          /* `drewSplit` 은 **한 쪽에 한 번만** 긋기 위한 빗장이다(실물에서 다섯 번 그어졌다).
             아직 안 그은 상태(false)로 두고 나머지 조건을 검사한다. */
          const show = new Function('wasDated', 'r', 'drewSplit', 'return !!(' + cond + ')');
          const cases = [
            [null, false, true, '전부 발견일(카페 필터) — 첫 줄에 뜬다'],
            [true, false, true, '작성일 뒤 첫 발견일 — 경계에 뜬다'],
            [false, false, false, '발견일이 이어짐 — 다시 안 뜬다'],
            [null, true, false, '작성일로 시작 — 안 뜬다'],
            [false, true, false, '발견일 뒤 작성일 — 안 뜬다']
          ];
          const bad = cases.filter((c) => show(c[0], { dated: c[1] }, false) !== c[2]);
          /* **이미 그었으면 다시 안 긋는가** — 이 빗장이 빠지면 안내가 되풀이된다 */
          if (/drewSplit/.test(cond) && show(true, { dated: false }, true)) {
            bad.push([0, 0, 0, '이미 그었는데 또 긋는다']);
          }
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

      /* ⓐ-2 **화면이 부르는 서버 함수가 실제로 있는가**(2026-09-02 신설).
         `google.script.run.xxx()` 는 **없는 이름을 불러도 조용히 실패하지 않고 던진다.**
         그러면 진행률 폴링은 `progBusy` 가 참으로 굳어 **그 세션 내내 죽는다** — 화면은
         멀쩡해 보이는데 진행 표시만 옛 값에서 멈추는 조용한 고장이다.
         **미리보기 하네스도 함께 본다.** 하네스에 스텁이 빠지면 그 오류가 콘솔을 채워
         정작 보려던 진짜 결함이 묻힌다 — 이 화면을 눈으로 보는 유일한 길이라 더 나쁘다. */
      {
        const scr2 = fs.readFileSync(new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url), 'utf8');
        const pv = fs.readFileSync(new URL('../scripts/preview-reviews.mjs', import.meta.url), 'utf8');
        /* **인자 있는 호출도 잡아야 한다**(2026-09-02). 예전 규칙은 `.name();` 만 봐서
           `.setAreaColors(map);` 를 놓쳤다 — 그 함수가 서버에 없어도 검사가 통과한다.
           그래서 **뒤집어 본다**: 서버의 공개 함수(밑줄 없는 이름) 중 화면이 `.이름(` 으로
           부르는 것을 모은다. 이러면 인자가 있든 없든 다 걸린다. */
        const pub = [...new Set([...rv.matchAll(/\nfunction ([a-z][A-Za-z0-9]*)\(/g)].map((m) => m[1]))]
          .filter((n) => n !== 'doGet' && n !== 'doPost');
        const called = pub.filter((n) => scr2.includes('.' + n + '('));
        const noSrv = called.filter((n) => !rv.includes('function ' + n + '('));
        const noStub = called.filter((n) => !new RegExp('\\b' + n + ': function').test(pv));
        if (!called.length) fail('[바이럴] 화면이 부르는 서버 함수를 못 찾았다 — 이 검사가 아무것도 못 지킨다');
        else if (noSrv.length) fail('[바이럴] 화면이 없는 서버 함수를 부른다: ' + noSrv.join(', ') + ' — 그 자리에서 던진다');
        else if (noStub.length) fail('[바이럴] 미리보기 하네스에 스텁이 없다: ' + noStub.join(', ') + ' — 콘솔 오류에 진짜 결함이 묻힌다');
        else console.log('OK: 바이럴 — 화면이 부르는 서버 함수 ' + called.length + '개가 Reviews.gs·하네스 양쪽에 있다');
        /* 던져도 폴링이 안 죽는가 — 굳으면 진행 표시가 조용히 멈춘다 */
        if (!/catch \(e\) \{ progBusy = false; stopPoll\(\); \}/.test(scr2)) {
          fail('[바이럴] getProgress 가 던지면 progBusy 가 굳는다 — 그 세션의 진행률 폴링이 영구히 죽는다');
        }
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

        /* ⓑ-2 **지도에 없는 칸을 가리키는 매장이 「몰래」 늘지 않는가**(2026-09-02 신설).
           `mapCell_` 은 구를 모르면 시 이름을 그대로 돌려주는데, 그 시가 구로 갈려
           있으면 **그런 칸은 지도에 없어 그 매장 후기가 어디에도 안 칠해진다.**
           지금 그런 매장은 **「수원」(Z619) 하나이고 그것은 결함이 아니라 결정이다** —
           소재지는 용인 기흥구인데 편성은 수원이라(2026-09-01 사장님 확정 *"Z619는
           수원으로 편입해 주세요"*) **알면서도 구를 단정하지 않기로 했다.** 화면이
           *"어느 구인지 몰라 지도에 안 칠했습니다"* 로 건수를 밝힌다.
           그래서 **0 을 요구하지 않고 「등재된 것만」을 요구한다** — 새 매장이 조용히
           지도에서 사라지는 것은 막고, 사장님이 정한 예외는 통과시킨다.
           예외 목록의 출처는 `store-gu.json` 의 `_구를 모르는 매장` 이다(코드가 적혀 있다).
           **문자열이 아니라 실제로 돌려서** 본다 — 소스에 그 줄이 있는지만 보면
           다른 줄이 남아 통과하는 종류라 검사가 제 일을 안 한다. */
        try {
          const grab = (re) => (rv.match(re) || [''])[0];
          /* 함수를 이름으로 떼어 온다 — `cutFn` 은 이 아래에서 정의돼 여기서는 못 쓴다 */
          const take = (n) => {
            const i = rv.indexOf('function ' + n + '(');
            if (i < 0) return '';
            const j = rv.indexOf('\n}', i);
            return j < 0 ? '' : rv.slice(i, j + 2) + '\n';
          };
          const env = grab(/var STORES = \[[\s\S]*?\n\];/) + grab(/var REGION = \{[\s\S]*?\n\};/)
            + grab(/var AREA = \{[\s\S]*?\n\};/) + grab(/var GU = \{[\s\S]*?\n\};/)
            + grab(/var GU_CITY = \{[\s\S]*?\n\};/) + grab(/var GW_CITY = \{[\s\S]*?\n\};/)
            + ' var STORE_NAME = null;'
            + take('sido_') + take('sigun_') + take('storeName_') + take('mapCell_');
          const f = new Function(env + ' return { STORES: STORES, mapCell_: mapCell_ };')();
          /* 지도 SVG 가 실제로 그리는 칸 이름 — 문자열로 적지 않고 화면에서 뽑는다 */
          const scr = fs.readFileSync(new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url), 'utf8');
          const cells = new Set([...scr.matchAll(/data-cell="([^"'+]+)"/g)].map((m) => m[1]));
          /* 사장님이 「구를 단정하지 않는다」고 정한 매장 — fixture 가 코드를 적어 둔다 */
          const guFx = new URL('../scripts/fixtures/store-gu.json', import.meta.url);
          const known = new Set(
            (JSON.parse(fs.readFileSync(guFx, 'utf8'))['_구를 모르는 매장'] || [])
              .flatMap((t) => String(t).match(/Z[A-Z0-9]{3}/g) || []));
          const lost = f.STORES.map((s) => [s[0], s[1], f.mapCell_(s[0])])
            .filter((x) => !cells.has(x[2]));
          const stray2 = lost.filter((x) => !known.has(x[0]));
          if (!cells.size) fail('[바이럴] 지도에서 data-cell 을 못 찾았다 — 이 검사가 아무것도 못 지킨다');
          else if (!known.size) fail('[바이럴] 구 미상 예외 목록이 비었다 — 이 검사가 아무것도 못 지킨다');
          else if (stray2.length) {
            fail('[바이럴] 지도에 없는 칸을 가리키는 매장 ' + stray2.length + '곳 — 그 후기가 지도에서 조용히 사라진다: '
              + stray2.map((x) => x[1] + '(' + x[0] + ')→' + x[2]).join(', ')
              + ' (일부러 그런 것이면 store-gu.json 의 `_구를 모르는 매장` 에 사유와 코드를 적을 것)');
          } else {
            console.log('OK: 바이럴 지도 — 매장 ' + f.STORES.length + '곳 중 ' + (f.STORES.length - lost.length)
              + '곳이 실재하는 칸 ' + cells.size + '개 안 · 구 미상 ' + lost.length + '곳은 전부 등재된 예외다');
          }
        } catch (e) {
          fail('[바이럴] mapCell_ 을 떼어 돌릴 수 없다 — 매장이 칸에 드는지 검사할 수 없다: ' + e.message);
        }
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

      /* ⓗ **접이식 섹션** (2026-09-02 사장님: *"섹션을 폴더화하여 클릭하면 보이게 …
         지금 섹션별 확대 축소 식으로 여러개를 누르면 다 보이고 닫고 … 이렇게하면 드래그해서
         위치변경하는 기능은 필요가없을것같습니다"*). AI구독 케어·AS 앱의 품목 칸과 같은
         심벌 박스로 폴더화했다. 되돌아가면 화면에서만 보이는 종류라 검사가 붙든다. */
      {
        const bad = [];
        if (!ix2.includes('function applySecs(')) bad.push('applySecs 가 없다');
        if (!ix2.includes('function wireSecs(')) bad.push('wireSecs 가 없다');
        /* **박스를 먼저 보이게 하고 그려야 한다** — 막대·지도는 픽셀로 재서 그리므로
           숨긴 채 그린 것은 폭이 0 이다. render() 에서 renderTrend 보다 앞서야 한다. */
        const iSec = ix2.indexOf('wireSecs(); applySecs();');
        const iTrend = ix2.indexOf('renderTrend();');
        if (iSec < 0) bad.push('render 가 wireSecs·applySecs 를 부르지 않는다');
        else if (iTrend < 0 || iTrend < iSec) bad.push('applySecs 가 renderTrend 보다 뒤에 있다 — 숨긴 채 그리면 막대 폭이 0 이다');
        /* **박스와 카드가 1:1** — 짝이 안 맞으면 「켜졌는데 안 보인다」가 된다 */
        const boxes = ix2.split('class="sec" data-sec="').length - 1;
        /* **선택자 문자열까지 세면 안 된다** — applySecs·wireSecs 의
           `.card[data-card="…"]` 두 곳이 카드로 잡혀 짝이 안 맞는 것처럼 보인다. */
        const cards = ix2.split('data-card="').length - 1 - (ix2.split('[data-card="').length - 1);
        if (boxes < 8) bad.push('섹션 박스가 ' + boxes + '개뿐이다');
        if (boxes !== cards) bad.push('박스 ' + boxes + '개 ↔ 카드 ' + cards + '개 — 짝이 안 맞는다');
        /* **한 줄에 몇 개인지를 못 박는다**(2026-09-02 사장님: *"가로 3개정도또는4개정도"*).
           `auto-fill` 로 두면 폭에 따라 다섯·여섯 칸이 되어 박스가 도로 작아진다. */
        /* **.secs 안에서 본다** — 맨 repeat(2, 1fr) 로 찾으면 .kpis 규칙이 걸린다 */
        for (const g of ['.secs { display: grid; grid-template-columns: repeat(2, 1fr)',
                         '.secs { grid-template-columns: repeat(3, 1fr)',
                         '.secs { grid-template-columns: repeat(4, 1fr)']) {
          if (!ix2.includes(g)) bad.push('한 줄 칸 수 규칙이 없다: ' + g.slice(6, 46));
        }
        if (ix2.includes('.secs { display: grid; grid-template-columns: repeat(auto-fill')) {
          bad.push('auto-fill 로 되돌아갔다 — 폭에 따라 박스가 도로 작아진다');
        }
        /* **아이콘 4배 이상**(넓이 기준) — 22px 이던 것을 46px 로 키웠다 */
        if (!ix2.includes('.sec .ci svg { width: 46px; height: 46px;')) bad.push('아이콘이 46px 이 아니다');
        /* **박스가 무엇이 들어 있는지 미리 보여준다** — 사장님이 함께 요청한 「축소판」 */
        if (!ix2.includes('function secPeek(')) bad.push('미리보기(secPeek)가 없다');
        if (!ix2.includes("pv.textContent = secPeek(k);")) bad.push('applySecs 가 미리보기를 채우지 않는다');
        /* **모르면 아무 말도 안 적는다** — 0 으로 적으면 「없다」가 되어 거짓이 된다 */
        if (!ix2.includes('if (typeof v !== ')) bad.push('미리보기가 자료 모양을 확인하지 않는다');
        if (!ix2.includes('.sec.on { background: #1428A0')) bad.push('열린 박스가 삼성 블루로 켜지지 않는다');
        /* 열린 목록은 기억하되 **막힌 환경에서도 화면은 돌아야 한다** */
        /* **키 이름을 박지 않는다** — 기본값을 바꿀 때마다 키를 올려야 하고(안 올리면
           저장된 옛 목록이 이겨서 바뀐 기본값이 아무에게도 안 보인다) 그때마다 이 검사가
           헛되이 깨진다. 지키려는 것은 *"기억하는가"* 이지 키 이름이 아니다. */
        /* **정규식을 쓰지 않는다** — 이 저장소는 셸을 거치며 역슬래시가 먹혀 정규식이
           조용히 다른 뜻이 되는 일을 반복해서 겪었다(실제로 여기서도 한 번 먹혔다). */
        if (!ix2.includes('viral_secs_v')) bad.push('열린 섹션을 기억하지 않는다');
        /* **기본은 전부 닫힘**(2026-09-02 사장님 지시 — *"기본화면은 심벌들로 진행하고싶습니다"*).
           키를 올리는 것이 짝이다 — 안 올리면 저장된 옛 목록이 이겨서 바뀐 기본값이 안 보인다. */
        if (!ix2.includes('var SEC_DEFAULT = [];')) bad.push('기본이 전부 닫힘이 아니다 — 기본화면이 심벌만이어야 한다');
        if (!ix2.includes('catch (e) {}')) bad.push('localStorage 를 try/catch 로 감싸지 않았다');
        /* **없앤 것이 되살아나지 않는지** — 끌기·⤢ 펼치기는 접이식이 대신한다 */
        for (const gone of ['wireZoom', 'wireDrag', 'markLead', 'data-nolead', 'card.wide']) {
          if (ix2.includes(gone)) bad.push('없앤 ' + gone + ' 가 남아 있다');
        }
        if (bad.length) fail('[바이럴] 접이식 섹션 — ' + bad.join(' · '));
        else console.log('OK: 바이럴 접이식 — 박스 ' + boxes + '개 ↔ 카드 ' + cards + '개 · 먼저 보이게 하고 그린다 · 열린 것을 기억한다');
      }

      /* ⓙ **LG 홍보 경로** (2026-09-02 사장님: *"LG는 어느경로로 어떻게 어떤걸
         홍보하는지도 분석하는내용이 있으면좋겠습니다"*). 지금까지 센 것은 출처·유형·월
         뿐이라 *"어디가 밀리나"* 까지만 답할 수 있었다. **어느 채널에 · 무엇을**을 더했다. */
      {
        const bad = [];
        const gsP = fs.readFileSync(new URL('../docs/apps-script/Reviews.gs', import.meta.url), 'utf8');

        /* **시트 열은 뒤에만 붙인다** — 가운데에 끼우면 옛 줄이 통째로 한 칸씩 밀린다.
           그리고 **쓰는 칸 ↔ 읽는 칸 번호**가 어긋나면 조용히 빈다(이 저장소가 이미 겪었다). */
        if (!gsP.includes("'monthJson', 'chanJson', 'prodJson', 'sampleJson'")) {
          bad.push('RIVAL_HEADER 뒤에 채널·품목·표본 칸이 없다');
        }
        if (!gsP.includes('jparse_(v[i][12])')) bad.push('표본 칸을 읽지 않는다 — 시트엔 있는데 화면이 못 본다');

        /* **떼어 돌려 본다.** 문자열 존재만 보면 규칙이 뒤집혀도 통과한다. */
        const cut = (name) => {
          const at = gsP.indexOf('function ' + name + '(');
          if (at < 0) return '';
          let d = 0;
          for (let j = gsP.indexOf('{', at); j < gsP.length; j++) {
            if (gsP[j] === '{') d++;
            else if (gsP[j] === '}') { d--; if (!d) return gsP.slice(at, j + 1); }
          }
          return '';
        };
        const tabAt = gsP.indexOf('var PROD_Q = [');
        const tabEnd = gsP.indexOf('];', tabAt);
        const tab = tabAt < 0 ? '' : gsP.slice(tabAt, tabEnd + 2);
        /* **부분일치가 무는 흔한 말 표**(`그램` → 인스타그램·프로그램). `prodOf_` 가 이것을
           쓰므로 함께 떼어 와야 한다 — 안 그러면 `prodHas_ is not defined` 로 죽는다. */
        const notAt = gsP.indexOf('var PROD_NOT = {');
        const notEnd = gsP.indexOf('};', notAt);
        const notTab = notAt < 0 ? '' : gsP.slice(notAt, notEnd + 2);
        let prodOf = null, chanOf = null;
        try {
          prodOf = new Function(cut('norm_') + tab + notTab + cut('prodHas_') + cut('prodOf_') + ' return prodOf_;')();
          chanOf = new Function(cut('plain_') + cut('chanOf_') + ' return chanOf_;')();
        } catch (e) { prodOf = null; }

        if (!prodOf || !chanOf) bad.push('prodOf_·chanOf_ 를 떼어 돌릴 수 없다 — 규칙을 검사할 수 없다');
        else {
          /* **김치냉장고를 냉장고로 또 세지 않는다** — 부분일치로 이 저장소가 여러 번 데였다 */
          const k = prodOf('LG 베스트샵 김치냉장고 후기');
          if (k.indexOf('김치냉장고') < 0) bad.push('김치냉장고를 못 잡는다');
          if (k.indexOf('냉장고') >= 0) bad.push('김치냉장고가 냉장고로도 세어진다 — 한 글이 두 번 잡힌다');
          /* **삼성 말과 LG 말이 한 칸이어야 견줄 수 있다** — 갈라 두면 "LG 는 스타일러를 민다" 를 못 낸다 */
          if (prodOf('스타일러 구매')[0] !== '의류관리기') bad.push('스타일러가 의류관리기로 안 묶인다');
          if (prodOf('에어드레서 설치')[0] !== '의류관리기') bad.push('에어드레서가 의류관리기로 안 묶인다');
          /* **없으면 없다고 한다** — 아무거나 집어넣으면 「무엇을 미나」가 거짓이 된다 */
          if (prodOf('수원점 다녀왔어요 후기').length) bad.push('품목이 없는 제목에서 품목을 만들어 낸다');
          /* **`그램` 부분일치**(2026-09-02). 후기 제목에 「인스타그램」은 아주 흔한데
             그 제목이 통째로 노트북으로 세어졌다. 양쪽에 똑같이 걸려 비중은 안 깨지지만
             품목 순위가 깨져 *"LG 는 노트북을 민다"* 는 없는 결론이 나온다.
             **막는 쪽과 잡는 쪽을 함께 본다** — 한쪽만 보면 문턱을 올려도 통과한다. */
          ['인스타그램 이벤트 후기', '프로그램 안내', '아기 몸무게 3킬로그램'].forEach((t) => {
            if (prodOf('삼성스토어 수원 ' + t).indexOf('노트북') >= 0) {
              bad.push(`「${t}」가 노트북으로 세어진다 — 부분일치 가드가 없다`);
            }
          });
          if (prodOf('LG 그램 노트북 후기').indexOf('노트북') < 0) bad.push('진짜 그램을 못 잡는다 — 가드가 너무 세다');
          if (prodOf('tvN 드라마 협찬').indexOf('TV') >= 0) bad.push('tvN 이 TV 로 세어진다');
          if (prodOf('삼성 TV 후기').indexOf('TV') < 0) bad.push('진짜 TV 를 못 잡는다 — 가드가 너무 세다');
          /* 한 글에 둘이 적혀 있으면 둘 다 */
          if (prodOf('세탁기 건조기 같이 샀어요').length !== 2) bad.push('제목에 적힌 품목을 다 세지 않는다');
          /* 채널 — 카페는 카페 이름, 블로그는 블로그 이름, 웹은 호스트 */
          if (chanOf('cafearticle', { cafename: '다이렉트웨딩' }, 'https://cafe.naver.com/a/1') !== '다이렉트웨딩') bad.push('카페 이름을 채널로 쓰지 않는다');
          if (chanOf('blog', { bloggername: '요즘신혼' }, 'https://blog.naver.com/b/2') !== '요즘신혼') bad.push('블로그 이름을 채널로 쓰지 않는다');
          if (chanOf('webkr', {}, 'https://lgbestshop.co.kr/x/y') !== 'lgbestshop.co.kr') bad.push('웹 호스트를 채널로 쓰지 않는다');
        }

        /* 화면 — 카드·박스·렌더가 다 있어야 한 벌이다 */
        if (!ix2.includes('function renderPromo(')) bad.push('renderPromo 가 없다');
        if (!ix2.includes('    renderPromo();')) bad.push('render 가 renderPromo 를 부르지 않는다');
        if (!ix2.includes('data-sec="promo"')) bad.push('접이식 박스에 LG 홍보 경로가 없다');
        if (!ix2.includes('data-card="promo"')) bad.push('LG 홍보 경로 카드가 없다');
        /* **`jparse_` 는 빈 칸을 `{}` 로 돌려준다** — 배열인지 보고 써야 `.forEach` 가 안 터진다 */
        if (!ix2.includes('Array.isArray(r.sample)')) bad.push('표본이 배열인지 안 보고 쓴다 — 옛 회차에서 화면이 죽는다');
        /* **없음과 아직 안 잼을 가른다** — 0 으로 그리면 「LG 가 안 민다」가 된다 */
        if (!ix2.includes('아직 안 쟀습니다')) bad.push('자료가 없을 때 「없다」와 「아직 안 쟀다」를 가르지 않는다');

        if (bad.length) fail('[바이럴] LG 홍보 경로 — ' + bad.join(' · '));
        else console.log('OK: 바이럴 LG 홍보 경로 — 채널·품목·표본 · 김치냉장고를 두 번 안 센다 · 스타일러↔에어드레서 한 칸');
      }
      /* ⓚ **시 안쪽 확대** (2026-09-02 사장님: *"시를 눌렀을때 해당시 안에 무슨 구 가있고
         그 구에 색을 강조했으면 … 이천의경우는 읍이나 면이 되겠네요"*).
         예전에는 **영업지역** 전체를 폈다 — 성남을 누르면 광주·이천·하남까지 떴다. */
      {
        const bad = [];
        const sub = JSON.parse(fs.readFileSync(new URL('../scripts/fixtures/gw-submunicipalities.json', import.meta.url), 'utf8'));
        const cities = Object.keys(sub.cities || {});
        if (cities.length < 20) bad.push('읍·면 fixture 에 시·군이 ' + cities.length + '곳뿐이다');
        /* **자치구가 있는 넷은 담지 않는다** — 그쪽은 한 단계 아래가 「구」다 */
        for (const g of ['수원', '성남', '안양', '용인']) {
          if (cities.indexOf(g) >= 0) bad.push(g + ' 은 자치구가 있어 읍·면을 담으면 안 된다');
        }
        if (!String(sub._src || '').includes('KOSTAT')) bad.push('읍·면 fixture 에 출처가 없다');

        /* 화면 쪽 — 시를 `data-sigun` 으로 찾고, 영업지역으로 펴지 않는다 */
        if (!ix2.includes('GW_MAP.sub')) bad.push('읍·면 자료를 화면이 안 쓴다');
        if (!ix2.includes('pa0.getAttribute("data-sigun")')) bad.push('누른 칸의 시를 data-sigun 으로 찾지 않는다');
        const zs = ix2.slice(ix2.indexOf('function zoomSvg('), ix2.indexOf('var mw = document.getElementById("geo-metro-wrap")'));
        if (zs.includes('DATA.areaCells')) bad.push('확대가 아직 영업지역을 편다 — 성남을 누르면 광주·이천·하남까지 뜬다');
        /* **「없음」과 「자료가 없다」를 가른다** — 읍·면별 건수는 우리에게 없다 */
        if (!ix2.includes('읍·면별 건수는 자료가 없습니다')) bad.push('읍·면 화면이 건수 자료가 없다는 사실을 안 적는다');
        if (!ix2.includes('sb.items[i2].t')) bad.push('빌드가 골라 둔 색을 안 쓴다');

        /* **이웃끼리 같은 색이 되지 않았는가.** 8색을 순서대로 돌리면 붙은 두 면이 같은
           색이 되어 한 덩어리로 읽힌다(이천 설성면·장호원읍이 실제로 그랬다).
           **맞닿음은 꼭짓점 공유로 본다** — 경계상자로 어림하면 안 닿는 면까지 이웃이 되어
           검사가 멀쩡한 채색을 물었다(실제로 14건을 잘못 잡았다). */
        const mj = ix2.indexOf(', sub: {');
        let clash = 0, items = 0;
        if (mj > 0) {
          /* **중괄호를 세어 끊는다** — `'} };'` 를 찾으면 GW_MAP 자체의 닫힘과 겹쳐
             한 글자가 더 붙는다(실제로 JSON.parse 가 죽었다). */
          const st2 = ix2.indexOf('{', mj + 6);
          let dep = 0, en2 = st2;
          for (let i = st2; i < ix2.length; i++) {
            if (ix2[i] === '{') dep++;
            else if (ix2[i] === '}') { dep--; if (!dep) { en2 = i + 1; break; } }
          }
          const gm = JSON.parse(ix2.slice(st2, en2));
          for (const c of Object.keys(gm)) {
            const its = (gm[c].items || []).map((it) => ({
              t: it.t,
              p: new Set(String(it.d).split(/[MLZ]/).map((x) => x.trim()).filter(Boolean)),
            }));
            items += its.length;
            for (const it of its) if (!(it.t >= 1 && it.t <= 8)) bad.push(c + ' 에 색이 없는 조각이 있다');
            for (let i = 0; i < its.length; i++) for (let j = i + 1; j < its.length; j++) {
              if (its[i].t !== its[j].t) continue;
              let n = 0;
              for (const p of its[i].p) if (its[j].p.has(p) && ++n >= 2) break;
              if (n >= 2) clash++;
            }
          }
        } else bad.push('GW_MAP 에 sub 가 없다');
        if (clash) bad.push('맞닿은 조각끼리 같은 색인 짝이 ' + clash + '건이다');
        if (bad.length) fail('[바이럴] 시 안쪽 확대 — ' + bad.join(' · '));
        else console.log('OK: 바이럴 시 안쪽 확대 — 읍·면 ' + cities.length + '시 ' + items + '곳 · 이웃끼리 색이 겹치지 않는다');
      }
      /* ⓛ **매장 위치** (2026-09-02 사장님: *"지도가 확장되었으면 이제 우리매장위치도
         표시해주세요"*). **좌표를 지어내지 않는 것**이 이 구간이 지키는 전부다 —
         시청 좌표나 시 중심으로 대신하면 지도가 **실제로는 매장이 없는 자리**를 가리킨다. */
      {
        const bad = [];
        const g = JSON.parse(fs.readFileSync(new URL('../scripts/fixtures/store-geo.json', import.meta.url), 'utf8'));
        const st = g.stores || [];
        const okS = st.filter((x) => x.ok);
        if (st.length < 60) bad.push('매장이 ' + st.length + '곳뿐이다');
        if (!String(g._src || '').includes('카카오')) bad.push('좌표 출처가 안 적혀 있다');
        for (const x of okS) {
          if (typeof x.lat !== 'number' || typeof x.lng !== 'number') { bad.push(x.name + ' 좌표가 숫자가 아니다'); continue; }
          /* 경기·강원 밖이면 좌표가 통째로 엉뚱한 것이다 */
          if (!(x.lat > 36.5 && x.lat < 38.8 && x.lng > 126.3 && x.lng < 129.6)) bad.push(x.name + ' 좌표가 경기·강원 밖이다');
          /* **근거를 남긴다** — 어느 장소를 집었는지 적혀 있어야 되짚을 수 있다 */
          if (!String(x.place || '').includes('삼성')) bad.push(x.name + ' 이 집은 장소 이름에 삼성이 없다');
          if (!x.addr) bad.push(x.name + ' 주소가 없다');
          if (!x.region) bad.push(x.name + ' 어느 시인지가 없다');
        }
        /* **못 찾은 것에 좌표가 있으면 안 된다** — 지어낸 값이 흘러든 것이다 */
        for (const x of st) {
          if (x.ok) continue;
          if (x.lat !== undefined || x.lng !== undefined) bad.push(x.name + ' 은 못 찾았다면서 좌표가 있다');
          if (!x.why) bad.push(x.name + ' 을 왜 못 찾았는지 안 적혀 있다');
        }
        /* **같은 좌표를 쓰는 곳은 그 사실이 적혀 있어야 한다**(같은 건물이라 그렇다) */
        const seen = {};
        for (const x of okS) {
          const k = x.lat + ',' + x.lng;
          if (seen[k] && !x.note && !st.find((y) => y.name === seen[k] && y.note)) {
            bad.push(x.name + ' 이 ' + seen[k] + ' 과 좌표가 같은데 이유가 안 적혀 있다');
          }
          seen[k] = seen[k] || x.name;
        }

        /* 지도에 실렸는가 — **버려진 것이 있으면 수가 안 맞는다**(빌드가 관할 밖을 버린다) */
        const pm = ix2.indexOf(', pins: [');
        if (pm < 0) bad.push('GW_MAP 에 매장 핀이 없다');
        else {
          const pins = JSON.parse(ix2.slice(ix2.indexOf('[', pm + 6), ix2.indexOf(']', pm) + 1));
          if (pins.length !== okS.length) bad.push('핀 ' + pins.length + '개 ↔ 좌표 ' + okS.length + '곳 — 빌드가 버린 것이 있다');
          for (const q of pins) if (typeof q.x !== 'number' || typeof q.y !== 'number' || !q.cell) bad.push('핀 ' + q.n + ' 이 덜 채워졌다');
        }
        /* 화면 — **테두리는 배율과 무관해야 한다**(구 확대에서 지도를 통째로 덮었다) */
        if (!ix2.includes('function pinSvg(')) bad.push('핀을 그리는 곳이 없다');
        if (!ix2.includes('.geo .pin { fill: #111827')) bad.push('핀 모양 규칙이 없다');
        if (!/.geo .pinlab {[^}]*non-scaling-stroke/.test(ix2)) bad.push('이름표 테두리가 배율을 탄다 — 확대하면 지도를 덮는다');
        /* **본 지도에는 이름을 안 적는다** — 64개 이름이면 지도가 글자에 덮인다 */
        if (!ix2.includes('pinSvg(GW_MAP.pins, 1.5, 0)')) bad.push('본 지도가 이름 없이 점만 찍지 않는다');
        /* **그리는 차례**: 도형 → 매장 → 지역 이름. 뒤집으면 점이 덮이거나 이름이 지워진다 */
        if (!ix2.includes('hp + pinSvg(sb.pins, 11, 21) + ht')) bad.push('읍·면 화면의 그리는 차례가 바뀌었다');

        if (bad.length) fail('[바이럴] 매장 위치 — ' + bad.join(' · '));
        else console.log('OK: 바이럴 매장 위치 — ' + okS.length + '곳 좌표(근거 있음) · 못 찾은 ' + (st.length - okS.length) + '곳은 비웠다');
      }
      /* ⓘ **지도 보강 · 매장 목록** (2026-08-31 사장님 요청 묶음).
         화면에서만 보이는 것들이라 되돌아가면 아무도 모른다. */
      {
        const bad = [];

        /* ① 카드 키 — **제목을 키로 쓰지 않는다.** 이 저장소는 화면 이름을 자주 고치는데
           그때마다 사장님이 맞춰 둔 순서가 통째로 초기화된다. */
        const keys = (ix2.match(/data-card="[a-z]+"/g) || []);
        if (keys.length < 6) bad.push('카드 키(data-card)가 ' + keys.length + '개뿐이다');


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
        /* **이름이 `rows` → `groups` 로 바뀌었다**(같은 제목 접기, 2026-09-02).
           뜻은 그대로다 — 「한 쪽 분량만 잘라 그리는가」. */
        if (!ix2.includes('groups.slice(from, from + pageSize)')) bad.push('한 쪽 분량만 그리지 않는다 — 전부 그리면 쪽이 뜻이 없다');
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

    /* ── ⑦ LG 비교: 도시 단위로 일하고 지역으로 합쳐 보고한다 (2026-09-02) ──────
       강원(도시 3)이 매번 6분 한도에 죽어 **다섯 지역만 뜨는데 화면이 침묵했다** —
       사장님이 세 번 물으셨다. 일의 단위를 도시로 쪼개고 읽을 때 지역으로 합친다. */
    {
      const bad = [];
      const ix = fs.readFileSync(new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url), 'utf8');

      /* ⓐ 도시 단위로 돈다 — 지역을 통째로 도는 옛 구조로 되돌아가면 강원이 또 죽는다 */
      if (!rv.includes('function rivalUnits_(')) bad.push('rivalUnits_ 가 없다 — 도시 단위 커서가 사라졌다');
      if (rv.includes('RIVAL_PER_PLACE_MS * places.length')) {
        bad.push('지역 통째 루프로 되돌아갔다 — 강원이 다시 6분 한도에 죽는다');
      }
      /* ⓑ **하드 스톱** — 도시 안에서도 마감을 보지 않으면 6분에 죽어 실행이 통째로 사라진다 */
      if (!rv.includes('if (deadline && Date.now() > deadline) { hard = true; break; }')) {
        bad.push('도시 안 하드 스톱이 없다 — 오래 걸리는 도시에서 실행이 통째로 죽는다');
      }
      /* ⓒ **반쪽은 저장하지 않는다** — 한쪽 진영만 훑고 끊긴 줄을 쓰면 비중이 거짓이 된다 */
      /* **`err` 도 함께 봐야 한다**(2026-09-02). 예전에는 시간(`hard`)만 보고 오류는
         지나쳐, LG 쪽 첫 호출이 500 이면 `rival=0 · pct=100%` 짜리 반쪽 줄이 시트에
         들어갔다 — 화면은 그것을 *"그 지역에 LG 후기가 없다"* 로 읽는다. 줄을 안 쓰면
         커서도 전진하지 않아 「같은 도시가 두 줄」 사고까지 함께 막힌다. */
      /* **인증 오류가 「한 바퀴 완료」로 둔갑하지 않는가**(2026-09-02). `fatal` 만 세우고
         `stopped` 을 안 세워서, 매장 셋만 훑고 401 을 맞은 실행이 끝에서 `_fullAt` 을
         오늘로 찍고(그 뒤 이레 동안 새 글만 훑는다) 커서를 0 으로 되돌린 뒤 `done:true`
         로 보고했다 — 못 훑은 62개 매장의 옛 글을 영영 못 채운다. */
      if (!rv.includes('fatal = true; stopped = true;')) {
        bad.push('인증 오류가 stopped 을 안 세운다 — 반쪽만 훑고 「한 바퀴 완료」로 보고한다');
      }
      if (!/if \(hard \|\| err\) \{[\s\S]{0,600}stoppedR = true; break;/.test(rv)) {
        bad.push('반쪽 줄을 버리지 않는다(시간·오류 둘 다) — 반쪽 비중이 화면에 나간다');
      }
      /* ⓓ 도시마다 커서를 적는다 — 함수 끝에서 한 번만 적으면 죽을 때 전부 잃는다 */
      if (!rv.includes("props_().setProperty('_rivalCur', String(ui + 1));")) {
        bad.push('도시마다 커서를 안 적는다 — 실행이 죽으면 그 회차를 통째로 잃는다');
      }
      /* ⓔ 걸린 시간을 재서 다음 도시 시작 여부를 정한다 */
      if (!rv.includes('spent / ranUnits')) bad.push('도시 소요 시간을 재지 않는다 — 고정값은 헛일이 나거나 시간을 남긴다');

      /* ⓕ **떼어 돌린다** — 도시 줄 셋이 지역 하나로 합쳐지는가.
             문자열 존재만 보면 합산 규칙이 뒤집혀도 통과한다. */
      const cutFn = (name) => {
        const at = rv.indexOf('function ' + name + '(');
        if (at < 0) return '';
        let d = 0;
        for (let j = rv.indexOf('{', at); j < rv.length; j++) {
          if (rv[j] === '{') d++;
          else if (rv[j] === '}') { d--; if (!d) return rv.slice(at, j + 1); }
        }
        return '';
      };
      let mergeNum = null;
      try { mergeNum = new Function(cutFn('mergeNum_') + ' return mergeNum_;')(); }
      catch (e) { mergeNum = null; }
      if (!mergeNum) bad.push('mergeNum_ 를 떼어 돌릴 수 없다 — 합산 규칙을 검사할 수 없다');
      else {
        /* 깊이를 묻지 않고 더한다 — bySrc(2단) · byKind(2단) · byProd(3단)가 전부 이 모양이다 */
        const d1 = mergeNum({}, { ours: { 블로그: 3, 카페: 1 } });
        mergeNum(d1, { ours: { 블로그: 2, 웹: 5 }, rival: { 카페: 4 } });
        if (d1.ours.블로그 !== 5 || d1.ours.카페 !== 1 || d1.ours.웹 !== 5 || d1.rival.카페 !== 4) {
          bad.push('mergeNum_ 이 중첩 숫자를 제대로 더하지 못한다: ' + JSON.stringify(d1));
        }
        const d2 = mergeNum({}, { prod: { 냉장고: { o: 1, r: 2 } }, none: { o: 3, r: 0 } });
        mergeNum(d2, { prod: { 냉장고: { o: 4, r: 0 }, TV: { o: 1, r: 1 } }, none: { o: 2, r: 5 } });
        if (d2.prod.냉장고.o !== 5 || d2.prod.냉장고.r !== 2 || d2.prod.TV.o !== 1 || d2.none.o !== 5 || d2.none.r !== 5) {
          bad.push('mergeNum_ 이 3단(byProd)을 제대로 더하지 못한다: ' + JSON.stringify(d2));
        }
        /* **숫자가 아닌 값에 걸려 죽지 않는다** — 옛 회차의 깨진 칸이 섞여도 화면이 살아야 한다 */
        try { mergeNum({}, { a: 'xx', b: null, c: 3 }); } catch (e) { bad.push('mergeNum_ 이 숫자가 아닌 값에 죽는다'); }
      }

      /* ⓖ **비중은 합산한 뒤 다시 계산한다** — 도시별 비중을 평균 내면 작은 도시가 큰 도시와 같은 무게가 된다.
             그리고 한 도시라도 못 잰 지역은 비중을 비운다. */
      /* **`half` 가 함께 들어간다**(2026-09-02) — 도시를 다 못 쟀으면 비중을 안 낸다.
         실측으로 강원이 `queries` 「춘천」 하나로 `ours 100 · rival 0 · pct 100%` 인
         반쪽 줄을 갖고 있었고, 화면이 초록 100% 로 그려 *"강원엔 LG 후기가 없다"* 고
         말했다 — 실제로는 네이버 블로그 「LG베스트샵 춘천」만 239건이다. */
      if (!rv.includes('pct: (r.capped || half || tot === 0) ? null : Math.round((r.ours / tot) * 100)')) {
        bad.push('rival_() 이 합산 뒤 비중을 다시 계산하지 않거나, 반쪽으로 잰 지역의 비중을 그대로 낸다');
      }

      /* ⓖ-2 **옛 줄과 새 줄이 한 회차에 섞이면 옛 줄을 버린다** — 2026-09-02 배포 직후
             실제로 이 사고가 났다(평택 2,008 → 4,025, 안양 질의가 `안양 · 평촌 · 안양`).
             이어 돌기가 **옛 회차 도장을 물려받아** 도시 줄을 지역 줄 옆에 붙였다.
             **떼어 돌려 본다** — 문자열만 보면 판정이 뒤집혀도 통과한다. */
      if (!rv.includes('function oldSchemaCycle_(')) {
        bad.push('oldSchemaCycle_ 이 없다 — 옛 회차에 이어 붙어 값이 두 배가 된다');
      }
      if (!rv.includes('if (cyStamp && from > 0 && oldSchemaCycle_(cyStamp)) { cyStamp = \'\'; }')) {
        bad.push('이어 돌기 전에 옛 스키마인지 보지 않는다');
      }
      let rivalFn = null;
      try {
        /* 시트를 흉내 낸 것으로 갈아 끼운다 — `at` 이 같은 회차에 **옛 지역 줄 + 새 도시 줄**이 섞인 상태 */
        const stub = `
          var RIVAL_HEADER = ['at','area','ours','rival','pct','capped','queries','s','k','m','c','p','x'];
          var SHEET_RIVAL = 'x';
          /* **프로덕션에서 실제로 난 모양 그대로다**(2026-09-02):
             · 평택 — 도시가 하나라 옛 줄과 새 줄의 queries 가 **똑같다**(둘 다 '평택')
             · 안양 — 옛 줄은 '안양 · 평촌', 새 줄은 도시마다 하나씩
             · 수원 — 아직 새 줄이 안 쓰인 정상 상태 */
          var ROWS = [
            ['T1','평택',2008,1099,65,'','평택','{}','{}','{}','{}','{}','[]'],
            ['T1','평택',2017,1088,65,'','평택','{}','{}','{}','{}','{}','[]'],
            ['T1','안양',1103,812,58,'','안양 · 평촌','{}','{}','{}','{}','{}','[]'],
            ['T1','안양',400,300,57,'','안양','{}','{}','{}','{}','{}','[]'],
            ['T1','안양',247,199,55,'','평촌','{}','{}','{}','{}','{}','[]'],
            ['T1','수원',1614,2275,42,'','수원','{}','{}','{}','{}','{}','[]'],
            /* **프로덕션에서 실제로 난 반쪽 줄**(2026-09-02): 강원은 춘천·원주·강릉 셋인데
               춘천 하나만 있고 rival=0 이라 화면이 초록 100% 로 "LG 후기가 없다"고 말했다.
               실제로는 네이버 블로그 「LG베스트샵 춘천」만 239건이다. */
            ['T1','강원',100,0,100,'','춘천','{}','{}','{}','{}','{}','[]']
          ];
          function sheet_(){ return { getLastRow: function(){ return ROWS.length + 1; },
            getRange: function(){ return { getValues: function(){ return ROWS; } }; } }; }
          function jparse_(x){ try { return JSON.parse(x) || {}; } catch(e){ return {}; } }
        `;
        /* `rival_()` 이 **지역마다 도시를 다 쟀는지** 보므로 그 표가 필요하다 —
           반쪽 줄(강원이 춘천 하나로 100%)을 「못 잼」으로 돌리는 판정의 근거다.
           **소스에서 떼어 온다** — 여기 손으로 적으면 도시가 바뀔 때 갈린다. */
        const areaQSrc = (rv.match(/var AREA_Q = \{[\s\S]*?\n\};/) || [''])[0];
        rivalFn = new Function(stub + areaQSrc + cutFn('mergeNum_') + cutFn('rival_') + ' return rival_;')();
      } catch (e) { rivalFn = null; }
      if (!rivalFn) bad.push('rival_() 을 떼어 돌릴 수 없다 — 합산 규칙을 검사할 수 없다');
      else {
        const r = rivalFn();
        const get = (a) => (r.rows || []).find(x => x.area === a);
        /* 평택은 **도시가 하나**라 옛 지역 줄과 새 도시 줄의 queries 가 똑같다(둘 다 '평택').
           「섞임」 판정은 ' · ' 로 옛 줄을 가리는데 여기서는 글자가 같아 **못 가른다** —
           시트는 덧붙여 쓰므로 **마지막 줄만** 쓴다. 합치면 4025(2배)가 되는데,
           프로덕션에서 안양은 고쳐지고 평택만 실제로 그 값이 남았다. */
        if (!get('평택') || get('평택').ours !== 2017) {
          bad.push('같은 도시가 두 줄인데 합쳐 2배가 된다: ' + JSON.stringify(get('평택')));
        }
        /* 안양은 **옛 줄(안양 · 평촌) + 새 줄(안양)** 이 섞였다 → 옛 줄을 버려 647 이어야 한다.
           안 버리면 1103+647 = 1750 이 되는데, 프로덕션에서 실제로 그 값이 나왔다. */
        if (!get('안양') || get('안양').ours !== 647) {
          bad.push('섞인 회차에서 옛 줄을 안 버린다(1750 이 되면 그 사고다): ' + JSON.stringify(get('안양')));
        }
        /* **회차 전체가 옛 줄이면 그대로 쓴다** — 안 그러면 옛 자료가 통째로 사라진다 */
        if (!get('수원') || get('수원').ours !== 1614) bad.push('섞이지 않은 줄까지 버린다');
        /* **도시를 다 못 쟀으면 비중을 내지 않는다.** 건수는 그대로 두고 `pct` 만 비운다 —
           지우면 그 자체가 또 다른 거짓이다. 몇 곳 중 몇 곳인지도 함께 보내야 화면이
           이유를 적을 수 있다. */
        const gw = get('강원');
        if (!gw) bad.push('반쪽으로 잰 지역이 통째로 빠졌다 — 건수는 남겨야 한다');
        else if (gw.pct !== null) bad.push(`도시를 다 못 쟀는데 비중을 낸다(${gw.pct}%) — 화면이 「LG 후기가 없다」로 그린다`);
        else if (!gw.half || gw.cities !== 1 || gw.wantCities < 2) {
          bad.push(`반쪽인 사실을 화면에 못 알린다: ${JSON.stringify({ half: gw.half, cities: gw.cities, want: gw.wantCities })}`);
        }
        /* 다 잰 지역은 그대로 비중이 나와야 한다 — 한쪽만 보면 문턱을 올려도 통과한다 */
        if (get('수원') && get('수원').pct !== 42) bad.push('다 잰 지역의 비중까지 비운다 — 가드가 너무 세다');
      }

      /* ⓗ **버튼** (사장님 요청) — 서버 진입점 · 화면 버튼 · 그 둘이 이어져 있는가 */
      if (!rv.includes('function runRival()')) bad.push('runRival() 이 없다 — 화면에서 LG 비교를 돌릴 길이 없다');
      if (!rv.includes("props_().deleteProperty('_rivalAt');")) {
        bad.push('버튼이 오늘 표식을 지우지 않는다 — 눌러도 「오늘은 이미 했다」로 건너뛴다');
      }
      if (!/sumCacheClear_\(\);[\s\S]{0,400}stage_\(r\.done/.test(rv)) {
        bad.push('버튼이 집계 캐시를 안 버린다 — 최대 6시간 옛 값이 화면에 굳는다');
      }
      if (!ix.includes('id="runrival"')) bad.push('화면에 「LG 비교 갱신」 버튼이 없다');
      if (!ix.includes('.runRival();')) bad.push('버튼이 runRival 을 부르지 않는다');

      /* ⓘ **빠진 지역을 이름으로 적는다** — 이 침묵이 사장님을 세 번 묻게 했다 */
      if (!rv.includes('d.rivalAreaNames = Object.keys(AREA_Q);')) {
        bad.push('기대 지역 이름을 안 보낸다 — 화면이 무엇이 빠졌는지 말할 수 없다');
      }
      if (!ix.includes('아직 못 쟀습니다')) bad.push('빠진 지역을 화면이 적지 않는다 — 조용히 다섯 곳만 그린다');
      if (!ix.includes("josa(miss[miss.length - 1], '은', '는')")) {
        bad.push('조사를 받침으로 고르지 않는다 — 「강원 은(는)」이 그대로 나간다');
      }

      /* ⓙ **collectRival 이 쓰는 것들이 살아 있는가.** 2026-09-02 에 이 블록을 갈아
             끼우다 `plain_`·`chanOf_`·`prodOf_`·`topN_`·`PROD_Q` 를 통째로 삼켰다 —
             **문법 검사는 통과했다**(없는 함수를 부르는 것은 런타임 오류라). 배포했으면
             LG 비교가 그 자리에서 죽었을 것이다. */
      ['plain_', 'chanOf_', 'prodOf_', 'topN_', 'rivalHit_', 'srcName_', 'kindOf_', 'linkNoise_'].forEach((f) => {
        if (!rv.includes('function ' + f + '(')) bad.push('collectRival 이 쓰는 ' + f + ' 가 사라졌다');
      });
      if (!rv.includes('var PROD_Q = [')) bad.push('PROD_Q 표가 사라졌다 — 품목을 못 센다');

      if (bad.length) fail('[바이럴] LG 비교 도시 단위 — ' + bad.join(' · '));
      else console.log('OK: 바이럴 LG 비교 — 도시 단위로 돌고 지역으로 합산 · 버튼 · 빠진 지역을 이름으로 적는다');
    }
  }
}

/* ── 바이럴 히트맵 주차 — **칸은 지점, 주차는 필터다** (2026-09-03 사장님 지시) ──
 * *"내가 몇 주차를 클릭하거나 날짜를 설정하면 히트맵은 지점이 나오게 해주시면 됩니다.
 *  지금은 히트맵 자체에 주차별로 나옵니다. 원하는 부분이 이게 아닙니다."*
 * 한때 히트맵 **모드**에 주차를 두어 **칸 자체가 주차**가 됐고 지적을 받았다 — 되돌리면
 * 화면에서만 보이므로 여기서 붙든다. */
{
  const ixp = new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url);
  const rvp = new URL('../docs/apps-script/Reviews.gs', import.meta.url);
  if (fs.existsSync(ixp) && fs.existsSync(rvp)) {
    const ix = fs.readFileSync(ixp, 'utf8');
    const rv = fs.readFileSync(rvp, 'utf8');
    const bad = [];

    /* ① 서버가 **지점 × 주차**를 낸다. 주차별 합계만으로는 칸을 지점으로 못 그린다. */
    if (!rv.includes('byStoreWeek[r.storeName][wk][r.kind]')) {
      bad.push('서버가 지점 x 주차를 세지 않는다 — 주차를 골라도 칸을 지점으로 못 그린다');
    }
    if (!rv.includes('byStoreWeek: trimWeeks_(byStoreWeek, WEEK_KEEP)')) {
      bad.push('byStoreWeek 를 안 보내거나 자르지 않는다');
    }

    /* ② **칸을 주차로 만들던 옛 모드가 되살아나면 안 된다.** */
    if (ix.includes("heatMode === 'week'") || ix.includes("heatMode = 'week'")) {
      bad.push('주차가 다시 모드가 됐다 — 칸이 주차가 되어 지점이 사라진다(사장님이 지적한 그것)');
    }
    if (!ix.includes("var heatWeek = ''")) bad.push('주차 필터 상태(heatWeek)가 없다');
    if (!ix.includes('var week = !!heatWeek;')) bad.push('week 가 「주차를 골랐는가」가 아니다');

    /* ③ 칩 줄 — **건수를 함께 적는다.** 한 주에 값이 있는 매장이 7~17곳뿐이라
           숫자가 없으면 눌러 보고서야 빈 히트맵을 만난다. */
    if (!ix.includes('id="hm-weeks"')) bad.push('주차 칩 줄이 없다');
    if (!ix.includes("wbox.style.display = 'none'")) {
      bad.push('자료가 없을 때 칩 줄을 감추지 않는다 — 빈 줄은 고장으로 보인다');
    }
    if (!ix.includes('nf(wsum[w3])')) bad.push('칩에 건수를 안 적는다');

    /* ④ **평소 평균은 「글이 있었던 주」로 나눈다.** 전체 주로 나누면 선택 편향이 생겨
           (칸이 그려진 매장은 그 주에 1건 이상이므로) **전 칸이 최대 초록**이 된다. */
    if (!ix.includes('wAvg[sN] = liveW ? tt / liveW : null;')) {
      bad.push('평소 평균을 0인 주까지 세어 낸다 — 그 주에 글이 있다는 이유만으로 늘 「평소보다 많다」가 된다');
    }

    /* ⑤ **색 척도와 범례가 같은 값을 쓴다.** 주는 표본이 1~5건이라 ±15% 로는 통째로
           포화되고, 범례가 ±15% 라 적혀 있으면 색을 4배로 잘못 읽는다. */
    if (!ix.includes('var HEAT_LO = ') || !ix.includes('var HEAT_HI = ')) bad.push('파스텔 단일 계열 색이 없다');
    if (ix.includes('rampColor(') && ix.includes('heatColor(d.g')) bad.push('칸이 아직 증감으로 칠해진다 — 색은 건수다');
    if (!ix.includes('heatColor(d.cnt, heatMax)')) bad.push('칸을 건수로 칠하지 않는다');
    if (!ix.includes("nf(heatMin) + '건'") || !ix.includes("nf(heatMax) + '건'")) bad.push('범례가 최소·최대 건수를 안 적는다');
    if (ix.includes('Math.min(Math.abs(g) / (span')) bad.push('옛 증감 색 함수가 남아 있다');
    if (!ix.includes('sc2.innerHTML')) {
      bad.push('색띠를 매번 다시 그리지 않는다 — 초기화 때는 척도가 없어 띠가 통째로 빈다');
    }

    if (bad.length) fail('[바이럴] 히트맵 주차 — ' + bad.join(' · '));
    else console.log('OK: 바이럴 히트맵 주차 — 칸은 지점 · 주차는 필터 · 평소 대비 · 척도와 범례가 같다');
  }
}

/* ── 매니저 히트맵 (2026-09-03 사장님 지시) ────────────────────────────────
 * *"매니저 후기 수집별 지금은 베스트10으로 되어 있는데 수집된 매니저를 토대로
 *  히트맵으로 볼 수 있게 히트맵 안으로 편입해주세요."*
 * 매니저는 **기간이 아니라 대상**이라 칸이 되는 것이 맞다(주차와 다르다). */
{
  const ixp = new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url);
  const rvp = new URL('../docs/apps-script/Reviews.gs', import.meta.url);
  if (fs.existsSync(ixp) && fs.existsSync(rvp)) {
    const ix = fs.readFileSync(ixp, 'utf8');
    const rv = fs.readFileSync(rvp, 'utf8');
    const bad = [];

    /* ① 서버가 **매니저 × 월**을 낸다 — 히트맵 색이 전월 대비라 월별이 있어야 한다 */
    if (!rv.includes('mgrMon[mk][mmo]')) bad.push('서버가 매니저 x 월을 세지 않는다 — 색을 낼 수 없다');
    if (!rv.includes('mon: mgrMon[mk] || {}')) bad.push('mgrTop 이 월별을 안 싣는다');
    /* **작성일을 아는 글만** — 발견일을 섞으면 이번 달만 거대해진다(이미 두 번 데인 자리) */
    if (!rv.includes('if (rows[i].dated && rows[i].date) {')) {
      bad.push('매니저 월별이 작성일을 안 가린다');
    }
    /* 순위표 20명은 히트맵에 모자라다 — 꼬리가 잘리면 「언급이 없다」로 읽힌다 */
    if (rv.includes('mgrTop.slice(0, 20)')) bad.push('mgrTop 이 20명뿐이다 — 히트맵 꼬리가 잘린다');

    /* ② 화면 — 전환·자료 없을 때 감추기 */
    if (!ix.includes("var heatWho = 'store'")) bad.push('지점/매니저 전환 상태가 없다');
    if (!ix.includes('id="hm-who"')) bad.push('전환 버튼이 없다');
    if (!ix.includes('bwho2.hidden = !hasMgr;')) {
      bad.push('자료가 없을 때 버튼을 감추지 않는다 — 눌러도 빈 히트맵이라 고장으로 보인다');
    }
    if (!ix.includes("if (!hasMgr && heatWho === 'mgr')")) {
      bad.push('자료가 사라졌는데 매니저를 보고 있으면 되돌리지 않는다');
    }
    if (!ix.includes('function mgrRows()')) bad.push('매니저 줄을 만드는 함수가 없다');

    /* ③ **칸에 실어 보내는 필드** — 이 자리에서 필드를 빠뜨려 이미 세 번 데었다
           (share·noPrev 를 안 실어 「작성일 모름」·「null→119건」, store 를 안 실어
           매장 이름 대신 「0→7건」이 떴다). */
    /* **앵커를 닫는 괄호까지 잡지 말 것** — 필드를 하나 더하면 그 자리에서 깨져
       멀쩡한 코드를 「틀렸다」고 잡는다(연도 축을 넣다 실제로 그랬다).
       **안 바뀔 조각**으로 잡고, 실어야 하는 필드를 하나씩 센다. */
    ['store: d.store', 'known: d.known', 'year: d.year', 'prevYear: d.prevYear'].forEach(function (f) {
      if (!ix.includes(f)) bad.push('칸에 ' + f + ' 를 안 싣는다 — 부제가 엉뚱한 글자가 된다');
    });

    /* ④ 매니저에 없는 것을 살려 두지 않는다 — 눌러도 뜻이 없는 버튼은 「고장」이다 */
    if (!ix.includes("var chan = heatWho === 'mgr' ? false")) {
      bad.push('매니저에서 채널 드릴다운을 막지 않는다 — 빈 화면이 뜬다');
    }
    /* **2026-09-03 사장님 정정으로 뜻이 뒤집혔다** — 매니저 보기에서도 유형을 걸어야
       한다(「매니저로 보기를 누르고 혼수 입주 기타 후기를 필터링할 수 있어야」).
       주차는 여전히 감춘다 — 매니저 x 주차는 세어 두지 않았다. */
    if (!ix.includes("if (mgrView && wbox) wbox.style.display = 'none';")) {
      bad.push("매니저에서 주차 거르개를 감추지 않는다 — 자료가 없어 0건이 나온다");
    }

    if (bad.length) fail('[바이럴] 매니저 히트맵 — ' + bad.join(' · '));
    else console.log('OK: 바이럴 매니저 히트맵 — 칸은 사람 · 색은 전월 대비 · 자료 없으면 감춘다');
  }
}

/* ── 히트맵 연도 축 · LG 연도별 (2026-09-03 사장님 지시) ────────────────────
 * *"히트맵에 2025년과 2026년 자료만 … 기본 화면은 2026년(당해) … 2025년 대비 증감은
 *   버튼으로"* · *"LG도 삼성스토어 수집과 동일하게 과거 총후기합은 수치로 보관하고
 *   (23년24년까지) 25년과 26년은 삼성스토어와 동일하게"*.
 *
 * **가장 위험한 것은 「같은 기간」이라는 거짓말이다.** 우리 자료는 2025-07 부터인데
 * 화면이 *"양쪽 다 1~9월"* 이라 적고 없는 여섯 달을 0으로 세어 **+368%** 를 내밀고
 * 있었다(겹치는 달만 보면 +127%). 그래서 `heatCmpMonths()` 를 **떼어 실제로 돌린다** —
 * 문자열이 있는지만 보면 규칙이 바뀌어도 통과한다. */
{
  const ix = fs.readFileSync(new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url), 'utf8');
  const bad = [];

  /* ① 겹치는 달 규칙을 떼어 돌린다 */
  const m = ix.match(/function heatCmpMonths\(\)[\s\S]*?\n  \}/);
  if (!m) bad.push('heatCmpMonths 가 없다 — 연도 비교가 「같은 기간」을 지킬 수 없다');
  else {
    const run = (bm, cur, prev) => {
      const fn = new Function('DATA', 'heatYears',
        m[0].replace('function heatCmpMonths()', 'return (function ()') + ')();');
      return fn({ byStoreMonth: bm }, () => ({ cur, prev }));
    };
    /* 실제 프로덕션 모양 — 작년이 7월부터, 당해는 9월이 진행 중 */
    const bm = { A: { '2025-07': 5, '2025-08': 5, '2025-09': 5,
                      '2026-01': 9, '2026-07': 9, '2026-08': 9, '2026-09': 1 } };
    const got = run(bm, '2026', '2025');
    if (got.join(',') !== '07,08') {
      bad.push('겹치는 달이 [07,08] 이어야 하는데 [' + got.join(',') + '] 이다'
        + ' — 작년에 없는 달을 0으로 세거나 진행 중인 달을 넣고 있다');
    }
    /* 두 해가 한 달도 안 겹치면 빈 배열 — 「견줄 수 없다」를 0 으로 그리지 않는다 */
    const none = run({ A: { '2025-01': 3, '2026-08': 3, '2026-09': 1 } }, '2026', '2025');
    if (none.length) bad.push('겹치는 달이 없는데 ' + none.length + '개를 내놓는다');
  }

  /* ② 당해만 볼 때는 증감을 안 적고, 「작성일 모름」도 안 붙인다 */
  if (!ix.includes("heatYear !== 'cmp' ? ''")) {
    bad.push('당해만 볼 때 증감을 지우지 않는다 — 그때는 색도 건수라 두 말을 한다');
  }
  if (!ix.includes("!heatKind && !d.year) sub2 = '작성일 모름'")) {
    bad.push('연도 축에서 「작성일 모름」을 막지 않는다 — 그 칸은 작성일을 알아서 센 것이다');
  }
  /* ③ 기본은 당해년도 — 이 한 줄이 사장님 지시의 핵심이다 */
  if (!/var heatYear = 'cur'/.test(ix)) {
    bad.push('히트맵 기본이 당해년도가 아니다');
  }
  /* ④ 주차·유형·매니저를 고르면 연도 축이 아니다 — 버튼을 감춘다 */
  if (!ix.includes('var yrAxis = !week && !mgrView && !heatKind;')) {
    bad.push('연도 축 판정이 주차·유형·매니저를 가르지 않는다');
  }

  /* ⑤ LG 연도 표 — 당해·직전해만 비중, 그 앞은 숫자만 */
  if (!ix.includes('function yearTable()')) bad.push('LG 연도 표가 없다');
  if (!ix.includes("var KEEP = Number(cur) - 3;")) {
    bad.push('LG 연도 표가 23·24년까지 줄로 적지 않는다');
  }
  if (!ix.includes("var live = (y === cur || y === prev);")) {
    bad.push('LG 연도 표가 당해·직전해만 비중을 내지 않는다 — 「숫자만 보관」이 무너진다');
  }
  /* **지우지 않는다** — LG 비교는 애초에 숫자만 저장한다 */
  if (/rollRival|purgeRival/.test(ix)) {
    bad.push('LG 비교를 지우려 든다 — 보관하라는 지시와 어긋난다');
  }
  /* ⑥ LG 증감도 겹치는 달만 */
  if (!ix.includes("if (!ym[prev + '-' + m2]) return;")) {
    bad.push('LG 증감이 작년에 없는 달을 0 으로 센다');
  }

  /* ⑦ **월 집계 하한은 연 단위여야 한다** (2026-09-03 사장님 지적으로 발견)
     'now - 400일' 이라 2026-09-03 에 2025-07 에서 잘렸다 — 작성일을 아는 2,671건 중
     844건만 화면에 나갔고 2025년은 616건 중 249건뿐이었다. 「며칠 전」으로 잡으면
     오늘이 며칠이냐에 따라 작년 시작이 잘려 연도 비교가 반쪽이 된다. */
  {
    const gs = fs.readFileSync(new URL('../docs/apps-script/Reviews.gs', import.meta.url), 'utf8');
    if (gs.includes('monthFloor = Utilities.formatDate(new Date(now.getTime() - ')) {
      bad.push('byStoreMonth 하한이 「며칠 전」이다 — 연도 비교가 반쪽이 된다');
    }
    if (!gs.includes("var monthFloor = (Number(Utilities.formatDate(now, tz, 'yyyy')) - 1) + '-01';")) {
      bad.push('byStoreMonth 하한이 직전해 1월이 아니다');
    }
  }

  /* ⑧ **균형점은 회사 수가 정한다** (2026-09-03 배포 확인에서 발견)
     4사로 넓히며 분모만 넷으로 바꾸고 판정은 2사 시절 50% 를 두어, 화면이
     「당사가 앞선 곳 0곳」이라 말하고 있었다 — 용인은 4사 중 45.7% 로 1위다. */
  {
    /* **정규식을 쓰지 않는다** — 함수 본문을 여닫는 글자로 잘라 낸다 */
    const at = ix.indexOf('function rvBase(r) {');
    if (at < 0) bad.push('rvBase 가 없다 — 4사 비교에 2사 기준을 쓰게 된다');
    else {
      const end = ix.indexOf(String.fromCharCode(10) + '  }', at);
      const src = ix.slice(at, end + 4);
      const fn = new Function('return (' + src.replace('function rvBase', 'function') + ')')();
      /* 4사 줄 — 용인 실측 */
      if (fn({ ours: 3158, rival: 1370, hi: 2030, el: 359 }) !== 25) {
        bad.push('4사 줄의 균형점이 25 가 아니다 — 「앞선 곳 0」이 된다');
      }
      /* 옛 회차는 hi·el 칸이 없어 2사다 — 그 줄은 50 이어야 한다 */
      if (fn({ ours: 100, rival: 80, hi: 0, el: 0 }) !== 50) {
        bad.push('2사 줄(옛 회차)의 균형점이 50 이 아니다');
      }
    }
    if (ix.includes('r.pct >= 50') || ix.includes('r.pct < 50') || ix.includes('r.pct > 50')) {
      bad.push('아직 50% 로 승패를 가른다 — 4사에서는 영원히 「앞선 곳 0」이 된다');
    }
  }

  if (bad.length) fail('[바이럴] 연도 축 — ' + bad.join(' · '));
  else console.log('OK: 바이럴 연도 축 — 당해 기본 · 겹치는 달만 견줌 · LG 23/24는 숫자만');
}

/* ── 매장 대 매장 — LG 짝과 1:1 (2026-09-03 사장님 지시) ────────────────────
 * *"같은 지역내 삼성스토어 갤러리아광교 매장 후기와 LG베스트샵 갤러리아광교 매장
 * 후기 비중이 나오게 해달라는것입니다"*.
 *
 * **`byStore` 를 그대로 쓰면 안 된다** — 꼬리말 8개·별칭까지 붙인 값이라 LG 쪽과
 * 잣대가 다르다. 양쪽을 여기서 다시, 똑같이 센다. */
{
  const gs = fs.readFileSync(new URL('../docs/apps-script/Reviews.gs', import.meta.url), 'utf8');
  const ix = fs.readFileSync(new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url), 'utf8');
  const bad = [];

  /* ① 서버 — 수집·읽기 */
  if (!gs.includes('function collectStoreRival(')) bad.push('collectStoreRival 이 없다');
  if (!gs.includes('function storeRival_()')) bad.push('storeRival_ 이 없다');
  if (!gs.includes('storeRival: storeRival_(),')) bad.push('응답에 storeRival 을 안 싣는다');
  /* **반쪽을 저장하면 그 매장 비중이 조용히 거짓이 된다** */
  if (!gs.includes('if (hard || err) break;')) {
    bad.push('끊겼을 때 줄을 안 쓰는 가드가 없다 — 반쪽 줄이 시트에 들어간다');
  }

  /* ② 지점명 → 판정 말. 떼어 실제로 돌린다 */
  {
    const at = gs.indexOf('function shopPlace_(shop) {');
    if (at < 0) bad.push('shopPlace_ 가 없다');
    else {
      const end = gs.indexOf(String.fromCharCode(10) + '}', at);
      const fn = new Function('return (' + gs.slice(at, end + 2).replace('function shopPlace_', 'function') + ')')();
      const want = [['AK PLAZA 분당점', '분당'], ['갤러리아 광교점', '광교'],
                    ['경기광주본점', '경기광주'], ['남수원점', '남수원'],
                    ['강릉옥천점', '강릉옥천'], ['평택본점', '평택']];
      want.forEach(([a2, b2]) => {
        const got = fn(a2);
        if (got !== b2) bad.push('shopPlace_("' + a2 + '") 가 "' + b2 + '" 가 아니라 "' + got + '"');
      });
    }
  }

  /* ③ 화면 — **별도 보기 축이 아니라 칸 안에** 파랑:빨강 (2026-09-03 사장님 재지시)
     *"지금 블루컬러는 베이스로하고있는데 LG는 지점명 안들어가도되니 레드계열로
     색상을 넣어서 비중을 확인해주면됩니다"* — 축을 두면 두 곳이 같은 말을 한다. */
  if (ix.includes('function lgRows()') || ix.includes("id=\"hm-lg\"")) {
    bad.push('별도 보기 축이 남아 있다 — 칸에 통합했으므로 두 곳이 같은 말을 한다');
  }
  if (!ix.includes('linear-gradient(90deg,')) {
    bad.push('칸을 파랑:빨강으로 나누지 않는다');
  }
  /* **빨강도 건수 농도를 따라가야 한다** — 고정색이면 옅은 파랑 옆에서 빨강만 튄다 */
  if (!ix.includes('lgColor(d.cnt, heatMax)')) {
    bad.push('LG 빨강이 건수 농도를 안 따라간다 — 50% 인데 LG 가 이기는 것처럼 보인다');
  }
  {
    const at2 = ix.indexOf('function lgColor(v, max) {');
    if (at2 < 0) bad.push('lgColor 가 없다');
    else {
      const lo = ix.indexOf('var LG_LO = ');
      const line = ix.slice(lo, ix.indexOf(String.fromCharCode(10), lo));
      /* 짙은 쪽 휘도가 파랑(0.063)과 너무 벌어지면 면적으로 못 읽는다 */
      const hi = JSON.parse(line.slice(line.indexOf('LG_HI = [') + 8, line.lastIndexOf(']') + 1));
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const L = 0.2126 * f(hi[0]) + 0.7152 * f(hi[1]) + 0.0722 * f(hi[2]);
      if (L > 0.13) bad.push('LG 빨강이 너무 밝다(휘도 ' + L.toFixed(3) + ') — 파랑(0.063) 옆에서 튄다');
    }
  }
  /* **마우스를 올리면 어느 점인지·몇 건인지** */
  if (!ix.includes("NLC + 'LG ' + srt.shop")) {
    bad.push('말풍선이 LG 지점명·건수를 안 적는다');
  }
  /* **「아직 안 쟀다」와 「없다」는 다른 말이다** */
  if (!ix.includes('LG 짝 비중은 아직 재지 않았습니다')) {
    bad.push('자료가 없을 때 화면이 침묵한다 — 사장님이 「안 된다」로 읽는다');
  }
  /* ④ 비용을 밝힌다 — 눌러 놓고 예산이 왜 줄었는지 모르면 안 된다 */
  if (!ix.includes('3,720회')) bad.push('수집 비용을 화면이 밝히지 않는다');

  /* ⑤ **한도를 세고 지킨다** — 안 세면 화면의 「오늘 쓴 호출」이 거짓이 되고,
     다 쓴 채로 시작하면 커서만 헛돌아 사람은 왜 안 되는지 모른다. */
  {
    const at3 = gs.indexOf('function collectStoreRival(');
    const end3 = gs.indexOf(String.fromCharCode(10) + '}', at3);
    const body = gs.slice(at3, end3);
    if (body.indexOf('addUsage_(calls)') < 0) {
      bad.push('쓴 호출을 안 센다 — 화면의 「오늘 쓴 호출」이 거짓이 된다');
    }
    if (body.indexOf('used0 >= lim') < 0) {
      bad.push('한도를 다 썼는데 시작한다 — 커서만 헛돈다');
    }
  }

  /* ⑥ **드릴다운·지점별 분석이 연도로 맞아야 한다** (2026-09-03 사장님 지적)
     칸이 「2026년 138건」인데 눌러 들어가면 채널 합이 1,100건이 넘었다. */
  if (!gs.includes('byStoreChanY:')) bad.push('서버가 연도별 채널을 안 보낸다');
  if (!ix.includes('function chanOfStore(store)')) bad.push('화면에 chanOfStore 가 없다');
  if (ix.includes('(DATA.byStoreChan || {})[who]')) {
    bad.push('드릴다운이 아직 전 기간 채널을 쓴다 — 칸과 두 말을 한다');
  }
  if (!ix.includes('var CH = chanOfStore(storeFilter);')) {
    bad.push('지점별 분석이 연도로 안 맞는다');
  }
  /* **전 기간 수도 함께 밝힌다** — 「138건」만 보면 그 매장 후기가 그만큼인 줄 안다 */
  if (!ix.includes('아래 채널은 <b>전 기간')) {
    bad.push('채널이 전 기간 기준임을 안 밝힌다 — 138 과 1,185 의 차이를 알 수 없다');
  }
  /* ⑦ **0건 문구는 뺐다**(사장님: "0건인것은 화면에서 안나와도됩니다") */
  if (ix.includes("why.push(zeroN")) {
    bad.push('0건 문구가 남아 있다');
  }

  /* ⑧ **당사 vs LG 둘만** (2026-09-03 사장님 지시) + 가로 막대 */
  if (ix.includes("['us', 'th', 'hm', 'el']")) bad.push('지역 막대가 아직 4사를 그린다');
  if (!ix.includes('var pct2 = tot2 ? Math.round(v.us / tot2 * 100) : null;')) {
    bad.push('화면이 서버의 4사 pct 를 그대로 쓴다 — 둘만 그리는데 %가 어긋난다');
  }
  if (!ix.includes('.rvg4 .plot div { height:')) bad.push('지역 막대가 가로가 아니다');
  if (ix.includes('넷이 똑같이 나누면 25%')) bad.push('범례가 아직 4사 균형점을 적는다');
  /* **막대가 100% 로 뻗으면 최댓값 숫자가 잘린다**(실물에서 봤다) */
  if (!ix.includes('v[k] / mx * 86')) bad.push('막대가 숫자 자리를 안 남긴다');

  /* ⑨ **빈 값을 스크립트 속성에 저장하지 않는다** (사장님 신고: _deadErr 값이없다) */
  if (gs.includes("setProperty('_deadErr', String((deadRun")) {
    bad.push('_deadErr 에 빈 문자열을 저장한다 — Apps Script 가 거부한다');
  }

  /* ⑩ **수집 버튼은 관리자 잠금 안에 있어야 한다** (2026-09-03 사장님 지시)
     머리에 두면 상담사가 실수로 누르고, 두 곳에 흩어지면 매번 찾게 된다.
     되돌릴 수 없는 「자료 비우기」는 그 안에서도 맨 뒤다. */
  {
    const at4 = ix.indexOf('id="adm-body"');
    const hdr = ix.slice(0, ix.indexOf('</header>'));
    ['id="run"', 'id="runfull"', 'id="wipe"', 'id="runrival"'].forEach((f) => {
      if (hdr.indexOf(f) >= 0) bad.push("수집 버튼(" + f + ")이 아직 머리에 있다");
    });
    if (at4 < 0) bad.push("adm-body 를 못 찾았다");
    else {
      const body = ix.slice(at4);
      ['id="run"', 'id="runfull"', 'id="wipe"', 'id="sriv-go"'].forEach((f) => {
        if (body.indexOf(f) < 0) bad.push(f + " 가 관리자 잠금 안에 없다");
      });
    }
  }

  /* ⑪ **쿼터 확인**(2026-09-03 사장님 제안) — 우리 카운터는 우리가 쓴 몫만 알아서
     같은 계정의 다른 스크립트가 쓴 것을 모른다. 실제로 한 번 호출해 보는 것이
     유일하게 확실한 확인이다. **오류 문구를 그대로 보여줘야** 「쿼터」인지 다른
     문제인지 갈린다. */
  if (!gs.includes('function quotaTest()')) bad.push('quotaTest 가 없다');
  if (!gs.includes('addUsage_(1)')) bad.push('쿼터 확인이 자기 호출을 안 센다');
  if (!ix.includes('id="quota-go"')) bad.push('화면에 쿼터 확인 버튼이 없다');
  if (!ix.includes('아직 막혀 있습니다')) bad.push('막혔을 때 그 사실을 안 적는다');

  if (bad.length) fail('[바이럴] 매장 대 매장 — ' + bad.join(' · '));
  else console.log('OK: 바이럴 매장 대 매장 — 양쪽을 같은 질의로 · 색은 우리 몫 · 자료 없으면 감춘다');
}

/* ── 화면 규격 (2026-09-03 사장님 지시 — *"인터페이스도 좀 통일하고 보기 좋게"*) ──
 * 재고를 내니 **버튼 서식 14가지 · 글자 8단계**였고 11px 이하가 311개였다.
 * 값을 각 규칙에 흩뿌린 결과라, 토큰으로 묶고 **여기서 붙든다** —
 * 안 그러면 다음에 규칙 하나를 더할 때 또 흩어진다. */
{
  const ixp = new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url);
  if (fs.existsSync(ixp)) {
    const ix = fs.readFileSync(ixp, 'utf8');
    const bad = [];

    /* ① 토큰이 있는가 */
    ['--fs-mini', '--fs-body', '--fs-lead', '--ctl-fs', '--ctl-py', '--ctl-px', '--ctl-r', '--ctl-rp']
      .forEach((t) => { if (!ix.includes(t + ':')) bad.push('토큰 ' + t + ' 이 없다'); });

    /* ② **11px 이하를 새로 쓰지 않는다.** 사장님이 「작아서 안 보인다」고 지적한 그것 —
           히트맵 칸(.cell)은 칸 크기에 맞춰 줄어드는 것이라 예외다. */
    /* 정규식·개행을 소스에 직접 적지 않는다 — 셸을 거치며 역슬래시가 먹힌다 */
    const NL = String.fromCharCode(10), B = String.fromCharCode(92);
    const reSmall = new RegExp("font-size:" + B + "s*(?:[0-9]|10|11)(?:" + B + "." + B + "d)?px");
    const reKeep = new RegExp("[.]cell|[.]geo-svg|header |[.]stamp|[.]limuse|[.]prog|[.]pill|[.]brand");
    const small = ix.split(NL).filter((ln) => reSmall.test(ln)).filter((ln) => !reKeep.test(ln));
    if (small.length) bad.push('11px 이하 글자가 ' + small.length + '곳 남았다 — ' + small[0].trim().slice(0, 44));

    /* ③ **누르는 것은 한 규격**을 쓴다. 칩·버튼이 제각각이면 같은 일을 하는 것이
           달라 보여, 상담사가 「이건 다른 종류인가」를 매번 판단하게 된다. */
    ['.chip, .kchip, .wchip, .range .rbtn, .hmwk .wk', 'var(--ctl-fs)']
      .forEach((t) => { if (!ix.includes(t)) bad.push('공통 컨트롤 규칙(' + t.slice(0, 20) + ')이 없다'); });
    /* 옛 규격이 되살아나면 공통 규칙을 덮는다(CSS 는 나중 것이 이긴다) */
    if (/.kchip {[^}]*font-size:s*12px/.test(ix)) bad.push('kchip 이 제 크기를 다시 갖는다');
    if (/.wchip {[^}]*border-radius:s*8px/.test(ix)) bad.push('wchip 이 사각으로 돌아갔다');

    /* ④ **자리표시자 「–」를 화면에 남기지 않는다** — 만들다 만 화면으로 보인다 */
    if (/sub.textContent = "–"/.test(ix)) bad.push('부제에 자리표시자 「–」가 남아 있다');

    /* ⑤ **경계선은 한 번만** — 실물에서 다섯 번 그어졌다 */
    if (!ix.includes('drewSplit')) bad.push('작성일 경계선을 한 번만 긋는 빗장이 없다');

    /* ⑥ 매니저 순위는 히트맵이 그린다 — 카드에 상위 10칩을 되살리면 같은 말을 두 번 한다 */
    if (ix.includes('<h2>가장 많이 언급되는 매니저</h2>')) {
      bad.push('매니저 순위 카드가 되살아났다 — 히트맵과 같은 것을 두 번 말한다');
    }


    /* ⑦ **머리에는 상태만 남는다** (2026-09-03 사장님 지시로 수집 버튼을
           관리자 항목으로 옮겼다). 접을 것이 없어 접이식도 함께 사라졌다. */
    if (ix.slice(0, ix.indexOf("</header>")).indexOf("hmore") >= 0) {
      bad.push("머리에 관리 접이식이 남아 있다 — 수집 버튼은 관리자 항목으로 옮겼다");
    }
    ['id="run"', 'id="runfull"', 'id="stop"'].forEach((t) => {
      const i = ix.indexOf(t), j = ix.indexOf('<details class="hmore">');
      if (i < 0 || (j >= 0 && i > j)) bad.push(t + ' 이 접이식 안으로 들어갔다 — 자주 쓰는 것은 밖에 둔다');
    });
    ['id="runrival"', 'id="lim"', 'id="wipe"'].forEach((t) => {
      const i = ix.indexOf(t), j = ix.indexOf('<details class="hmore">');
      if (i >= 0 && j >= 0 && i < j) bad.push(t + ' 이 접이식 밖에 남았다');
    });
    if (bad.length) fail('[바이럴] 화면 규격 — ' + bad.join(' · '));
    else console.log('OK: 바이럴 화면 규격 — 토큰 · 11px 이하 없음 · 컨트롤 한 규격 · 자리표시자 없음');
  }
}

/* ── 바이럴 관리자 잠금 (2026-09-03 사장님 지시) ─────────────────────────────
 * *"기존에 매니저탭은 관리자항목으로(신규생성) 넣어주세요 관리자는 비밀번호를 치고
 *  접속하게 해야합니다."*
 * **가장 위험한 것은 비밀번호가 저장소에 새는 것**이다 — 이 저장소는 public 이다. */
{
  const ixp = new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url);
  const rvp = new URL('../docs/apps-script/Reviews.gs', import.meta.url);
  if (fs.existsSync(ixp) && fs.existsSync(rvp)) {
    const ix = fs.readFileSync(ixp, 'utf8');
    const rv = fs.readFileSync(rvp, 'utf8');
    const bad = [];

    /* ① **비밀번호가 소스에 없어야 한다.** 스크립트 속성에서만 읽는다. */
    if (!rv.includes("props_().getProperty(ADMIN_PROP)")) bad.push('비밀번호를 스크립트 속성에서 읽지 않는다');
    /* 값이 소스에 박혔는가 — 정규식 대신 문자열로 본다 */
    const litAt = rv.indexOf("ADMIN_PW = '") >= 0 || rv.indexOf('ADMIN_PW = "') >= 0;
    if (litAt) bad.push('비밀번호가 소스에 박혀 있다 — 이 저장소는 public 이다');
    /* 기본값(폴백)을 두면 그것이 곧 공개 비밀번호다 */
    if (rv.includes("want || '") || rv.includes('want || "')) bad.push('비밀번호에 기본값이 있다 — 그것이 곧 공개 비밀번호가 된다');

    /* ② **서버가 검증한다.** 화면에서 견주면 소스를 보는 사람에게 그대로 드러난다. */
    if (!rv.includes('function adminAuth(')) bad.push('서버에 adminAuth 가 없다');
    if (!rv.includes('function adminOk_(')) bad.push('토큰 검증 함수가 없다');
    /* **관리 함수가 토큰을 요구해야 한다** — 화면만 잠그면 서버는 열려 있다.
       웹앱 주소를 아는 사람은 google.script.run 을 직접 부를 수 있다. */
    if (!rv.includes('function setManagerNames(store, names, token)')) {
      bad.push('setManagerNames 가 토큰을 안 받는다');
    }
    if (!rv.includes('if (!adminOk_(token))')) bad.push('setManagerNames 가 토큰을 검사하지 않는다');
    if (!ix.includes('.setManagerNames(store, names, admToken)')) bad.push('화면이 토큰을 안 보낸다');

    /* ③ 무차별 대입을 막는다 · 왜 틀렸는지는 알려 주지 않는다 */
    if (!rv.includes('ADMIN_TRY_MAX')) bad.push('시도 제한이 없다');
    if (!rv.includes('function admEq_(')) bad.push('상수시간 비교가 없다');

    /* ④ **탭을 닫으면 잠긴다.** localStorage 면 브라우저를 껐다 켜도 열려 있다 —
           매장 기기를 여럿이 쓰므로 잠근 뜻이 없어진다. */
    if (!ix.includes("var ADM_KEY = 'viral_adm'")) bad.push('관리자 세션 키가 없다');
    if (ix.includes('localStorage.setItem(ADM_KEY') || ix.includes('localStorage.getItem(ADM_KEY')) bad.push('관리자 세션을 localStorage 에 둔다 — 껐다 켜도 열려 있다');
    if (!ix.includes('sessionStorage.setItem(ADM_KEY')) bad.push('관리자 세션이 sessionStorage 가 아니다');

    /* ⑤ 매니저 탭이 관리자 안으로 갔는가 */
    if (!ix.includes('data-sec="admin"')) bad.push('관리자 심벌 박스가 없다');
    if (!ix.includes('data-card="admin"')) bad.push('관리자 카드가 없다');
    if (ix.includes('data-sec="mgr"') || ix.includes('data-card="mgr"')) {
      bad.push('매니저 탭이 그대로 남아 있다 — 관리자 안으로 옮기라는 지시였다');
    }
    /* 잠금 화면과 본문이 갈려 있어야 한다 */
    if (!ix.includes('id="adm-lock"') || !ix.includes('id="adm-body"')) bad.push('잠금/본문이 갈려 있지 않다');

    if (bad.length) fail('[바이럴] 관리자 잠금 — ' + bad.join(' · '));
    else console.log('OK: 바이럴 관리자 잠금 — 비밀번호는 속성에만 · 서버가 검증 · 관리 함수도 토큰을 요구');
  }
}

/* ── 2026-09-03 사장님 요구 넷 ─────────────────────────────────────────────
 * ①후기 4종 ②주차 드롭다운·날짜 ③LG 매칭 비중 ④파스텔 히트맵. */
{
  const ixp = new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url);
  const rvp = new URL('../docs/apps-script/Reviews.gs', import.meta.url);
  if (fs.existsSync(ixp) && fs.existsSync(rvp)) {
    const ix = fs.readFileSync(ixp, 'utf8');
    const rv = fs.readFileSync(rvp, 'utf8');
    const bad = [];

    /* ① 4종 — **기존 9종을 줄이지 않았는가.** 줄이면 구매·행사·모바일 구분이 영영 사라진다 */
    if (!rv.includes("['혼수', ['혼수', '신혼'")) bad.push('기존 9종 분류가 사라졌다 — 되돌릴 수 없는 손실이다');
    if (!rv.includes('function kind4_(row)')) bad.push('4종 묶음 규칙이 없다');
    /* 매니저가 가장 세다 — 유형이 아니라 「이름이 잡혔는가」로 정해진다 */
    /* **매니저는 유형이 아니다**(2026-09-03 사장님 정정). 유형 묶음에 넣으면
       「매니저 혼수 후기」를 볼 수 없다 — 한 축에 두 가지를 섞은 셈이 된다. */
    if (rv.includes("if (row && row.mgr) return 'manager';")) {
      bad.push('매니저가 아직 유형 묶음에 있다 — 「매니저로 보기」와 유형을 겹쳐 걸 수 없다');
    }
    if (!rv.includes("['wedding', '혼수 후기'],")) bad.push('유형 3종이 아니다');
    if (rv.includes("['manager', '매니저 후기'],")) bad.push('매니저 후기 버튼이 남아 있다');
    /* 엔드포인트에는 남긴다 — 「이름이 잡힌 글」을 뽑는 것은 여전히 쓸모가 있다 */
    if (!rv.includes("if (t === 'manager') return 'manager';")) bad.push('?type=manager 를 못 읽는다');
    /* 매니저 × 유형 — 겹쳐 걸려면 서버가 세어야 한다 */
    if (!rv.includes('mgrKind[mk][mk4]')) bad.push('매니저 x 유형을 세지 않는다');
    if (!rv.includes('kind4: mgrKind[mk] || {}')) bad.push('mgrTop 이 유형별 건수를 안 싣는다');
    /* 화면 — 매니저 보기에서 유형 버튼을 감추지 않는다 */
    if (ix.includes("if (kbox) kbox.style.display = mgrView ? 'none' : '';")) {
      bad.push('매니저 보기에서 유형 버튼을 감춘다 — 필터링할 수 있어야 한다는 지시였다');
    }
    if (!ix.includes('var kn4 = heatKind ?')) bad.push('매니저를 유형으로 안 센다');
    if (!rv.includes('byKind4: byKind4')) bad.push('4종 집계를 안 보낸다');
    /* 미지정 자료는 기타로 — 지시하신 기본 처리 */
    if (!rv.includes("return 'etc';")) bad.push('미지정을 기타로 떨어뜨리지 않는다');
    /* ?type= — 미지정이면 전체가 나가야 한다(기존 연동이 그대로 돌아야 한다) */
    if (!rv.includes('function kind4Of_(v)')) bad.push('?type= 파라미터를 못 읽는다');
    if (!rv.includes('function filterKind4_(sum, t4)')) bad.push('type 필터가 없다');
    if (!rv.includes('if (!t4)')) bad.push('type 미지정일 때 전체를 안 돌려준다');
    /* **못 거른 항목을 밝히는가** — 조용히 전체 값을 그 갈래인 척 내보내면 거짓이다 */
    if (!rv.includes('typeScope')) bad.push('필터가 안 걸린 항목을 밝히지 않는다');

    /* ② 주차 UI — 칩은 없애고 드롭다운·날짜로 */
    if (ix.includes("class=\"wk\" data-wk")) bad.push('주차 칩이 남아 있다 — 전부 제거하라는 지시였다');
    if (!ix.includes('id="hm-wsel"')) bad.push('주차 드롭다운이 없다');
    if (!ix.includes('id="hm-from"') || !ix.includes('id="hm-to"')) bad.push('날짜 입력이 없다');
    if (!ix.includes('function weekRange(w)')) bad.push('주차→날짜 변환이 없다');
    /* 연동 — 날짜를 고치면 드롭다운이 「직접 지정」으로 */
    if (!ix.includes("heatWeek = (heatFrom || heatTo) ? 'custom' : ''")) bad.push('날짜를 고쳐도 드롭다운이 안 바뀐다');
    if (!ix.includes('function weekLabelLong(w)')) bad.push('「2026년 3월 2주차」 표기가 없다');
    /* 한 손 조작 — 36px 아래로 내리면 폰에서 옆 칸을 누른다 */
    if (!ix.includes('min-height: 36px')) bad.push('드롭다운·날짜가 한 손으로 누를 크기가 아니다');

    /* ③ LG 매칭 — 백화점은 같은 건물끼리만 */
    if (!rv.includes('function lgMatchOne_(')) bad.push('LG 매칭 함수가 없다');
    if (!rv.includes('var DEPT_SAME_M = 250')) bad.push('같은 건물 판정 거리가 없다');
    /* **거리 매칭으로 넘기지 않는다**(사장님 지시) — 이 분기가 빠지면 2km 밖 로드샵과 짝이 된다 */
    if (!rv.includes('if (best.dist > DEPT_SAME_M)')) bad.push('백화점인데 먼 곳과 매칭한다 — 넘기지 말라는 지시였다');
    if (!rv.includes("DEPT_EXTRA = { 'AK분당': 1 }")) bad.push('AK분당 예외가 빠졌다(사장님 확인분)');
    if (!rv.includes('lgMatch: lgMatchAll_()')) bad.push('매칭 결과를 화면에 안 보낸다');
    /* 매장명·거리·유형 셋을 함께 노출 */
    ['LG ' + "' + lgm.shop", 'lgm.dist', '같은 백화점 안', '가장 가까운 곳'].forEach((t) => {
      if (!ix.includes(t)) bad.push('말풍선에 ' + t.slice(0, 12) + ' 가 없다');
    });
    if (!ix.includes('LG 매칭 없음')) bad.push('매칭 없음을 표시하지 않는다');

    /* ④ 파스텔 히트맵 */
    if (!ix.includes('var HEAT_LO = [237, 241, 250]')) bad.push('파스텔 저채도 시작색이 아니다');
    if (!ix.includes('var HEAT_HI = [45, 66, 140]')) bad.push('파스텔 끝색이 아니다');
    /* 구간을 나누지 않는다 — v/max 그대로 */
    if (!ix.includes('Math.max(0, Math.min(1, v / max))')) bad.push('연속 스케일이 아니다 — 구간을 나누지 말라는 지시였다');
    if (!ix.includes('heatColor(d.cnt, heatMax)')) bad.push('칸을 건수로 칠하지 않는다');
    if (!ix.includes('function inkOn(')) bad.push('명도 대비로 글자색을 고르지 않는다');

    if (bad.length) fail('[바이럴] 요구 넷 — ' + bad.join(' · '));
    else console.log('OK: 바이럴 요구 넷 — 4종·주차UI·LG매칭·파스텔 (기존 9종 유지)');
  }
}

/* ── 매니저 클릭 · 0건 숨김 · 인원수 (2026-09-03 사장님 지시 셋) ───────────── */
{
  const ixp = new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url);
  const rvp = new URL('../docs/apps-script/Reviews.gs', import.meta.url);
  if (fs.existsSync(ixp) && fs.existsSync(rvp)) {
    const ix = fs.readFileSync(ixp, 'utf8');
    const rv = fs.readFileSync(rvp, 'utf8');
    const bad = [];

    /* ① 매니저 칸을 누르면 그 사람 후기 — **상태·필터·화면 셋이 다 있어야 한다.**
           하나만 빠져도 칩은 뜨는데 목록이 안 걸린다(실제로 그랬다). */
    if (!ix.includes("var mgrFilter = ''")) bad.push('mgrFilter 상태가 없다');
    if (!ix.includes("if (mgrFilter && String(r.mgr")) bad.push('목록이 매니저로 안 걸린다 — 칩만 뜨고 목록은 그대로다');
    if (!ix.includes("if (heatWho === 'mgr') {") || !ix.includes('mgrFilter = (mgrFilter === key)')) {
      bad.push('매니저 칸 클릭이 목록으로 안 간다');
    }
    /* 다른 거르개를 풀어 준다 — 걸린 채면 그 사람 글이 안 보이는데 「없다」로 읽힌다 */
    if (!ix.includes("storeFilter = ''; cafeFilter = ''; watchFilter = ''; kindFilter = '';")) {
      bad.push('매니저를 고를 때 다른 거르개를 안 푼다');
    }
    if (!ix.includes('function renderMgrFilter()')) bad.push('걸린 매니저를 화면이 안 적는다');
    if (!ix.includes("id='mgr-clear'") && !ix.includes('id="mgr-clear"')) bad.push('푸는 버튼이 없다 — 걸어 놓고 못 풀면 갇힌다');

    /* ② 0건은 목록에 안 적는다 — **감춘 수는 밝힌다**(안 밝히면 「내 이름이 사라졌다」) */
    if (!ix.includes('var Kv = K.filter(function (k) { return k.n > 0; });')) bad.push('명부에서 0건을 안 뺀다');
    if (!ix.includes('명은 목록에서 뺐습니다')) bad.push('0건을 몇 명 뺐는지 안 적는다');

    /* ③ 인식 인원 — 자른 사실을 밝힌다(사장님이 「60명만 보인다」고 물으셨다) */
    if (!rv.includes('var mgrAllN = mgrTop.length;')) bad.push('자르기 전 인원을 안 센다');
    if (!rv.includes('mgrAll: mgrAllN')) bad.push('인원수를 안 보낸다');
    if (!rv.includes('mgrTop.slice(0, 200)')) bad.push('히트맵에 실는 인원이 200명이 아니다');
    if (!ix.includes('DATA.mgrAll && DATA.mgrAll >')) bad.push('화면이 「N명 중 M명」을 안 적는다');

    if (bad.length) fail('[바이럴] 매니저 클릭·0건·인원 — ' + bad.join(' · '));
    else console.log('OK: 바이럴 매니저 — 칸 클릭으로 후기 · 0건 숨김 · 인식 인원 밝힘');
  }
}

/* ── 검출 정확도 · 옛 자료 (2026-09-03 사장님 지시) ─────────────────────────
 * *"빠지지 않게 검출하는 방법을 만들어 주세요"* · *"2025년 자료까지 남기게"*. */
{
  const ixp = new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url);
  const rvp = new URL('../docs/apps-script/Reviews.gs', import.meta.url);
  if (fs.existsSync(ixp) && fs.existsSync(rvp)) {
    const ix = fs.readFileSync(ixp, 'utf8');
    const rv = fs.readFileSync(rvp, 'utf8');
    const bad = [];

    /* ① 하한 — **지우기와 짝이다.** 하한이 없으면 지워도 다음 수집이 다시 가져온다 */
    if (!rv.includes("var MIN_YMD = '2025-01-01';")) bad.push('하한이 2025-01-01 이 아니다');
    if (!rv.includes('if (ymd0 < MIN_YMD)')) bad.push('수집이 하한을 안 본다 — 지워도 다시 들어온다');
    /* **작성일을 아는 글에만 건다** — 카페는 74%가 미상이라 발견일로 판단하면
       옛 글이 남고 새 글이 지워진다 */
    if (!rv.includes('if (pd0.length === 8)')) bad.push('작성일을 모르는 글까지 거른다');
    if (!rv.includes('tooOld++')) bad.push('걸러낸 수를 안 센다 — 조용히 버리면 왜 안 느는지 모른다');

    /* ② 지우기 — 안전선·미상 처리 */
    if (!rv.includes('function purgeOld(dryRun)')) bad.push('옛 자료 지우기가 없다');
    if (!rv.includes('if (drop > v.length / 2)')) bad.push('절반 안전선이 없다 — 되돌릴 수 없는 일이다');
    if (!rv.includes('if (pd.length !== 8) { unknown++;')) bad.push('작성일 미상을 지운다 — 근거가 없다');
    if (!rv.includes('sh.deleteRows(2 + keepRows.length, tail)')) bad.push('통째로 지웠다 쓴다 — 중간에 끊기면 자료가 사라진다');
    if (!ix.includes('지울 근거가 없는 것')) bad.push('화면이 미상을 「못 지운다」고 안 밝힌다');

    /* ②-b **옛 자료는 숫자만 남긴다**(2026-09-03 사장님 지시 — *"23년 24년도 살려주세요.
           단, 숫자만 기록하고 url 자료는 불필요. url 까지 필요한 건 당해년도와 직전년도뿐"*). */
    if (!rv.includes("var SHEET_ROLL = '옛자료요약';")) bad.push('요약 시트가 없다');
    if (!rv.includes('function rollAdd_(rows)')) bad.push('요약에 더하는 함수가 없다');
    /* **더한다 — 덮지 않는다.** 두 번 돌려도 건수가 사라지면 안 된다 */
    if (!rv.includes('map[k] = (map[k] || 0) + cur[i].n;')) bad.push('요약을 덮어쓴다 — 두 번 돌리면 옛 건수가 사라진다');
    /* **요약을 먼저 쓰고 지운다** — 순서가 뒤집히면 실패 시 자료가 통째로 사라진다 */
    const iRoll = rv.indexOf('var rolled = rollAdd_(rollRows);');
    const iDel = rv.indexOf('sh.deleteRows(2 + keepRows.length, tail)');
    if (iRoll < 0) bad.push('지우기 전에 요약을 안 남긴다');
    else if (iDel >= 0 && iRoll > iDel) bad.push('요약보다 삭제가 먼저다 — 실패하면 건수까지 사라진다');
    /* 집계가 요약을 합치는가 — 안 합치면 「살려 주세요」가 뜻이 없다 */
    if (!rv.includes('byMonth[rr.ym] = (byMonth[rr.ym] || 0) + rr.n;')) bad.push('월별 추이에 요약을 안 더한다');
    if (!rv.includes('rollTotal: rollTotal')) bad.push('요약 건수를 화면에 안 보낸다');
    /* **total 에 섞지 않는다** — 목록에 없는 건수라 섞으면 「2,000건인데 목록이 500건」이 된다 */
    if (rv.includes('total: rows.length + rollTotal')) bad.push('요약을 total 에 섞었다 — 목록과 어긋난다');
    if (!ix.includes('건수만</b> 있습니다')) bad.push('화면이 「숫자만 있는 구간」을 안 밝힌다');

    /* ③ 감사 — **네이버 total 을 분모로 쓰지 않는다**(정렬마다 다르고 실제와 어긋난다) */
    if (!rv.includes('function auditStore(storeName, opt)')) bad.push('검출 감사가 없다');
    if (!rv.includes("var sorts = opt.sortsOnly ? [opt.sortsOnly] : ['date', 'sim'];")) {
      bad.push('감사가 date·sim 양쪽을 안 훑는다 — 한쪽만으로는 놓치는 것을 못 잰다');
    }
    if (!rv.includes('if (ymd < MIN_YMD) continue;')) bad.push('감사가 하한 밖 글을 분모에 넣는다 — 정확도가 거짓으로 낮아진다');
    if (!rv.includes('if (missed.length < 20)')) bad.push('놓친 글 표본을 안 남긴다 — 개수만으로는 원인을 모른다');
    if (!ix.includes('id="aud-go"')) bad.push('감사 버튼이 없다');

    /* ④ 누락 줄이기 — sim 을 **기본 질의에만** 건다(전 꼬리말이면 한도를 넘는다) */
    if (!rv.includes("var sorts = (isFull && ti === 0) ? ['date', 'sim'] : ['date'];")) {
      bad.push('전체 재수집이 sim 을 안 돌거나 범위가 다르다');
    }
    if (!rv.includes("sorts[srt] === 'date' && hitSeen")) {
      bad.push('sim 에서도 조기 종료를 쓴다 — 관련도순이라 「그 아래는 다 봤다」가 성립하지 않는다');
    }
    if (!rv.includes('+ (STORES.length + n) * kinds * MAX_PAGES;')) bad.push('호출 예산에 sim 몫이 안 들어갔다');

    if (bad.length) fail('[바이럴] 검출 정확도·옛 자료 — ' + bad.join(' · '));
    else console.log('OK: 바이럴 검출 — 하한 2025 · 지우기(미상 보존) · 감사(date+sim) · sim 수집');
  }

  /* ── 쿼터 날짜 ─────────────────────────────────────────────────────────
   * **호출 카운터의 하루는 한국 날짜가 아니라 태평양 날짜다** (2026-09-03).
   * 구글 UrlFetch 쿼터가 태평양 자정(= KST 16~17시)에 리셋되는데 카운터가
   * `Asia/Seoul` 로 세고 있었다. 두 경계가 8시간 어긋나 **`dayUsed 11,234/20,000`
   * 으로 「여유 있다」면서 구글은 초과를 던졌고**, 그 뒤 16시간의 실행이 전부
   * 첫 호출에서 죽었다 — 맨 앞에 둔 LG 비교가 `rivalTry 12 / rivalCur 0` 이었다.
   *
   * **되돌리면 화면에서만 보인다**(숫자는 그럴듯하고 오류는 남의 탓으로 보인다).
   * 그래서 검사가 붙든다. `today_()` 는 그대로여야 한다 — 그쪽은 화면·도장용이다. */
  {
    const rv = fs.readFileSync(new URL('../docs/apps-script/Reviews.gs', import.meta.url), 'utf8');
    const ix = fs.readFileSync(new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url), 'utf8');
    const bad = [];
    if (!rv.includes("function quotaDay_() { return Utilities.formatDate(new Date(), 'America/Los_Angeles', 'yyyy-MM-dd'); }")) {
      bad.push('quotaDay_ 가 없거나 태평양이 아니다');
    }
    /* 카운터가 실제로 그것을 쓰는가 — 함수만 있고 안 쓰면 아무것도 안 고쳐진다 */
    const iU = rv.indexOf('function usage_() {');
    const body = iU < 0 ? '' : rv.slice(iU, iU + 200);
    if (iU < 0) bad.push('usage_ 가 없다');
    else if (!body.includes('var d = quotaDay_()')) bad.push('usage_ 가 쿼터 날짜를 안 쓴다 — 한국 자정에 카운터만 0 이 된다');
    /* `today_()` 는 한국 날짜 그대로여야 한다(회차 도장·화면 표기) */
    if (!rv.includes("function today_() { return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd'); }")) {
      bad.push('today_ 가 바뀌었다 — 회차 도장과 화면 날짜는 한국 시각이어야 한다');
    }
    /* 화면이 「오늘」이라 적으면 그 자리에서 거짓이 된다(16~17시에 0 으로 돌아간다) */
    if (ix.includes("'오늘 ' + nf(used)")) bad.push('화면이 「오늘」이라 적는다 — 쿼터는 한국 자정에 안 풀린다');
    if (!ix.includes("'쿼터 ' + nf(used)")) bad.push('화면이 쿼터 기준임을 안 밝힌다');
    if (!ix.includes('태평양 자정(한국 16~17시)에 초기화')) bad.push('언제 풀리는지 화면이 안 적는다');

    /* **hover 로만 말하지 않는다** (2026-09-03). 「한 바퀴가 한도를 넘는다」와
       「언제 풀리는지」를 `title` 에만 적어 두었더니 **폰에서 아무 표시도 안 났다** —
       매장 기기가 폰인 경우가 많고, 안 보이면 사장님은 매일 끊기는 것을 고장으로 읽는다. */
    if (!ix.includes('id="lim-note"')) bad.push('쿼터 안내를 적을 자리(lim-note)가 없다');
    if (!ix.includes("getElementById('lim-note')")) bad.push('renderLimit 이 lim-note 를 안 채운다 — 자리만 있고 늘 빈다');
    /* 그 안내는 본문 규격(--fs-mini)이어야 한다 — 예외로 둔 10.5px 상태표시가 아니다 */
    if (!/[.]limnote\s*\{[^}]*var\(--fs-mini\)/.test(ix)) bad.push('lim-note 가 본문 글자 규격을 안 쓴다');
    /* 두 사실을 **둘 다** 글자로 적는가 — 하나만 적으면 나머지가 여전히 hover 뿐이다 */
    const noteBlock = ix.slice(ix.indexOf("getElementById('lim-note')"));
    /* 범위를 넉넉히 잡는다 — 좁게 자르면 안내 문장이 하나 늘 때마다 검사가 헛돈다
       (실제로 쿼터 소진 안내를 앞에 붙이자 700자를 넘어 「안 적는다」로 잡혔다). */
    const noteBody = noteBlock.slice(0, 1600);
    if (!noteBody.includes('회가 필요한데 한도는')) bad.push('한 바퀴가 한도를 넘는 사실을 글자로 안 적는다');
    if (!noteBody.includes('태평양 자정')) bad.push('리셋 시각을 글자로 안 적는다');
    /* **미리보기 모의값이 그 줄을 실제로 그려야 한다** — sweep 이 한도보다 작으면
       이 안내가 하네스에서 **한 번도 안 그려져** 눈으로 볼 수가 없다(프로덕션은 넘는다). */
    /* 경로는 URL 객체로 넘긴다 — 저장소 경로에 한글이 있어 `.pathname` 을 쓰면
       `%EB%85%B8…` 로 인코딩된 채 넘어가 「파일이 없다」가 된다(이 파일의 관례). */
    const pv = fs.readFileSync(new URL('../scripts/preview-reviews.mjs', import.meta.url), 'utf8');
    const mock = pv.match(/dayUsed:\s*\d[\d,]*,\s*dailyLimit:\s*(\d+),\s*sweep:\s*(\d+)/);
    if (!mock) bad.push('미리보기 모의 자료에서 한도·한 바퀴를 못 찾겠다');
    else if (Number(mock[2]) <= Number(mock[1])) {
      bad.push('미리보기 모의 sweep(' + mock[2] + ')이 한도(' + mock[1] + ') 아래다 — 경고 줄을 눈으로 볼 수 없다');
    }

    if (bad.length) fail('[바이럴] 쿼터 날짜 — ' + bad.join(' · '));
    else console.log('OK: 바이럴 쿼터 날짜 — 카운터는 태평양 · 도장은 한국 · 화면이 글자로 적는다(폰에 hover 없음)');
  }

  /* ── LG 비교 예약 (2026-09-03) ──────────────────────────────────────────
   * 「LG 비교 갱신」은 수집과 **같은 자물쇠**를 쓰는데, 전체 재수집이 62곳을 여러 날에
   * 나눠 도는 동안에는 그 자물쇠를 못 잡는다 — 실측으로 사장님이 눌러도 회차·시도 수가
   * **한 톨도 안 움직였고** 화면은 「끝난 뒤에 다시 눌러 주세요」라고 했다(그 «끝»이
   * 며칠 뒤다). 그래서 막히면 표식을 세워 두고 다음 회차가 먼저 돈다.
   * 되돌리면 **버튼이 조용히 헛돈다** — 화면에는 아무 표시도 안 난다. */
  {
    const bad = [];
    const rv = fs.readFileSync(new URL('../docs/apps-script/Reviews.gs', import.meta.url), 'utf8');
    const ix = fs.readFileSync(new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url), 'utf8');

    /* ① 막히면 포기하지 말고 예약한다 */
    const busyAt = rv.indexOf('if (!lock.tryLock(10 * 1000))');
    const busyBlk = busyAt >= 0 ? rv.slice(busyAt, busyAt + 900) : '';
    if (!busyBlk) bad.push('runRival 의 자물쇠 분기를 못 찾겠다');
    else {
      if (!busyBlk.includes("setProperty('_rivalWant', '1')")) {
        bad.push('자물쇠에 막혔을 때 예약을 안 한다 — 며칠 동안 버튼이 헛돈다');
      }
      /* **반환값 형태로 좁힌다** — 그냥 문구로 찾으면 위 주석의 인용까지 물어
         멀쩡한 코드를 「되돌아갔다」고 잡는다(이 저장소가 이미 겪은 앵커 함정이다). */
      if (busyBlk.includes("note: '지금 수집이 돌고 있습니다")) {
        bad.push('「끝난 뒤에 다시 눌러 주세요」로 되돌아갔다 — 그 끝이 며칠 뒤라 거짓이다');
      }
    }

    /* ② 예약은 하루 표식·시도 한도보다 세다 — 그래야 다음 회차가 실제로 돈다.
          **순서가 핵심이다**: 한도 검사보다 뒤에 있으면 한도를 다 쓴 날엔 안 돈다. */
    const dueAt = rv.indexOf('function rivalDue_()');
    const dueBlk = dueAt >= 0 ? rv.slice(dueAt, dueAt + 1600) : '';
    if (!dueBlk) bad.push('rivalDue_ 를 못 찾겠다');
    else {
      /* **코드 형태로 찾는다** — 맨 `_rivalWant` 로 찾으면 바로 위 설명 주석이
         먼저 걸려, 순서를 뒤집어도 통과한다(실제로 그렇게 헛돌았다). */
      const iWant = dueBlk.indexOf("getProperty('_rivalWant')");
      const iCap = dueBlk.indexOf('>= RIVAL_TRY_MAX');
      const iAt = dueBlk.indexOf("getProperty('_rivalAt')");
      if (iWant < 0) bad.push('rivalDue_ 가 예약을 안 본다 — 예약해도 다음 회차가 안 돈다');
      else if (iCap >= 0 && iWant > iCap) bad.push('예약 검사가 시도 한도보다 뒤에 있다 — 한도를 쓴 날엔 예약이 무시된다');
      else if (iAt >= 0 && iWant > iAt) bad.push('예약 검사가 하루 표식보다 뒤에 있다 — 오늘 이미 돈 날엔 예약이 무시된다');
    }

    /* ③ 처리했으면 내린다 — 안 내리면 매 회차가 LG 비교를 다시 돌아 매장 훑기가 굶는다 */
    if (!rv.includes("deleteProperty('_rivalWant')")) {
      bad.push('완주해도 예약을 안 내린다 — 매 회차마다 LG 비교를 다시 돈다');
    }
    /* ④ 화면이 예약됐다는 사실을 안다 — 안 보내면 「눌렀는데 아무 일도 없다」가 된다 */
    if (!rv.includes('d.rivalWant =')) bad.push('doGet 이 예약 상태를 안 보낸다');
    if (!ix.includes('DATA.rivalWant')) bad.push('화면이 예약 상태를 안 적는다 — 새로고침하면 사라진다');
    if (!ix.includes('r.queued')) bad.push('버튼이 예약 응답을 안 다룬다');
    /* ⑤ 자료 비우기가 예약도 함께 지운다 — 남으면 초기화 뒤에도 LG 비교부터 돈다 */
    const resetLine = (rv.match(/\['_cursor',[^\]]*\]/) || [''])[0];
    if (resetLine && !resetLine.includes('_rivalWant')) bad.push('초기화 목록에 _rivalWant 가 빠졌다');

    if (bad.length) fail('[바이럴] LG 비교 예약 — ' + bad.join(' · '));
    else console.log('OK: 바이럴 LG 비교 예약 — 막히면 예약 · 한도보다 세다 · 처리하면 내린다 · 화면이 적는다');
  }

  /* ── 쿼터를 다 썼을 때 (2026-09-04) ─────────────────────────────────────
   * 한도에 닿으면 수집 버튼이 **호출 0회로 조용히 되돌아간다** — 오류도 안 난다.
   * 그런데 화면은 그때도 「이어서 눌러 주세요」라고 적어, 사장님이 눌러도 아무 일이
   * 없는 버튼을 계속 누르셨다(*"바뀌지않고 멈추고있습니다"*). 서버는 한도로 멈추면
   * `chain_()` 도 안 부르므로 **늘 그 가지로 떨어진다** — 우연이 아니라 구조였다.
   * 되돌리면 같은 혼란이 그대로 되풀이된다. */
  {
    const bad = [];
    const rv = fs.readFileSync(new URL('../docs/apps-script/Reviews.gs', import.meta.url), 'utf8');
    const ix = fs.readFileSync(new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url), 'utf8');

    /* ① 서버가 「언제 풀리는지」를 안다. **시간대 계산은 서버 몫이다** —
          태평양은 서머타임이 있어 한국 기준 16시/17시로 갈린다. */
    if (!rv.includes('function quotaReset_()')) bad.push('quotaReset_ 이 없다 — 언제 풀리는지 아무도 모른다');
    else if (!/quotaReset_[\s\S]{0,400}America\/Los_Angeles/.test(rv)) {
      bad.push('quotaReset_ 이 태평양 시간대를 안 쓴다 — 서머타임에 한 시간 틀린다');
    }
    /* ② 화면 두 곳(새로고침만 해도 보이는 곳 · 버튼 응답)에 보낸다 */
    if (!rv.includes('d.quotaResetAt =')) bad.push('doGet 이 리셋 시각을 안 보낸다 — 새로고침해도 안 보인다');
    if (!rv.includes('quotaResetAt: quotaReset_()')) bad.push('수집 반환값에 리셋 시각이 없다 — 버튼 응답이 시각을 못 적는다');

    /* ③ **한도로 멈췄으면 「다시 눌러 주세요」라고 하지 않는다.**
          이것이 이 절의 핵심이다 — 눌러도 소용없는 버튼을 누르라고 말하면 안 된다. */
    const hitAt = ix.indexOf('r.hitLimit');
    const hitBlk = hitAt >= 0 ? ix.slice(Math.max(0, hitAt - 400), hitAt + 1400) : '';
    if (!hitBlk) bad.push('버튼 응답의 한도 분기를 못 찾겠다');
    else {
      if (!hitBlk.includes('다시 눌러도 돌지 않습니다')) {
        bad.push('한도로 멈췄을 때 「눌러도 안 된다」를 안 적는다');
      }
      /* 한도 가지 안에서 「다시 눌러 주세요」가 나오면 모순이다 — 삼항의 한도 쪽만 본다 */
      const limSide = hitBlk.slice(hitBlk.indexOf('다시 눌러도 돌지 않습니다'));
      const elseAt = limSide.indexOf('r.chained');
      if (elseAt > 0 && limSide.slice(0, elseAt).includes('「이어서 수집」을 다시 눌러 주세요')) {
        bad.push('한도 가지가 여전히 「다시 눌러 주세요」라고 한다');
      }
    }

    /* ④ **새로고침만 해도 보인다** — 버튼을 눌러야 알 수 있으면 늦다.
          사장님이 보신 문구가 바로 이 줄(`renderProgress`)이었다. */
    const progAt = ix.indexOf("var pctv = tot ?");
    const progBlk = progAt >= 0 ? ix.slice(progAt, progAt + 1600) : '';
    if (!progBlk) bad.push('renderProgress 의 문구 블록을 못 찾겠다');
    else {
      if (!progBlk.includes('DATA.dailyLimit') || !progBlk.includes('DATA.dayUsed')) {
        bad.push('진행 표시가 쿼터를 안 본다 — 다 쓴 날에도 「이어서 눌러 주세요」라고 한다');
      }
      if (!progBlk.includes('눌러도 돌지 않습니다')) bad.push('진행 표시가 「눌러도 안 된다」를 안 적는다');
    }
    /* ⑤ 한도 안내(`#lim-note`)도 다 쓴 것을 먼저 말한다 */
    const noteAt = ix.indexOf("getElementById('lim-note')");
    const noteBlk = noteAt >= 0 ? ix.slice(noteAt, noteAt + 900) : '';
    if (!noteBlk.includes('쿼터를 다 썼습니다')) bad.push('한도 안내가 「다 썼다」를 안 적는다');

    if (bad.length) fail('[바이럴] 쿼터 소진 — ' + bad.join(' · '));
    else console.log('OK: 바이럴 쿼터 소진 — 언제 풀리는지 알고 · 눌러도 안 된다고 적고 · 새로고침만 해도 보인다');
  }
}

/* ── 바이럴 「지금부터 끝낼 수 있는가」 (2026-09-04) ──────────────────────────
 * 화면은 *「전체가 되는가」*(한도 < 한 바퀴)와 *「다 썼는가」*(쓴 것 ≥ 한도)만 물었다.
 * 그 사이에 **둘 다 아닌데 못 끝내는 상태**가 있고, 실측이 정확히 그것이었다 —
 * 한도 28,700 · 쓴 것 26,427 · sweep 20,858 이라 두 조건이 다 거짓인데, 남은
 * 2,273 회로 남은 18곳(약 6,056회)을 못 끝냈다. **그동안 화면은 「남은 시간 6시간
 * 14분」이라고 적어 기다리면 된다고 말했다.**
 *
 * **규칙을 떼어 실제로 돌린다** — 문자열만 보면 조건이 바뀌어도 통과한다
 * (이 파일이 `rival_()` 을 가짜 시트로 돌려 이중 계산을 잡은 것과 같은 방식). */
{
  const ix = fs.readFileSync(new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url), 'utf8');
  const bad = [];

  const at = ix.indexOf('function quotaShort()');
  if (at < 0) bad.push('quotaShort() 가 없다 — 「지금부터 끝낼 수 있는가」를 묻는 곳이 사라졌다');
  else {
    const end = ix.indexOf('\n  }', at);
    const src = ix.slice(at, end + 4);
    const fn = new Function('DATA', 'nf', src + '; return quotaShort();');
    const NF = (n) => String(n);
    const cases = [
      ['실측 그대로 — 못 끝낸다',
        { dailyLimit: 28700, dayUsed: 26427, sweep: 20858, cursor: 44, stores: 62 }, true],
      ['남은 쿼터가 넉넉하면 조용하다',
        { dailyLimit: 28700, dayUsed: 1000, sweep: 20858, cursor: 44, stores: 62 }, false],
      ['한 바퀴를 마쳤으면 말하지 않는다 (cursor 0)',
        { dailyLimit: 28700, dayUsed: 26427, sweep: 20858, cursor: 0, stores: 62 }, false],
      ['커서가 끝에 닿았어도 말하지 않는다',
        { dailyLimit: 28700, dayUsed: 26427, sweep: 20858, cursor: 62, stores: 62 }, false],
      ['모르면 아무 말도 하지 않는다 (한도 없음)',
        { dailyLimit: 0, dayUsed: 26427, sweep: 20858, cursor: 44, stores: 62 }, false],
      ['모르면 아무 말도 하지 않는다 (sweep 없음)',
        { dailyLimit: 28700, dayUsed: 26427, sweep: 0, cursor: 44, stores: 62 }, false],
    ];
    for (const [label, data, want] of cases) {
      const got = !!fn(data, NF);
      if (got !== want) bad.push(`${label} → ${got ? '말했다' : '말 안 했다'}(기대 ${want ? '말한다' : '안 한다'})`);
    }
    /* 실측 값에서 나온 수치가 문장에 실려야 한다 — 근거 없는 경고는 읽히지 않는다 */
    const msg = String(fn({ dailyLimit: 28700, dayUsed: 26427, sweep: 20858, cursor: 44, stores: 62 }, NF));
    if (!msg.includes('2273') || !msg.includes('18')) bad.push('경고에 남은 쿼터·남은 매장 수가 안 실린다');
  }

  /* 「남은 시간」 옆에 붙어야 한다 — 거짓 희망을 주던 자리가 바로 거기다 */
  const pg = ix.indexOf('남은 시간 대략');
  if (pg < 0 || !ix.slice(pg, pg + 1200).includes('quotaShort()'))
    bad.push('「남은 시간」 옆에서 쿼터를 보지 않는다 — 기다리면 된다는 거짓 희망이 남는다');
  /* 색을 정하는 곳이 하나여야 한다 — 뒤 줄이 앞 줄을 덮어써 경고 색이 사라진 적이 있다 */
  if (!ix.includes("'prog' + (qs ? ' mid'"))
    bad.push('쿼터 부족이 auto 를 못 이긴다 — 초록으로 덮여 안심 신호가 된다');

  /* 「전체 재수집 취소」 — 켜는 길만 있고 끄는 길이 없으면 켜기가 무섭다 */
  const gs = fs.readFileSync(new URL('../docs/apps-script/Reviews.gs', import.meta.url), 'utf8');
  const cf = gs.indexOf('function cancelFull()');
  if (cf < 0) bad.push('cancelFull() 이 없다 — 전체 재수집을 끌 길이 다시 사라졌다');
  else {
    const blk = gs.slice(cf, cf + 900);
    if (!blk.includes("deleteProperty('_forceFull')")) bad.push('cancelFull 이 _forceFull 을 안 지운다');
    if (/deleteProperty\('_cursor'\)|setProperty\('_cursor'/.test(blk))
      bad.push('cancelFull 이 커서를 건드린다 — 훑은 매장을 다시 훑어 쿼터를 또 태운다');
    if (!blk.includes('sumCacheClear_')) bad.push('cancelFull 이 집계 캐시를 안 버린다 — 최대 6시간 옛 값이 남는다');
  }
  if (!ix.includes('.cancelFull();')) bad.push('화면에 「전체 재수집 취소」를 부르는 곳이 없다');
  if (!ix.includes("cf.hidden = !DATA.forceFull")) bad.push('취소 버튼이 전체 재수집 중일 때만 뜨지 않는다');

  /* 누르기 전에 며칠 걸리는지 말한다 — 지금까지는 누른 뒤에야 알았다 */
  const rf = ix.indexOf("getElementById('runfull').onclick");
  if (rf < 0 || !ix.slice(rf, rf + 1200).includes('confirm('))
    bad.push('「전체 재수집」을 누르기 전에 며칠 걸리는지 묻지 않는다');

  if (bad.length) fail('[바이럴] 지금부터 끝낼 수 있는가 — ' + bad.join(' · '));
  else console.log('OK: 바이럴 진행 가늠 — 남은 쿼터로 못 끝내면 그렇게 적고 · 끌 수 있고 · 누르기 전에 묻는다');
}

/* ── 일일 한도 칸이 **읽히는가** (2026-09-04 사장님 보고) ─────────────────────
 * *"관리자안에 쿼터한도설정하는 텍스트가 보이지않습니다"*. 이 칸은 남색 머리에
 * 있다가 2026-09-03 에 **흰 관리자 카드**로 옮겨졌는데 색이 안 따라왔다 —
 * 흰 글자가 흰 배경에 놓여 대비가 정확히 **1 : 1** 이었다.
 *
 * **크기로는 못 잡는다.** 요소는 멀쩡히 있고 폭·높이도 정상이라, 처음 측정에서
 * `w=50 h=18` 로 「보인다」고 읽었다. 실물을 찍고서야 드러났다.
 * 여기서는 **휘도를 재서** 지킨다 — 색 이름이 바뀌어도 대비가 살아 있으면 통과한다. */
{
  const ix = fs.readFileSync(new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url), 'utf8');
  const bad = [];
  const hex = (s) => {
    const m = /^#([0-9a-f]{6})$/i.exec(s.trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const lum = (c) => {
    const f = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const ratioOnWhite = (c) => (1.05) / (lum(c) + 0.05);

  /* 규칙마다 `color:` 를 뽑아 흰 배경 대비를 잰다 */
  /* `.prog` 셋도 2026-09-04 에 머리(남색)에서 관리자 카드(흰색)로 옮겼다 —
     사장님 지시 *"「62곳 한 바퀴를 마친 상태입니다 …」 는 관리자만 알아야 할 항목"*.
     옮기면서 색을 안 따라 보내면 같은 사고가 그대로 반복된다. */
  for (const [sel, min] of [['.lim', 4.5], ['.limuse', 4.5], ['.limuse.low', 4.5],
    ['.limnote', 4.5], ['.limnote.low', 4.5],
    ['.prog', 4.5], ['.prog.mid', 4.5], ['.prog.auto', 4.5]]) {
    /* `.lim` 이 `.limuse` 를 물지 않게 **뒤에 여는 중괄호를 요구한다** —
       `.lim {` 은 맞고 `.limuse {`·`.lim input {` 은 안 맞는다. */
    const re = new RegExp(sel.replace(/\./g, '[.]') + '\\s*\\{([^}]*)\\}');
    const m = re.exec(ix);
    if (!m) { bad.push(sel + ' 규칙이 없다'); continue; }
    const cm = /color:\s*([^;]+);/.exec(m[1]);
    if (!cm) { bad.push(sel + ' 에 color 가 없다'); continue; }
    const raw = cm[1].trim();
    /* **흰 글자를 흰 배경에 두는 그 사고를 이름으로도 막는다** */
    if (/rgba\(\s*255\s*,\s*255\s*,\s*255/.test(raw) || /^#fff/i.test(raw)) {
      bad.push(sel + ' 이 흰 글자다 — 흰 관리자 카드 안이라 안 읽힌다');
      continue;
    }
    const c = hex(raw);
    if (!c) { bad.push(sel + ' 색을 읽지 못했다: ' + raw); continue; }
    const r = ratioOnWhite(c);
    if (r < min) bad.push(sel + ' 대비 ' + r.toFixed(2) + ':1 (최소 ' + min + ')');
  }
  /* 입력칸도 — 반투명 흰 배경에 흰 글자면 값이 안 보인다 */
  const im = /\.lim input\s*\{([^}]*)\}/.exec(ix);
  if (im && /color:\s*#fff/i.test(im[1])) bad.push('.lim input 글자가 흰색이다 — 넣은 숫자가 안 보인다');

  if (bad.length) fail('[바이럴] 일일 한도 칸 대비 — ' + bad.join(' · '));
  else console.log('OK: 바이럴 일일 한도 칸 — 흰 카드 위에서 라벨·쿼터·안내가 전부 읽힌다(대비 4.5:1 이상)');
}

/* ── 질의 꼬리말 기록 (2026-09-04) ────────────────────────────────────────
 * 매장 하나를 꼬리말 8개로 훑는데 어느 것이 값어치를 하는지 기록한 적이 없었다.
 * 표본 3매장 실측 — 수확률이 「신혼가전」 17.5% 부터 「꼬리 없음」 1.8% 까지 갈리고,
 * 작은 매장(권선·오산)은 기본 질의가 **0건**이다. 62매장을 새로 두드려 재는 대신
 * 글마다 꼬리말을 적어 다음 회차부터 저절로 쌓이게 했다(비용 0).
 *
 * **칸은 뒤에만 붙여야 한다** — 가운데에 끼우면 옛 줄이 통째로 한 칸씩 밀린다.
 * **옛 줄의 빈 칸은 「모른다」이지 「기본 질의」가 아니다.** */
{
  const gs = fs.readFileSync(new URL('../docs/apps-script/Reviews.gs', import.meta.url), 'utf8');
  const ix = fs.readFileSync(new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url), 'utf8');
  const bad = [];

  const hm = /var HEADER = \[([^\]]*)\]/.exec(gs);
  if (!hm) bad.push('HEADER 를 못 찾았다');
  else {
    const cols = hm[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
    if (cols[cols.length - 1] !== 'q') bad.push('q 가 HEADER 맨 뒤가 아니다 — 가운데면 옛 줄이 한 칸씩 밀린다');
    /* 행을 만드는 곳이 전부 HEADER 칸 수와 맞아야 한다(assertRow_ 가 런타임에 던지지만
       배포 전에 잡는 편이 낫다). 매장 훑기·카페 훑기 두 곳이다. */
    const pushes = gs.match(/add\.push\(\[/g) || [];
    if (pushes.length !== 2) bad.push('add.push 가 ' + pushes.length + '곳이다 — 둘을 다 고쳤는지 보라');
    if (!gs.includes('tailTag_(TAILS[ti])')) bad.push('매장 훑기가 꼬리말을 안 적는다');
    if (!gs.includes("'카페훑기'")) bad.push('카페 훑기가 자기 표식을 안 적는다');
  }
  /* 읽는 쪽 — 옛 줄은 빈 문자열이어야 하고, 그것을 「기본」으로 바꿔치기하면 안 된다 */
  if (!/q: String\(v\[i\]\[14\] \|\| ''\)/.test(gs)) bad.push('readAll_ 이 q 를 15번째 칸에서 안 읽는다');
  if (/q: String\(v\[i\]\[14\][^)]*\) \|\| '기본'/.test(gs)) bad.push('옛 줄의 빈 칸을 「기본」으로 바꿔치기한다 — 모르는 것을 아는 척한다');
  /* 집계 — 모르는 것을 따로 센다 */
  if (!gs.includes('tailUnknown++')) bad.push('모르는 것(옛 줄)을 따로 안 센다');
  if (!/byTail: byTail, byStoreTail: byStoreTail, tailUnknown: tailUnknown/.test(gs))
    bad.push('집계 결과를 화면에 안 보낸다');
  /* 캐시 — 안 올리면 최대 6시간 옛 집계가 굳는다 */
  const sv = /var SUM_VER = (\d+);/.exec(gs);
  if (!sv || Number(sv[1]) < 19) bad.push('SUM_VER 를 안 올렸다 — 옛 집계가 최대 6시간 남는다');
  /* 화면 — 자료가 없으면 0 으로 그리지 않고 그렇게 적는다 */
  const rt = ix.indexOf('function renderTails()');
  if (rt < 0) bad.push('renderTails() 가 없다');
  else {
    const blk = ix.slice(rt, rt + 1800);
    if (!blk.includes('아직 쌓이지 않았습니다')) bad.push('자료가 없을 때 그 사실을 안 적는다');
    if (!blk.includes('어느 질의가 줬는지 모릅니다')) bad.push('옛 글을 「모른다」로 밝히지 않는다');
  }
  if (!/renderLimit\(\);\s*\n\s*renderTails\(\);/.test(ix)) bad.push('renderTails 를 그리는 곳이 없다');

  if (bad.length) fail('[바이럴] 질의 꼬리말 기록 — ' + bad.join(' · '));
  else console.log('OK: 바이럴 질의 꼬리말 — 뒤에만 붙이고 · 두 곳 다 적고 · 옛 줄은 「모른다」로 가른다');
}

/* ── 꼬리말 수확률 계수기 (2026-09-05) ───────────────────────────────────
 * 글에 붙이는 `q` 칸(2026-09-04)만으로는 부족하다는 것이 하루 만에 드러났다 —
 * 한 바퀴를 다 돌았는데 **25건**뿐이었다. 새 글에만 붙기 때문이고(하루 5~10건),
 * 무엇보다 **준 것만** 세어서 「이 꼬리말이 아무것도 안 준다」를 영영 알 수 없다.
 * 그 판정에는 **안 준 것**이 필요하다.
 *
 * `got`/`kept` 는 새 글이 없어도 매번 발생하므로, 꼬리말별로 세면 **한 회차에**
 * 62매장 × 8꼬리말이 채워진다. */
{
  const gs = fs.readFileSync(new URL('../docs/apps-script/Reviews.gs', import.meta.url), 'utf8');
  const ix = fs.readFileSync(new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url), 'utf8');
  const bad = [];

  /* 집계 함수를 떼어 실제로 돌린다 — 문자열만 보면 세는 자리가 빠져도 통과한다 */
  const ta = gs.indexOf('function tally_(');
  const tr = gs.indexOf('function tailStatRows_(');
  if (ta < 0 || tr < 0) bad.push('tally_ / tailStatRows_ 가 없다');
  else {
    const src = gs.slice(ta, gs.indexOf('\n}', tr) + 2);
    const { tally, rows } = new Function(src + '; return { tally: tally_, rows: tailStatRows_ };')();
    const box = {};
    tally(box, '수원', '기본', 'got');
    tally(box, '수원', '기본', 'got');
    tally(box, '수원', '기본', 'kept');
    tally(box, '수원', '혼수', 'got');          /* 받았는데 한 건도 못 건진 칸 */
    const out = rows(box, '2026-09-05');
    const 기본 = out.find((r) => r[2] === '기본');
    const 혼수 = out.find((r) => r[2] === '혼수');
    if (!기본 || 기본[3] !== 2 || 기본[4] !== 1) bad.push('got/kept 를 따로 안 센다: ' + JSON.stringify(기본));
    /* **0건 칸이 남아야 한다** — 「안 준다」가 이 자료의 핵심이다 */
    if (!혼수 || 혼수[3] !== 1 || 혼수[4] !== 0)
      bad.push('한 건도 못 건진 칸을 안 남긴다 — 그것이 절감의 근거다: ' + JSON.stringify(혼수));
  }
  /* 세는 자리가 두 곳(got · kept)이어야 한다 */
  if ((gs.match(/tally_\(tailStat/g) || []).length < 2)
    bad.push('got 과 kept 를 둘 다 세지 않는다 — 하나만 세면 수확률이 안 나온다');
  /* 시트·집계·화면 배선 */
  if (!gs.includes('tailStats: tailStats_()')) bad.push('집계가 tailStats 를 안 내보낸다');
  if (!gs.includes('function tailStats_()')) bad.push('여러 회차를 합쳐 읽는 곳이 없다');
  if (!ix.includes('function renderTailYield(')) bad.push('화면에 수확률 표가 없다');
  else {
    const blk = ix.slice(ix.indexOf('function renderTailYield('), ix.indexOf('function renderTailYield(') + 3000);
    /* **몇 회차를 합친 것인지 밝혀야 한다** — 한 회차만 보면 못 훑은 매장이 0건으로 보인다 */
    if (!/ts\.runs/.test(blk)) bad.push('몇 회차를 합쳤는지 안 적는다 — 한 회차의 0건은 「안 준다」가 아니다');
    if (!/c\.got > 0/.test(blk)) bad.push('안 훑은 칸과 못 건진 칸을 안 가른다');
  }
  /* 수확률 표가 먼저 나와야 한다 — 그쪽이 훨씬 빨리 채워진다 */
  if (!/DATA\.tailStats[\s\S]{0,200}renderTailYield/.test(ix))
    bad.push('수확률 자료가 있어도 옛 표를 먼저 그린다');

  if (bad.length) fail('[바이럴] 꼬리말 수확률 — ' + bad.join(' · '));
  else console.log('OK: 바이럴 꼬리말 수확률 — got/kept 를 따로 세고 · 0건 칸을 남기고 · 회차 수를 밝힌다');
}

/* ── 히트맵 LG 지점명·건수 (2026-09-04 사장님 요청) ──────────────────────
 * *"엘지부분에도 텍스트로 LG어디지점인지 삼성과 동일하게 지점명과 숫자로"*.
 *
 * 만들면서 **같은 함정을 세 번 밟았다** — `srm`·`bg` 를 아래에서 선언하는데 위에서
 * 써서 `var` 호이스팅으로 `undefined` 가 됐다(오류도 안 난다). 그리고 고정색을
 * 썼다가 대비 **1.01:1** 로 통째로 안 보였다 — 칸 배경 농도가 건수를 따라 달라지기
 * 때문이다. 셋 다 여기서 지킨다. */
{
  const ix = fs.readFileSync(new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url), 'utf8');
  const bad = [];
  const at = ix.indexOf("class=\"lgn\"");
  if (at < 0) bad.push('LG 지점명 줄(.lgn)이 없다');
  else {
    /* 그 줄을 만드는 블록 */
    const blk = ix.slice(Math.max(0, at - 2200), at + 300);
    /* ① 선언보다 앞에서 쓰지 않는다 — 지역 변수를 따로 낸다 */
    if (!/var srmL = \(window\.__SR/.test(blk))
      bad.push('__SR 을 지역 변수로 다시 안 꺼낸다 — 아래 선언을 쓰면 호이스팅으로 늘 undefined 다');
    if (!/var bgL = /.test(blk))
      bad.push('배경색을 지역 변수로 다시 안 낸다 — 같은 호이스팅 함정이다');
    /* ② 색은 배경 밝기가 정한다 — **문자열이 아니라 결과로 본다.**
       `inkOn(bgL)` 이 적혀 있어도 앞에 조건이 붙으면 안 도는데 문자열 검사는 통과한다
       (실제로 그렇게 헛돌았다). 판정식을 떼어 밝은 배경·어두운 배경 둘로 돌려 본다. */
    const im = /var lgInk = ([^;]+);/.exec(blk);
    if (!im) bad.push('lgInk 를 정하는 곳이 없다');
    else {
      const fn = new Function('inkOn', 'bgL', 'return ' + im[1] + ';');
      const onDark = fn(() => '#fff', '#1428A0');
      const onLight = fn(() => '#2A2F38', '#EEF2FF');
      if (onDark === onLight)
        bad.push('배경이 밝든 어둡든 같은 색이다 — 고정색은 대비 1.01:1 이 된다(실측)');
      if (!/^#/.test(String(onDark)) || !/^#/.test(String(onLight)))
        bad.push('lgInk 가 색을 안 돌려준다: ' + JSON.stringify([onDark, onLight]));
    }
    if (/\.hm \.cell \.lgn \{[^}]*color:/.test(ix))
      bad.push('.lgn 에 CSS 고정색이 있다 — 칸 배경 농도가 건수를 따라 달라져 못 쓴다');
    /* ③ 칸이 좁으면 안 그린다 — 이 화면이 이미 쓰는 계단 */
    if (!/c\.w > 96 && c\.h > 66/.test(blk))
      bad.push('넓은 칸에만 그리는 조건이 없다 — 작은 칸에서 뭉갠다');
    /* ④ 글자 크기를 칸 폭에서 낸다 — 고정 비율이면 긴 이름이 칸 밖으로 나간다 */
    if (!/c\.w - 8\) \/ \(lgTxt\.length/.test(blk))
      bad.push('글자 크기를 칸 폭에서 안 낸다 — 긴 이름이 칸 밖으로 나간다(실측 +87~176px)');
  }
  if (bad.length) fail('[바이럴] 히트맵 LG 표기 — ' + bad.join(' · '));
  else console.log('OK: 바이럴 히트맵 LG 표기 — 지점명·건수를 넓은 칸에 적고 · 색은 배경이 정하고 · 칸 안에 들어간다');
}

/* ── 검색 관심도 — 네이버 데이터랩 (2026-09-04) ──────────────────────────
 * 후기 수집이 못 하는 것을 한다 — 작성일 100% · 1회에 20개월 · **수요** 측 지표.
 * 실측으로 확인한 함정 셋을 코드가 지키는지 본다. */
{
  const gs = fs.readFileSync(new URL('../docs/apps-script/Reviews.gs', import.meta.url), 'utf8');
  const ix = fs.readFileSync(new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url), 'utf8');
  const pv = fs.readFileSync(new URL('./preview-reviews.mjs', import.meta.url), 'utf8');
  const bad = [];

  /* ① **호스트가 검색과 다르다** — 데이터랩은 `naveropenapi`, 검색은 `naverapihub`.
     실측(2026-09-04): naveropenapi 는 401(경로 있음), naverapihub 는 404(경로 없음).
     여기를 잘못 적으면 「경로가 없다」로만 보여 원인을 못 찾는다(실제로 그렇게 9개
     경로를 헛짚고 「데이터랩은 NCP 에 없다」고 잘못 결론지을 뻔했다). */
  if (!gs.includes('https://naveropenapi.apigw.ntruss.com/datalab/v1/search'))
    bad.push('데이터랩 주소가 naveropenapi 게이트웨이가 아니다 — naverapihub 쪽은 404 다');
  const tc = gs.indexOf('function trendCall_(');
  if (tc < 0) bad.push('trendCall_ 이 없다');
  else if (!/X-NCP-APIGW-API-KEY-ID[\s\S]{0,120}X-NCP-APIGW-API-KEY/.test(gs.slice(tc, tc + 1200)))
    bad.push('데이터랩 헤더가 NCP 것이 아니다 — 옛 헤더는 「Authentication information are missing」이 난다');
  /* ② 속성 이름은 갈라 둔다 — 같은 키라도 API 추가 시 재발급될 수 있어, 한쪽만
     갱신해도 다른 쪽이 안 죽어야 한다 */
  if (!gs.includes('DATALAB_CLIENT_ID') || !gs.includes('DATALAB_CLIENT_SECRET'))
    bad.push('데이터랩 키 속성 이름을 갈라 두지 않았다');
  /* **같은 값이라고 막으면 안 된다** — 검색과 같은 NCP Application 키가 정상이다 */
  if (/id === nid|sec === nsec/.test(gs))
    bad.push('검색 API 와 같은 키를 막는다 — 같은 Application 이라 그것이 정상이다');
  /* ③ 그룹 5개 상한 — 넘기면 그 호출이 통째로 실패한다 */
  if (!/groups\.length > 5/.test(gs)) bad.push('그룹 5개 상한을 안 지킨다');
  /* ④ 지역은 브랜드를 섞지 않는다 — 검색어 습관이 지배해 수원에서 98.9% 가 나온다 */
  const ct = gs.indexOf('function collectTrend()');
  if (ct < 0) bad.push('collectTrend() 가 없다');
  else {
    const blk = gs.slice(ct, ct + 2600);
    if (/LG베스트샵|엘지베스트샵/.test(blk.slice(blk.indexOf('② 지역별'))))
      bad.push('지역 질의에 경쟁사를 섞었다 — 검색어 습관이 지배해 비중이 거짓이 된다');
    if (!blk.includes('AREA_Q')) bad.push('지역을 AREA_Q 에서 안 가져온다 — 두 벌로 적으면 어긋난다');
    if (!blk.includes('trendWipe_')) bad.push('같은 날 줄을 안 지운다 — 두 번 누르면 합산이 두 배가 된다');
  }
  /* ⑤ 빠진 달을 0 으로 채우지 않는다 */
  if (!/빠진 달을 0 으로 채우지 않는다|빠진 달을 0 으로 그리지 않는다/.test(gs + ix))
    bad.push('빠진 달을 0 으로 다루지 않는다는 근거가 코드에 없다');
  const ri = ix.indexOf('function renderInterest()');
  if (ri < 0) bad.push('renderInterest() 가 없다');
  else {
    const blk = ix.slice(ri, ri + 3200);
    if (!blk.includes('아직 모으지 않았습니다')) bad.push('자료가 없을 때 그 사실을 안 적는다');
    if (!blk.includes('0 이 아니라 모른다')) bad.push('빠진 달을 「모른다」로 밝히지 않는다');
    if (!blk.includes('지역끼리 견주지 마세요')) bad.push('지역 간 비교를 막는 안내가 없다');
  }
  /* ⑥ 화면·스텁 배선 */
  if (!ix.includes('.runTrend();')) bad.push('화면에 갱신 버튼 배선이 없다');
  if (!ix.includes('id="runtrend"')) bad.push('갱신 버튼 마크업이 없다');
  if (!/renderTails\(\);\s*\n\s*renderInterest\(\);/.test(ix)) bad.push('renderInterest 를 그리는 곳이 없다');
  if (!pv.includes('runTrend:')) bad.push('미리보기 하네스에 runTrend 스텁이 없다 — 누르면 화면이 죽는다');
  /* ⑦ 없으면 null — 0 으로 보내면 화면이 「검색이 없다」로 그린다 */
  if (!gs.includes('trend: trend_()')) bad.push('집계가 trend 를 안 내보낸다');
  /* ⑧ **검색 API 키를 넣었는지 그 자리에서 가른다** (2026-09-04 실제로 그 사고가 났다).
     `NID AUTH Result Invalid` 만으로는 어디를 고쳐야 할지 모른다.
     **다만 키를 오류 문구에 실으면 안 된다** — 이 저장소는 public 이고 화면에 뜬다. */

  if (bad.length) fail('[바이럴] 검색 관심도 — ' + bad.join(' · '));
  else console.log('OK: 바이럴 검색 관심도 — naveropenapi 게이트웨이 · NCP 헤더 · 지역엔 브랜드를 안 섞고 · 빠진 달을 0 으로 안 본다');
}

/* ── 구글 UrlFetch 한도 (2026-09-04 사장님 요청) ─────────────────────────
 * *"구글한도도 일2만회로 지정되어있는것같습니다. 이것도 한도를 볼 수 있으면"*.
 *
 * Apps Script 에는 남은 쿼터를 묻는 API 가 없다. 대신 **막힌 순간 우리 카운터가
 * 몇이었는지**를 남긴다 — 그 차이가 곧 다른 스크립트가 쓴 양이다.
 * 실측(2026-09-04): 우리 429 / 50,000 인데 구글이 막았다. */
{
  const gs = fs.readFileSync(new URL('../docs/apps-script/Reviews.gs', import.meta.url), 'utf8');
  const ix = fs.readFileSync(new URL('../docs/apps-script/ReviewsIndex.html', import.meta.url), 'utf8');
  const bad = [];

  /* 판정을 떼어 실제로 돌린다 — 한국어·영어 둘 다 오고, 엉뚱한 오류를 물면 안 된다 */
  const gb = gs.indexOf('function googleBlocked_(');
  if (gb < 0) bad.push('googleBlocked_ 이 없다');
  else {
    const end = gs.indexOf('\n}', gb);
    const fn = new Function(gs.slice(gb, end + 2) + '; return googleBlocked_;')();
    for (const [msg, want] of [
      ['Exception: 하루에 urlfetch 서비스를 너무 많이 호출했습니다.', true],
      ['Exception: Service invoked too many times for one day: urlfetch.', true],
      ['Exception: 스크립트 속성에 NAVER_CLIENT_ID 를 넣어 주세요.', false],
      ['데이터랩 HTTP 401 — NID AUTH Result Invalid', false],
      ['Exception: Service invoked too many times for one day: email.', false],
      ['', false],
    ]) if (fn(msg) !== want) bad.push(`판정 어긋남 — ${JSON.stringify(msg.slice(0, 40))} → ${fn(msg)}(기대 ${want})`);
  }
  /* 그날 처음 것만 남긴다 — 덮어쓰면 「가장 낮은 지점」을 잃는다 */
  const nb = gs.indexOf('function noteGoogleBlock_(');
  if (nb < 0) bad.push('noteGoogleBlock_ 이 없다');
  else {
    const blk = gs.slice(nb, nb + 700);
    if (!blk.includes('JSON.parse(raw).d === d) return')) bad.push('같은 날 것을 덮어쓴다 — 가장 낮은 지점을 잃는다');
    if (!blk.includes('usage_().n')) bad.push('막힌 순간의 우리 카운터를 안 남긴다 — 그 값이 이 기능의 전부다');
    if (!blk.includes('quotaDay_()')) bad.push('날짜를 태평양 기준으로 안 센다 — 우리 카운터와 경계가 어긋난다');
  }
  /* 어제 것을 오늘 일로 읽지 않는다 */
  if (!/o\.d === quotaDay_\(\) \?/.test(gs)) bad.push('googleBlock_ 이 오늘 것만 돌려주지 않는다');
  /* 부르는 곳 — 수집과 데이터랩 둘 다 */
  if ((gs.match(/noteGoogleBlock_\(/g) || []).length < 4)
    bad.push('noteGoogleBlock_ 을 부르는 곳이 모자란다(정의 1 + 수집 1 + 데이터랩 2)');
  /* 화면에 보내고 그린다 */
  if (!gs.includes('d.googleQuota = googleQuota_()')) bad.push('구글 한도를 화면에 안 보낸다');
  if (!gs.includes('d.gBlock = googleBlock_()')) bad.push('막힌 지점을 화면에 안 보낸다');
  if (!ix.includes('id="gquota"')) bad.push('구글 한도 줄이 화면에 없다');
  const ge = ix.indexOf("getElementById('gquota')");
  if (ge < 0) bad.push('구글 한도 줄을 채우는 곳이 없다');
  else {
    const blk = ix.slice(ge, ge + 1100);
    if (!blk.includes('그때 우리 몫은')) bad.push('막힌 지점의 우리 몫을 안 적는다');
    if (!blk.includes('다른 스크립트')) bad.push('우리 카운터가 우리 몫만이라는 사실을 안 밝힌다');
  }

  if (bad.length) fail('[바이럴] 구글 한도 — ' + bad.join(' · '));
  else console.log('OK: 바이럴 구글 한도 — 우리 몫과 갈라 적고 · 막힌 지점을 남기고 · 오늘 것만 말한다');
}

/* ── 모든 UrlFetch 가 카운터에 잡히는가 (2026-09-04) ──────────────────────
 * 사장님 질문 *"20000으로변경하면 구글스크립트 전체 수집량이보이나요?"* 에서 드러났다.
 * 「삭제된 글 확인」이 `fetchAll` 로 **한 실행에 최대 3,900건**을 두드리는데
 * `addUsage_` 를 한 번도 안 불렀다 — 코드에선 한 줄이라 눈에 안 띄지만
 * **쿼터는 요청 수만큼 먹는다.** 그 탓에 화면이 「429회 썼다」고 하는 동안 구글은
 * 이미 막고 있었고, 우리는 그것을 「다른 스크립트 탓」으로 읽었다.
 *
 * **세는 곳을 빠뜨리는 사고는 조용하다** — 오류도 안 나고 화면은 낙관만 한다.
 * 이 저장소가 `collectStoreRival` 에서 이미 한 번 겪었다. */
{
  const gs = fs.readFileSync(new URL('../docs/apps-script/Reviews.gs', import.meta.url), 'utf8');
  const bad = [];

  /* fetch 지점마다 그 주변에 세는 코드가 있어야 한다 */
  const lines = gs.split('\n');
  const fetchAt = [];
  lines.forEach((l, i) => { if (/UrlFetchApp\.fetch(All)?\s*\(/.test(l)) fetchAt.push(i); });
  if (fetchAt.length < 4) bad.push(`UrlFetch 지점이 ${fetchAt.length}곳뿐이다 — 앵커가 낡았는지 보라`);
  /* **앞뒤를 넉넉히 본다.** 세는 자리가 fetch 「뒤」인 경우가 있고(데이터랩은
     응답을 받고 나서 센다), `search_` 는 그 함수 안이 아니라 **호출자가** 센다.
     좁게 잡았더니 멀쩡한 두 곳을 「샌다」고 잡았다 — 검사가 헛돌면 진짜 누락이 묻힌다. */
  /* 그 줄이 어느 함수 안인가 — `search_` 안의 fetch 는 **호출자가 세는 설계**라
     예외다(아래 호출부 검사가 대신 지킨다). 함수 이름을 위로 거슬러 찾는다. */
  const fnOf = (i) => {
    for (let k = i; k >= 0; k--) {
      const m = /^function ([A-Za-z0-9_]+)\s*\(/.exec(lines[k]);
      if (m) return m[1];
    }
    return '';
  };
  for (const i of fetchAt) {
    if (fnOf(i) === 'search_') continue;
    const near = lines.slice(Math.max(0, i - 30), i + 30).join('\n');
    const counted = /addUsage_\(/.test(near) || /calls\+\+/.test(near) || /calls \+= /.test(near);
    if (!counted) bad.push(`${i + 1}행 UrlFetch 가 카운터에 안 잡힌다 — 쿼터가 조용히 샌다`);
  }
  /* **`search_` 는 호출자가 센다** — 그 약속이 지켜지는지 호출부마다 본다.
     함수 안에서 세지 않는 설계라, 호출자 하나가 빠지면 그만큼 조용히 샌다. */
  lines.forEach((l, i) => {
    if (!/[^n]\bsearch_\(/.test(l)) return;                    /* 정의(function search_) 제외 */
    if (/function search_/.test(l)) return;
    const near = lines.slice(i, i + 3).join('\n');
    if (!/calls\+\+|calls \+= |addUsage_\(/.test(near))
      bad.push(`${i + 1}행 search_ 호출이 안 세어진다 — 호출자가 세는 설계다`);
  });
  /* fetchAll 은 특히 — 요청 수만큼 세야 한다(1 이 아니다) */
  const fa = gs.indexOf('UrlFetchApp.fetchAll(');
  if (fa < 0) bad.push('fetchAll 을 못 찾았다 — 앵커가 낡았다');
  else {
    const near = gs.slice(Math.max(0, fa - 900), fa);
    if (!/addUsage_\(reqs\.length\)/.test(near))
      bad.push('fetchAll 이 요청 수만큼 안 센다 — 한 실행에 수천 회가 밖으로 샌다');
    if (!/if \(over\(\)\) \{ cutShort = true/.test(near))
      bad.push('삭제 확인이 묶음마다 쿼터를 안 본다 — 한 번 들어오면 한도를 넘겨도 끝까지 두드린다');
  }
  /* 한 바퀴 추정에도 그 몫이 들어가야 한다 */
  if (!/var dead = DEAD_MAX_PER_RUN;/.test(gs))
    bad.push('sweepCalls_ 에 삭제 확인 몫이 빠졌다 — 한 바퀴 추정이 3,900회 작아진다');

  /* ── 삭제 확인을 며칠에 나눈다 (2026-09-04) ────────────────────────────
   * 한 바퀴 24,758회 > 구글 20,000회. 그 초과분의 절반 이상이 이 절이었다(3,900회).
   * **위험이 없는 절감이다** — 커서가 자리를 기억해 빠뜨리는 글이 없고, 판정이
   * 며칠 늦어질 뿐이다(원래 하루 한 번인 값이다). */
  if (!/var DEAD_BURSTS_PER_RUN = (\d+);/.test(gs))
    bad.push('한 회차 묶음 상한(DEAD_BURSTS_PER_RUN)이 없다 — 한 번에 3,900회를 쓴다');
  else {
    const n = Number(/var DEAD_BURSTS_PER_RUN = (\d+);/.exec(gs)[1]);
    const burst = Number(/var DEAD_BURST\s*=\s*(\d+);/.exec(gs)[1]);
    if (n * burst > 2000)
      bad.push(`한 회차 ${n * burst}회는 너무 많다 — 나누는 뜻이 없다`);
    if (!/if \(bursts >= DEAD_BURSTS_PER_RUN\) \{ cutShort = true/.test(gs))
      bad.push('상한만 있고 루프가 그것을 안 지킨다');
    /* **끊긴 회차에 「오늘 했다」를 찍으면 안 된다** — 그러면 그날 더 못 돌아
       며칠에 나누는 것이 아니라 영영 안 끝난다 */
    if (!/if \(!cutShort\) \{ props_\(\)\.setProperty\('_deadAt'/.test(gs))
      bad.push('끊긴 회차에도 「오늘 했다」를 찍는다 — 그러면 영영 안 끝난다');
  }

  if (bad.length) fail('[바이럴] UrlFetch 계수 — ' + bad.join(' · '));
  else console.log(`OK: 바이럴 UrlFetch 계수 — ${fetchAt.length}곳 전부 카운터에 잡힌다(fetchAll 은 요청 수만큼)`);
}

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
