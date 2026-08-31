/**
 * 세일즈 코파일럿 — 사용 로그 유틸리티
 * localStorage 적재 + Google Apps Script 웹훅(옵션)
 */

// 'compareInstant'·'planner'는 운영이 끝난 모듈이다. 새로 기록되지는 않지만 과거 로그(구글 시트 포함)에
// 남아 있어 타입에서 빼면 집계 코드가 타입 에러를 낸다 — 유니온에는 유지하고 화면 라벨로 구분한다.
export type LogModule = 'finder' | 'as'
  | 'care' | 'test' | 'compare' | 'compareInstant' | 'quiz' | 'hub' | 'planner' | 'install' | 'installcost' | 'place' | 'concierge' | 'coupon' | 'catalog' | 'poster' | 'ownCompare' | 'board' | 'viral'
export type LogAction = 'page_view' | 'search' | 'result_open' | 'generate' | 'tab_switch' | 'feedback' | 'step'

export interface LogEvent {
  ts: number          // Unix ms
  date: string        // YYYY-MM-DD (KST)
  module: LogModule
  action: LogAction
  uid: string         // 세션 ID (익명)
  extra?: string      // 검색어·탭명 등 선택 추가 정보
  /*
   * **어느 매장에서 썼는가**(2026-08-20 사장님 요청 — 점별 사용 로그 취합).
   * 첫 접속에서 고른 지점이 이 기기에 남고(`lib/stores.ts`) 모든 이벤트에 함께 실린다.
   * 아직 안 골랐으면 비어 있다 — **0 과 '모름'을 구분한다**(상태줄에서 지키는 규칙과 같다).
   */
  store?: string      // 점코드 (예: ZN01)
  storeName?: string  // 지점명 — 시트를 사람이 볼 때 코드만으로는 못 읽는다
}

import { getStoreCode, storeName, isTestStore } from './stores.ts'

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
  const code = getStoreCode()
  return {
    ts, date: kstDate(ts), module, action, uid: getUid(), extra,
    ...(code ? { store: code, storeName: storeName(code) } : {}),
  }
}

/*
 * **같은 것을 세션 안에서 한 번만 기록한다.**
 *
 * 사장님 지적(2026-08-20): *"AI구독케어 항목 안에는 조회하는 종류가 많아 중복 로그가
 * 쌓일 수 있다."* 상담 한 건에서 제품·회차·탭을 오가면 같은 화면이 수십 번 잡힌다.
 * 그러면 "무엇을 많이 보는가"가 아니라 "누가 많이 눌렀는가"가 되어 집계가 뒤틀린다.
 *
 * 그래서 **무엇을 봤는지는 남기되 몇 번 눌렀는지는 세지 않는다** — 같은
 * `모듈|행동|대상` 은 그 세션에서 한 번만 쌓는다. 세션이 끝나면(앱을 닫으면) 초기화되므로
 * 다음 상담은 다시 잡힌다.
 */
