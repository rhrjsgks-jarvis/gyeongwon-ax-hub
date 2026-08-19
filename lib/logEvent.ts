/**
 * 세일즈 코파일럿 — 사용 로그 유틸리티
 * localStorage 적재 + Google Apps Script 웹훅(옵션)
 */

// 'compareInstant'·'planner'는 운영이 끝난 모듈이다. 새로 기록되지는 않지만 과거 로그(구글 시트 포함)에
// 남아 있어 타입에서 빼면 집계 코드가 타입 에러를 낸다 — 유니온에는 유지하고 화면 라벨로 구분한다.
export type LogModule = 'finder' | 'as'
  | 'care' | 'test' | 'compare' | 'compareInstant' | 'quiz' | 'hub' | 'planner' | 'install' | 'place' | 'concierge' | 'coupon' | 'catalog' | 'poster'
export type LogAction = 'page_view' | 'search' | 'result_open' | 'generate' | 'tab_switch' | 'feedback'

export interface LogEvent {
  ts: number          // Unix ms
  date: string        // YYYY-MM-DD (KST)
  module: LogModule
  action: LogAction
  uid: string         // 세션 ID (익명)
  extra?: string      // 검색어·탭명 등 선택 추가 정보
}

const STORAGE_KEY = 'axhub_logs'
const MAX_LOGS    = 2000
// Google Apps Script 웹훅 URL. Vercel/로컬 .env에 NEXT_PUBLIC_GAS_URL로 설정하면 활성화된다.
// (미설정 시 로그는 이 기기 localStorage에만 쌓이고 팀 전체 집계는 비활성 — 기존 동작과 동일)
const GAS_URL = process.env.NEXT_PUBLIC_GAS_URL || ''

function getUid(): string {
  if (typeof sessionStorage === 'undefined') return 'server'
  let uid = sessionStorage.getItem('axhub_uid')
  if (!uid) {
    uid = Math.random().toString(36).slice(2, 10)
    sessionStorage.setItem('axhub_uid', uid)
  }
  return uid
}

function kstDate(ts: number): string {
  return new Date(ts + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function readLogs(): LogEvent[] {
  if (typeof localStorage === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function buildEvent(module: LogModule, action: LogAction, extra?: string): LogEvent {
  const ts = Date.now()
  return { ts, date: kstDate(ts), module, action, uid: getUid(), extra }
}

function saveLocal(ev: LogEvent): void {
  const logs = readLogs()
  logs.push(ev)
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs))
}

/* ── 전송 대기함(outbox) ──────────────────────────────────────────
 * 예전에는 이벤트 1건마다 Apps Script 로 곧장 POST 했다. 그 방식의 문제가 셋이었다:
 *
 *  ① **한 건이 GAS 실행 한 번**이다. Apps Script 무료 계정 한도는 하루 실행시간 90분 ·
 *     동시 실행 30개다. 실측 비율로 500개 매장을 환산하면 하루 5~6천 건이고
 *     `appendRow` 가 건당 1.5초면 145분 — 한도를 1.6배 넘긴다.
 *  ② **`mode:'no-cors'` 라 응답을 읽을 수 없다.** 한도를 넘겨 실패해도 알 방법이 없었고
 *     `.catch(() => {})` 가 네트워크 오류까지 삼켰다. 조용히 사라지는 것이 가장 나쁘다.
 *  ③ 실패를 모르니 **재시도도 없었다.** 매장 전파가 끊긴 동안의 사용은 통째로 빠진다.
 *
 * 그래서 모았다가 한 번에 보내고, 서버 라우트를 거쳐 **성공 여부를 확인**하고,
 * 실패한 것은 대기함에 남겨 다음에 다시 보낸다.
 * (건의사항 `sendFeedback` 은 사용자에게 결과를 바로 보여줘야 하므로 이 경로를 타지 않는다.)
 ──────────────────────────────────────────────────────────────── */
const OUTBOX_KEY = 'axhub_outbox'
const BATCH_MAX  = 20      // 한 번에 보낼 최대 건수 — GAS 실행 횟수를 1/20 로 줄인다
const FLUSH_MS   = 8000    // 모았다 보내는 간격
const OUTBOX_MAX = 500     // 못 보낸 것이 무한정 쌓이지 않게

function readOutbox(): LogEvent[] {
  if (typeof localStorage === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]') } catch { return [] }
}
function writeOutbox(evs: LogEvent[]): void {
  if (typeof localStorage === 'undefined') return
  // 오래된 것부터 버린다 — 최근 사용이 더 쓸모 있다
  const keep = evs.length > OUTBOX_MAX ? evs.slice(evs.length - OUTBOX_MAX) : evs
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(keep)) } catch { /* 용량 초과 */ }
}

