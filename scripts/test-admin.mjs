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

  if (!keys.length || !metaKeys.length) fail('[대시보드] LogModule / MODULE_META 를 읽지 못했다');
  else {
    const missing = keys.filter((k) => !metaKeys.includes(k));
    if (missing.length) fail(`[대시보드] MODULE_META 에 없는 모듈: ${missing.join(', ')} — 사용 현황에 안 잡힌다`);
    else console.log(`OK: 대시보드가 LogModule ${keys.length}개를 모두 표시 (누락 0)`);
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

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
