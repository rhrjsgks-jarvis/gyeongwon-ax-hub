/*
 * 브라우저에서 전체화면으로 (2026-10-23 사장님 — *"대부분 QR 로 접속하거나 브라우저
 * 즐겨찾기를 이용합니다. 전체화면으로 나오게 할 수 있는 방법이 없을까요"*).
 *
 * 설치형 앱은 manifest 의 display_override 로 전체화면이 되지만, QR·즐겨찾기로 여는
 * 브라우저 탭은 **사람이 누른 순간에만** 전체화면을 허락받는다(Fullscreen API 규칙).
 * 그래서 매장 코드를 넣고 「확인」을 누르는 그 순간에 함께 요청한다 — 접속할 때마다
 * 한 번은 반드시 누르는 자리라 따로 단추를 누를 필요가 없다.
 *
 *   · **손가락 기기만**(태블릿·폰). PC 에서 브라우저 전체가 사라지면 오히려 불편하다
 *   · 이미 설치형(standalone·fullscreen)이면 하지 않는다
 *   · 실패해도 조용히 넘어간다 — 아이폰 사파리는 페이지 전체화면을 지원하지 않는다
 *   · 앱 안의 화면 이동(Next 클라이언트 전환)은 같은 문서라 전체화면이 유지된다.
 *     새로고침·뒤로 나가기·가장자리 쓸기로 풀리면 헤더 단추로 다시 켠다
 */
type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> }
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }

export function isFullscreen(): boolean {
  if (typeof document === 'undefined') return false
  const d = document as FsDoc
  return !!(d.fullscreenElement || d.webkitFullscreenElement)
}

export function fullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false
  const el = document.documentElement as FsEl
  return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function'
}

function installed(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
}

export function enterFullscreen(): void {
  if (isFullscreen() || !fullscreenSupported()) return
  const el = document.documentElement as FsEl
  try {
    const r = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.()
    if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {})
  } catch { /* 허락받지 못해도 앱은 그대로 쓴다 */ }
}

export function exitFullscreen(): void {
  const d = document as FsDoc
  try {
    const r = d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.()
    if (r && typeof r.catch === 'function') r.catch(() => {})
  } catch { /* 이미 풀린 상태 */ }
}

/** 매장 확인 순간에 부른다 — 손가락 기기 + 브라우저 탭일 때만 */
export function autoFullscreenOnEntry(): void {
  if (typeof window === 'undefined' || !window.matchMedia) return
  if (installed()) return
  if (!window.matchMedia('(pointer: coarse)').matches) return
  enterFullscreen()
}