/**
 * 배치를 가리키는 이름 — **내용에서 결정적으로 만든다.**
 * 서버는 저장했는데 응답이 유실되면 다음에 같은 배치를 다시 보내게 되는데, 이름이 같으면
 * Apps Script 가 알아보고 버릴 수 있다. 새 이벤트는 뒤에 붙고 보낼 때는 앞에서 잘라 가므로
 * 성공할 때까지 앞 20건은 그대로다 — 그래서 재시도해도 같은 이름이 나온다.
 */
function batchId(batch: LogEvent[]): string {
  return `${batch[0].ts}-${batch[batch.length - 1].ts}-${batch.length}`
}

let flushing = false
let timer: ReturnType<typeof setTimeout> | null = null
let bound = false

/** 대기함을 한 배치 보낸다. 보낼 것이 남으면 true 를 돌려준다(연달아 부를 수 있게). */
export async function flushLogs(keepalive = false): Promise<boolean> {
  if (!GAS_CONNECTED || flushing) return false
  const box = readOutbox()
  if (!box.length) return false
  flushing = true
  try {
    const batch = box.slice(0, BATCH_MAX)
    const res = await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId: batchId(batch), events: batch }),
      keepalive,                       // 화면을 닫는 중에도 끝까지 보낸다
    })
    if (!res.ok) return false
    const data = await res.json().catch(() => null)
    if (!data || !data.ok) return false
    /* 성공한 것만 지운다. 보내는 사이에 새로 쌓인 것은 건드리지 않는다 —
       길이로 자르면 그 사이 들어온 이벤트를 지우게 된다. */
    const sent = new Set(batch.map((e) => `${e.ts}|${e.uid}|${e.module}|${e.action}`))
    writeOutbox(readOutbox().filter((e) => !sent.has(`${e.ts}|${e.uid}|${e.module}|${e.action}`)))
    return readOutbox().length > 0
  } catch {
    return false                       // 남겨 두고 다음에 다시 보낸다
  } finally {
    flushing = false
  }
}

function schedule(): void {
  if (timer || typeof window === 'undefined') return
  timer = setTimeout(() => { timer = null; void flushLogs() }, FLUSH_MS)
}

/** 화면을 떠날 때 남은 것을 보낸다 — 상담이 끝나고 앱을 닫으면 그때까지가 통째로 빠진다 */
function bindUnload(): void {
  if (bound || typeof window === 'undefined') return
  bound = true
  const go = () => { void flushLogs(true) }
  window.addEventListener('pagehide', go)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') go() })
}

export function logEvent(
  module: LogModule,
  action: LogAction,
  extra?: string
): void {
  if (typeof localStorage === 'undefined') return
  const ev = buildEvent(module, action, extra)
  saveLocal(ev)
  if (!GAS_CONNECTED) return

  writeOutbox([...readOutbox(), ev])
  bindUnload()
  /* 쌓인 것이 한 배치를 채우면 기다리지 않고 바로 보낸다 */
  if (readOutbox().length >= BATCH_MAX) void flushLogs()
  else schedule()
}

// 사용자 건의사항을 기록·전송한다. 일반 로그(logEvent)와 달리 사용자에게 성공/실패를
// 보여줘야 하므로, 응답을 읽을 수 없는 no-cors 직접 호출 대신 서버 라우트(/api/feedback)를
// 경유해 Google Apps Script(Code.gs)의 실제 응답 결과를 그대로 돌려받는다. action:'feedback'
// 이벤트를 받으면 Apps Script가 이메일 알림도 함께 발송한다.
export async function sendFeedback(message: string, contact?: string): Promise<boolean> {
  const extra = contact ? `${message} [연락처: ${contact}]` : message
  const ev = buildEvent('hub', 'feedback', extra)
  if (typeof localStorage !== 'undefined') saveLocal(ev)

  if (!GAS_CONNECTED) return false
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ev),
    })
    if (!res.ok) return false
    const data = await res.json()
    return !!data.ok
  } catch {
    return false
  }
}

/**
 * 허브 메인화면 페이지뷰를 집계에서 제외한다.
 * 허브는 모든 모듈의 진입점이라 링크를 타고 들어오거나 카드를 누르기만 해도 조회수가 쌓여
 * "실제로 도구를 썼다"는 신호가 아니다. 반면 hub/search(통합검색)·hub/feedback(건의)은
 * 사용자가 의도적으로 한 행동이라 그대로 남긴다.
 */
