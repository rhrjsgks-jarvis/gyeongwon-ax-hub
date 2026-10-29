/*
 * 메뉴 자리 하나 · ☰ 로만 여닫기 — 2026-10-29 사장님 승인 시안(2차).
 *
 * 예전(2026-10-24)에는 ☰ 가 「접기 ↔ 서랍 열기」 두 가지 일을 했고, 서랍은 고르면·바깥을 누르면
 * 저절로 닫혔다. 그리고 앱 화면에서는 공통 사이드바와 앱 안 메뉴가 **나란히 둘** 섰다.
 * 사장님 지시로 둘을 바꿨다:
 *
 *   · **열고 닫기는 ☰ 를 눌렀을 때만** 바뀐다. 항목을 고르든 본문을 누르든 메뉴는 그대로다
 *   · **메뉴 자리는 하나다.** 앱 화면(NAVC_PATHS)에서는 앱 메뉴가, 그 밖에서는 전체 메뉴가 그 자리에 선다.
 *     앱 메뉴 맨 위 「‹ 전체 메뉴」 → 앱 메뉴가 들어가고 전체 메뉴가 들어온다.
 *     전체 메뉴에서 앱으로 가는 항목(›)을 고르면 반대로 바뀐다.
 *
 * 상태는 둘이고 서로 건드리지 않는다.
 *   · 열림/닫힘 — ☰ 만 바꾼다. 기기마다 기억한다(localStorage, 처음에는 열림)
 *   · 어느 메뉴(sheet)  — 'a' 앱 메뉴 / 'g' 전체 메뉴. 화면을 옮기거나 「‹ 전체 메뉴」·앱 항목을 고를 때만 바뀐다
 *
 * 앱 메뉴는 iframe 안이라 IframeModule 이 신호를 보낸다(share-kit.js 의 AxNav 가 받는다).
 * 공통 사이드바는 lg(1024px · 가로 900px) 부터만 있으므로, 그보다 좁은 태블릿(720~1023)에서는
 * 앱 메뉴만 여닫고 「‹ 전체 메뉴」 단추를 감춘다.
 */
const KEY = 'axhub_navc'
export const NAVC_EVENT = 'ax-navc'
/* 사이드바 방식(.ax-navbox)을 넣은 앱 — 이 화면들만 「앱 메뉴」가 있다 */
export const NAVC_PATHS = ['/install', '/as', '/finder', '/compare', '/care', '/install-cost']
/* 공통 사이드바가 서는 폭 — tailwind.config 의 lg 와 같은 식이어야 한다(갈리면 사이드바는 없는데 전체 메뉴 단추가 뜬다) */
export const LG_QUERY = '(min-width: 1024px), (min-width: 900px) and (orientation: landscape)'

export type Sheet = 'a' | 'g'

let mem = false
let sheet: Sheet = 'g'

/** 닫혀 있는가 (true = 닫힘). 키 이름은 옛 「접힘」 그대로 둔다 — 기기에 남은 값을 잃지 않게 */
export function getNavc(): boolean {
  try { const v = localStorage.getItem(KEY); if (v === '1' || v === '0') return v === '1' } catch { /* 막혀 있으면 메모리 값 */ }
  return mem
}

export function setNavc(closed: boolean): void {
  mem = closed
  try { localStorage.setItem(KEY, closed ? '1' : '0') } catch { /* 기억만 못 할 뿐 화면은 바뀐다 */ }
  window.dispatchEvent(new CustomEvent(NAVC_EVENT))
}

export function getSheet(): Sheet { return sheet }

export function setSheet(s: Sheet): void {
  if (sheet === s) return
  sheet = s
  window.dispatchEvent(new CustomEvent(NAVC_EVENT))
}

export function isAppPath(pathname: string): boolean {
  return NAVC_PATHS.includes(pathname)
}

/**
 * 지금 무엇이 보여야 하는가 — 판정은 여기 한 곳에만 둔다(머리·사이드바·iframe 이 같은 답을 봐야 한다).
 *   global  공통 사이드바가 보이는가
 *   appMenu iframe 안 앱 메뉴가 보이는가
 *   canGlobal 앱 메뉴에 「‹ 전체 메뉴」를 띄울 수 있는가(공통 사이드바가 있는 폭)
 */
export function navView(pathname: string, closed: boolean, s: Sheet, lgWide: boolean) {
  const app = isAppPath(pathname)
  /* 공통 사이드바가 없는 폭에서는 앱 화면이면 늘 앱 메뉴다 */
  const eff: Sheet = app && (s === 'a' || !lgWide) ? 'a' : 'g'
  return {
    global: lgWide && !closed && eff === 'g',
    appMenu: app && !closed && eff === 'a',
    canGlobal: lgWide,
  }
}
