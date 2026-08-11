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
  readLogs, logEvent, aggregateByModule, aggregateByDay, exportCsv, excludeHubViews,
  fetchTeamLogs, GAS_CONNECTED,
} = await import('../lib/logEvent.ts');

import fs from 'fs';

let ok = true;
const fail = (msg) => { console.log('ERROR:', msg); ok = false; };
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
if (lines[0] !== 'ts,date,module,action,uid,extra') fail(`exportCsv: 헤더 불일치 — "${lines[0]}"`);
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
if (parsed.length !== 6) fail(`exportCsv 회귀: extra 필드의 콤마/따옴표 이스케이프가 깨져 컬럼 수 = ${parsed.length}, 기대값 6 — "${commaRow}"`);
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

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
