/**
 * 경원 AX 허브 — 사용 로그 유틸리티
 * localStorage 적재 + Google Apps Script 웹훅(옵션)
 */

export type LogModule = 'finder' | 'care' | 'test' | 'compare' | 'quiz' | 'hub' | 'planner' | 'install'
export type LogAction = 'page_view' | 'search' | 'result_open' | 'generate' | 'tab_switch'

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
const GAS_URL     = ''            // Google Apps Script 웹훅 URL (필요시)

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

export function logEvent(
  module: LogModule,
  action: LogAction,
  extra?: string
): void {
  if (typeof localStorage === 'undefined') return
  const ts  = Date.now()
  const ev: LogEvent = { ts, date: kstDate(ts), module, action, uid: getUid(), extra }

  const logs = readLogs()
  logs.push(ev)
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs))

  if (GAS_URL) {
    fetch(GAS_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ev),
    }).catch(() => {})
  }
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

export function exportCsv(logs: LogEvent[]): void {
  const header = 'ts,date,module,action,uid,extra'
  const rows = logs.map(
    (e) => `${e.ts},${e.date},${e.module},${e.action},${e.uid},"${e.extra || ''}"`
  )
  const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `axhub_logs_${new Date().toISOString().slice(0,10)}.csv`
  a.click()
}
