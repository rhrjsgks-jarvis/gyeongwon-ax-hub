/**
 * 경원 AX 허브 — 사용 로그 유틸리티
 * localStorage 적재 + Google Apps Script 웹훅(옵션)
 */

// 'compareInstant'·'planner'는 운영이 끝난 모듈이다. 새로 기록되지는 않지만 과거 로그(구글 시트 포함)에
// 남아 있어 타입에서 빼면 집계 코드가 타입 에러를 낸다 — 유니온에는 유지하고 화면 라벨로 구분한다.
export type LogModule = 'finder' | 'care' | 'test' | 'compare' | 'compareInstant' | 'quiz' | 'hub' | 'planner' | 'install' | 'concierge' | 'coupon' | 'catalog' | 'floorplan'
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

export function logEvent(
  module: LogModule,
  action: LogAction,
  extra?: string
): void {
  if (typeof localStorage === 'undefined') return
  const ev = buildEvent(module, action, extra)
  saveLocal(ev)

  if (GAS_URL) {
    fetch(GAS_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ev),
    }).catch(() => {})
  }
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
export async function fetchTeamLogs(): Promise<LogEvent[] | null> {
  if (!GAS_CONNECTED) return null
  try {
    const res = await fetch('/api/logs', { cache: 'no-store', signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const data = await res.json()
    return Array.isArray(data.logs) ? data.logs : null
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