export function logOnce(module: LogModule, action: LogAction, extra?: string): void {
  if (typeof sessionStorage === 'undefined') { logEvent(module, action, extra); return }
  const key = `axhub_once:${module}|${action}|${extra || ''}`
  try {
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
  } catch { /* 용량 초과 — 그냥 기록한다 */ }
  logEvent(module, action, extra)
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
  /*
   * **테스트점(Z000)에서는 아무것도 남기지 않는다**(2026-08-20 사장님 요청).
   * 관리자가 화면을 점검할 때 그 조작이 매장 통계에 섞이면 **실제 사용량과 구분할
   * 방법이 없어진다.** 기기에도, 시트에도 안 쌓는다 — 로컬만 막으면 대기함에 남아
   * 다음 전송 때 시트로 올라간다.
   */
  if (isTestStore(getStoreCode())) return
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

/**
 * **본사(경원영업팀 · Z000) 접속을 집계에서 뺀다**(2026-08-31 사장님 요청 —
 * *"테스트점은 삭제해주세요 … 로그는 여전히 취합하지않게해주세요"*).
 *
 * 그 지점은 `logEvent` 가 **애초에 아무것도 안 쌓게** 막고 있으므로, 시트에 남은
 * Z000 줄은 그 장치가 서기 전(2026-08-20)이나 스크립트로 직접 넣은 **점검 잔재**다.
 * 실제로 8/20 12:44 의 `uid=gs-check` 한 줄이 그렇게 남아 있었다.
 *
 * **시트 행을 지우는 대신 읽는 자리에서 거른다** — Apps Script 는 붙이기만 하고
 * 지우기가 없어 여기서 행을 없앨 수 없고, 한 줄을 손으로 지워도 **또 생기면 같은
 * 일을 반복**하게 된다. `excludeHubViews` 와 같은 자리에서 같은 원칙으로 거른다:
 * 저쪽이 *"허브 진입은 사용이 아니다"* 라면 이쪽은 *"본사 접속은 매장 사용이 아니다"*.
 *
 * **옛 줄은 `store` 가 비어 있다**(지점을 고르기 전) — 그건 '(미지정)' 으로 남는다.
 * 여기서 거르는 것은 **Z000 이라고 분명히 적힌 줄뿐**이다.
 */
export function excludeTestStore(logs: LogEvent[]): LogEvent[] {
  return logs.filter((e) => !(e.store && isTestStore(e.store)))
}

export function aggregateByModule(logs: LogEvent[]) {
  const map: Record<string, number> = {}
  for (const ev of logs) {
    map[ev.module] = (map[ev.module] || 0) + 1
  }
  return map
}

/**
 * **점별 사용 건수**(2026-08-20 사장님 요청). 지점을 고르기 전에 쌓인 옛 로그는
 * `store` 가 비어 있으므로 '(미지정)'으로 따로 센다 — 0 으로 적으면 "안 썼다"는
 * 거짓말이 되고, 빼 버리면 합계가 안 맞는다.
 */
/** 지점을 고르기 전에 쌓인 옛 로그를 세는 이름. **두 집계가 같은 값을 봐야 한다.** */
export const UNSET_STORE = '(미지정)'

/*
 * ── 상담이 **어디까지 갔는가** (2026-08-29) ──────────────────────────────
 *
 * 프로덕션 32일치를 열어 보니 배치 시뮬레이터가 남기는 로그가 `page_view` 하나뿐이라
 * **도면을 올렸는지, 축척까지 갔는지, 가전을 놓았는지 아무것도 몰랐다.** 500명이 쓰는데
 * 어디서 막히는지 알 길이 없어 개선이 전부 추측이 됐다.
 *
 * 이제 미니앱이 단계를 남긴다(`step`). **세션 수로 센다** — 건수로 세면 "무엇이
 * 되는가"가 아니라 "누가 많이 눌렀는가"가 된다(집계 전반의 규칙과 같다).
 */
export const PLACE_STEPS = ['도면', '축척', '배치', '3D', '저장'] as const

export function aggregateFunnel(logs: LogEvent[], module = 'place') {
  const seen: Record<string, Set<string>> = {}
  const opened = new Set<string>()
  for (const e of logs) {
    if (e.module !== module) continue
    opened.add(e.uid)
    if (e.action !== 'step') continue
    const name = String(e.extra || '')
    if (!name) continue
    ;(seen[name] = seen[name] || new Set()).add(e.uid)
  }
  const base = opened.size
  return {
    opened: base,
    steps: PLACE_STEPS.map((name) => {
      const n = seen[name] ? seen[name].size : 0
      return { name, n, pct: base ? Math.round((n / base) * 100) : 0 }
    }),
  }
}

/*
 * **인식이 나빴던 도면 목록** — 그대로 "고칠 도면 목록"이 된다.
 * `result_open` 의 extra 가 `단지 주택형 · 공간 N · 벽면 M` 이다.
 * 같은 도면이 여러 세션에서 잡히므로 **세션 수를 함께** 세어 자주 열리는 것을 앞세운다.
 */
export function aggregateWeakPlans(logs: LogEvent[], maxRooms = 3) {
  const by: Record<string, { rooms: number; faces: number; sess: Set<string> }> = {}
  for (const e of logs) {
    if (e.module !== 'place' || e.action !== 'result_open') continue
    const m = String(e.extra || '').match(/^(.*) · 공간 (\d+) · 벽면 (\d+)$/)
    if (!m) continue
    const who = m[1], rooms = +m[2], faces = +m[3]
    const r = (by[who] = by[who] || { rooms, faces, sess: new Set() })
    r.rooms = Math.min(r.rooms, rooms); r.faces = faces
    r.sess.add(e.uid)
  }
  return Object.entries(by)
    .map(([who, v]) => ({ who, rooms: v.rooms, faces: v.faces, sess: v.sess.size }))
    .filter((r) => r.rooms <= maxRooms)
    .sort((a, b) => b.sess - a.sess || a.rooms - b.rooms)
}

export function aggregateByStore(logs: LogEvent[]) {
  const map: Record<string, { name: string; count: number }> = {}
  for (const ev of logs) {
    const code = ev.store || ''
    const key = code || UNSET_STORE
    if (!map[key]) map[key] = { name: code ? (ev.storeName || storeName(code) || code) : '지점 미선택', count: 0 }
    map[key].count++
  }
  return Object.entries(map)
    .map(([code, v]) => ({ code, name: v.name, count: v.count }))
    .sort((a, b) => b.count - a.count)
}

/**
 * **한 지점이 무엇을 많이 썼는가**(2026-08-22 사장님 요청 — 지점을 눌러 펼쳐 본다).
 *
 * `code` 가 `null` 이면 **전점 통합**이다. 지점을 가리는 규칙은 `aggregateByStore` 와
 * 반드시 같아야 한다 — 거기서 '(미지정)'으로 센 것을 여기서 다르게 가리면 펼친 합과
 * 접힌 숫자가 어긋난다(이 저장소가 허브 카드 개수·앱 버전에서 반복해 데인 종류다).
 */
export function aggregateStoreModules(logs: LogEvent[], code: string | null) {
  const want = code === null ? null : code === UNSET_STORE ? '' : code
  const map: Record<string, number> = {}
  for (const ev of logs) {
    if (want !== null && (ev.store || '') !== want) continue
    map[ev.module] = (map[ev.module] || 0) + 1
  }
  return Object.entries(map)
    .map(([module, count]) => ({ module, count }))
    .sort((a, b) => b.count - a.count || a.module.localeCompare(b.module))
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
      /* 지점 열은 나중에 붙였다 — 옛 줄에는 없으므로 있을 때만 담는다 */
      ...(r.store ? { store: String(r.store) } : {}),
      ...(r.storeName ? { storeName: String(r.storeName) } : {}),
    })
  }
  return out
}

