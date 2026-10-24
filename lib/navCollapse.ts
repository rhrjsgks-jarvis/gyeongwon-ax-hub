/*
 * 메뉴 접기(☰) — 2026-10-24 사장님 승인 시안(사이드바 네비게이션 + ☰ 접기 + 맨 위 경로).
 *
 * 태블릿 가로에서는 공통 사이드바(224px)와 앱 메뉴(220px)가 나란히 두 개 서 있어 내용이 좁았다
 * (1280px 에서 내용 780px). ☰ 를 누르면 **둘을 함께 접어** 내용이 폭을 다 쓴다(1,140px).
 *
 *   · 펼침 상태에서 ☰ → 접는다
 *   · 접힘 상태에서 ☰ → 앱 메뉴를 내용 위로 덮어 연다(서랍). 고르면 저절로 닫힌다
 *   · 서랍 맨 위 「메뉴 펼쳐 두기」 → 펼침으로 되돌린다
 *   · 기기마다 기억한다(localStorage) — 처음에는 펼쳐 둔다(사장님 확인: 처음 쓰는 상담사가 메뉴를 못 찾지 않게)
 *
 * 앱 메뉴는 iframe 안이라 부모가 신호를 보낸다(IframeModule) — 보기 크기 「가」 단추와 같은 길이다.
 * 사이드바 방식을 넣은 앱만 NAVC_PATHS 에 적는다(안 넣은 앱에 ☰ 를 띄우면 눌러도 아무 일이 없다).
 */
const KEY = 'axhub_navc'
export const NAVC_EVENT = 'ax-navc'
export const NAVC_DRAWER_EVENT = 'ax-navc-drawer'
export const NAVC_PATHS = ['/install', '/as', '/finder', '/compare', '/care', '/install-cost']

let mem = false

export function getNavc(): boolean {
  try { const v = localStorage.getItem(KEY); if (v === '1' || v === '0') return v === '1' } catch { /* 막혀 있으면 메모리 값 */ }
  return mem
}

export function setNavc(on: boolean): void {
  mem = on
  try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* 기억만 못 할 뿐 화면은 바뀐다 */ }
  window.dispatchEvent(new CustomEvent(NAVC_EVENT, { detail: on }))
}

/** 이 화면에서 접기가 걸리는가 — 태블릿 폭(720px 이상) · 사이드바 방식을 넣은 앱만 */
export function navcActive(pathname: string): boolean {
  if (typeof window === 'undefined' || window.innerWidth < 720) return false
  return NAVC_PATHS.includes(pathname)
}
