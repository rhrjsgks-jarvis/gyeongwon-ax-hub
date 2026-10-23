/*
 * 보기 크기(화면 확대) — 2026-10-23 사장님 승인 시안.
 *
 * 머리 오른쪽 「가」 단추가 100% → 115% → 130% → 100% 로 돈다. **앱 내용(iframe)만** 키운다 —
 * 남색 머리·왼쪽 메뉴는 그대로다. CSS `zoom` 이라 글자가 커진 만큼 화면이 다시 배치되어
 * 두 손가락 확대처럼 옆으로 밀어 볼 필요가 없다.
 *
 *   · 기기마다 기억한다(localStorage) — 막힌 환경이면 그 세션 동안만 산다
 *   · 태블릿 폭(720px 이상)에서만 쓴다 — 폰 머리에는 자리가 없고 두 손가락 확대가 된다
 *   · 배치 시뮬레이터(자체 확대)·포스터(인쇄 판형)·통신향 계산기(다른 출처)는 대상이 아니다
 */
export const ZOOM_STEPS = [1, 1.15, 1.3] as const
const KEY = 'axhub_zoom'
export const ZOOM_EVENT = 'ax-zoom'

/** 확대를 적용하는 화면 — 같은 출처 미니앱만(다른 출처 iframe 안은 건드릴 수 없다) */
export const ZOOM_PATHS = ['/install', '/install-cost', '/as', '/finder', '/compare', '/care', '/test', '/quiz', '/own-compare']

let mem = 1

export function getZoom(): number {
  try {
    const v = Number(localStorage.getItem(KEY))
    if ((ZOOM_STEPS as readonly number[]).includes(v)) return v
  } catch { /* 저장소가 막혀 있으면 메모리 값 */ }
  return mem
}

export function nextZoom(z: number): number {
  const i = (ZOOM_STEPS as readonly number[]).indexOf(z)
  return ZOOM_STEPS[(i + 1) % ZOOM_STEPS.length]
}

export function setZoom(z: number): void {
  mem = z
  try { localStorage.setItem(KEY, String(z)) } catch { /* 기억만 못 할 뿐 화면은 바뀐다 */ }
  window.dispatchEvent(new CustomEvent(ZOOM_EVENT, { detail: z }))
}

/** 이 미니앱 iframe 에 확대를 걸어도 되는가 — 폰 폭·제외 앱은 늘 100% */
export function zoomFor(src: string): number {
  if (typeof window === 'undefined' || window.innerWidth < 720) return 1
  if (/place-app|poster-app|^https?:/.test(src)) return 1
  return getZoom()
}