/**
 * **받은 자료가 방금 것인지 함께 나른다**(2026-08-31).
 *
 * 서버는 이미 `cached`(30초 캐시를 그대로 내줌) · `stale`(GAS 를 못 받아 마지막
 * 성공분을 내줌)을 갈라 밝히고 있었는데 **여기서 `logs` 만 꺼내고 그 표식을 버렸다.**
 * 그래서 화면이 *"09:12 기준"* 이라 적어도 실제 자료는 30초 전 것일 수 있었고,
 * 사장님이 버튼을 눌러도 숫자가 안 변하는 것으로 겪으셨다.
 *
 * 이 저장소가 이미 여러 번 세운 규칙과 같다 — **실패를 0 으로 그리지 않는다** ·
 * **조용히 넘기지 않는다**. 캐시된 자료를 방금 받은 것처럼 적는 것도 같은 거짓말이다.
 */
export interface TeamLogs {
  logs: LogEvent[]
  /** 서버의 30초 캐시를 그대로 받았다 — 이 순간 시트를 두드린 것이 아니다 */
  cached: boolean
  /** GAS 를 못 받아 마지막 성공분을 받았다 — 낡은 자료다 */
  stale: boolean
}

/**
 * 팀 전체 로그를 받아 온다. 못 받으면 `null` — **빈 배열과 갈라야 한다.**
 *
 * 예전에는 `Array.isArray(data.logs)` 만 봤는데, 서버가 타임아웃에 걸려 돌려주는
 * `logs: []` 도 **배열이라 성공으로 읽혔다.** 그래서 대시보드가 *팀 전체 모드로
 * 전 항목 0* 을 그렸고, 사장님이 **"새로고침을 수차례 해야 숫자가 나온다"** 고
 * 신고하셨다(2026-08-26). 실제로는 그때마다 실패하고 있었던 것이다.
 * 이제 서버가 `connected` 로 성패를 분명히 밝히고 여기서 그것을 본다.
 *
 * `fresh` 는 **사람이 「새로 고침」을 누른 경우**다 — 서버 캐시를 건너뛰고 시트를
 * 실제로 다시 두드린다(자동 로드는 캐시를 쓴다. 근거는 라우트 주석에 있다).
 */
export async function fetchTeamLogs(opts?: { fresh?: boolean }): Promise<TeamLogs | null> {
  if (!GAS_CONNECTED) return null
  try {
    const qs = opts?.fresh ? '?fresh=1' : ''
    const res = await fetch(`/api/logs${qs}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) })
    if (!res.ok) return null
    const data = await res.json()
    if (data.connected === false) return null          /* 실패를 0 으로 그리지 않는다 */
    if (!Array.isArray(data.logs)) return null
    return { logs: normalizeLogs(data.logs), cached: data.cached === true, stale: data.stale === true }
  } catch {
    return null
  }
}

export function exportCsv(logs: LogEvent[]): void {
  const header = 'ts,date,module,action,uid,extra,store,storeName'
  const rows = logs.map(
    (e) => [e.ts, e.date, e.module, e.action, e.uid, csvField(e.extra || ''),
            csvField(e.store || ''), csvField(e.storeName || '')].join(',')
  )
  const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `axhub_logs_${new Date().toISOString().slice(0,10)}.csv`
  a.click()
}