export function excludeHubViews(logs: LogEvent[]): LogEvent[] {
  return logs.filter((e) => !(e.module === 'hub' && e.action === 'page_view'))
}

export function aggregateByModule(logs: LogEvent[]) {
  const map: Record<string, number> = {}
  for (const ev of logs) {
    map[ev.module] = (map[ev.module] || 0) + 1
  }
  return map
}

export function aggregateByDay(logs: LogEvent[], days = 14) {
  const cutoff = Date.now() - days * 86_400_000
  const map: Record<string, number> = {}
  for (const ev of logs) {
    if (ev.ts < cutoff) continue
    map[ev.date] = (map[ev.date] || 0) + 1
  }
  const result: { date: string; count: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = kstDate(Date.now() - i * 86_400_000)
    result.push({ date: d, count: map[d] || 0 })
  }
  return result
}

function csvField(v: string): string {
  return /["\n,]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v
}

export const GAS_CONNECTED = !!GAS_URL

// 팀 전체 로그를 가져온다. /api/logs(서버 라우트)가 Apps Script doGet을 서버 사이드에서
// 대신 호출해주므로 브라우저 CORS 문제 없이 읽을 수 있다. 연동 전이거나 실패 시 null 반환
// — 호출부(admin 대시보드)는 null이면 이 기기 로그(readLogs())로 폴백해야 한다.
/**
 * 시트에서 온 로그를 앱이 쓰는 모양으로 맞춘다.
 *
 * 2026-08-11 프로덕션 실데이터를 들여다보니 두 가지가 어긋나 있었다:
 *
 *  ① **헤더 행이 데이터로 섞여 온다.** Apps Script `doGet` 이 시트 1행(제목 줄)을 그대로
 *     실어 보내 `{ts:null, module:'module', action:'action'}` 인 가짜 이벤트가 집계에 잡혔다.
 *     모듈별 사용 현황에 `module` 이라는 항목이 1건 떠 있던 것이 이것이다.
 *
 *  ② **`date` 가 'YYYY-MM-DD' 가 아니다.** 시트의 날짜 칸이 Date 로 저장돼 있어
 *     `'Wed Jul 29 2026 00:00:00 GMT+0900 (Korean Standard Time)'` 로 온다.
 *     `aggregateByDay` 는 'YYYY-MM-DD' 로 찾으므로 **일별 추이 막대가 전부 0** 이었다.
 *     `ts`(숫자)만이 믿을 수 있는 값이라 날짜를 거기서 다시 만든다.
 *
 * 시트 쪽을 고치는 방법도 있지만 Apps Script 는 이 저장소 밖이라 배포가 따로 돈다.
 * **밖에서 들어오는 값은 들어오는 자리에서 맞추는 것**이 안전하다 — 시트 서식이 또 바뀌어도
 * 여기서 흡수된다.
 */
export function normalizeLogs(rows: unknown[]): LogEvent[] {
  const out: LogEvent[] = []
  for (const row of rows) {
    const r = row as Partial<LogEvent> & Record<string, unknown>
    const ts = Number(r?.ts)
    // 헤더 행·빈 행은 ts 가 숫자가 아니다. 이 한 줄이 ①을 막는다.
    if (!Number.isFinite(ts) || ts <= 0) continue
    if (!r.module || !r.action) continue
    const extra = r.extra == null ? '' : String(r.extra)
    out.push({
      ts,
      date: kstDate(ts),          // 시트의 date 칸은 쓰지 않는다
      module: r.module as LogModule,
      action: r.action as LogAction,
      uid: r.uid == null ? '' : String(r.uid),
      ...(extra ? { extra } : {}),
    })
  }
  return out
}

export async function fetchTeamLogs(): Promise<LogEvent[] | null> {
  if (!GAS_CONNECTED) return null
  try {
    const res = await fetch('/api/logs', { cache: 'no-store', signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const data = await res.json()
    return Array.isArray(data.logs) ? normalizeLogs(data.logs) : null
  } catch {
    return null
  }
}

export function exportCsv(logs: LogEvent[]): void {
  const header = 'ts,date,module,action,uid,extra'
  const rows = logs.map(
    (e) => [e.ts, e.date, e.module, e.action, e.uid, csvField(e.extra || '')].join(',')
  )
  const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `axhub_logs_${new Date().toISOString().slice(0,10)}.csv`
  a.click()
}
