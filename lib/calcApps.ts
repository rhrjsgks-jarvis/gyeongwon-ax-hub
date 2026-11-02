import { logOnce, type LogModule } from '@/lib/logEvent'
import { getStoreCode } from '@/lib/stores'

/*
 * Apps Script 계산기 두 개 — 휴대폰계산기 · 구독계산기.
 *
 * **허브·사이드바에서 누르면 새 창으로 연다**(2026-11-02 사장님 지시: *"구독계산기와 휴대폰계산기는
 * 눌르면 새창에서 실행되도록"*). 라우트(`/mobile-calc` · `/subs-calc`)의 iframe 화면은 그대로 둔다 —
 * 통합검색 결과·옛 링크가 그 주소로 오기 때문이다.
 *
 * 주소는 여기 한 곳에만 적는다. 라우트 페이지도 이 표를 읽는다 — 두 곳에 적으면 「새 배포」로
 * 주소가 바뀔 때 한쪽만 고쳐진다.
 */
export const CALC_APPS: Record<string, { url: string; title: string; logKey: LogModule }> = {
  '/mobile-calc': {
    url: 'https://script.google.com/macros/s/AKfycbyY09aCq_pSARMAYXkeRK9jEtnx23v_puU5gdCxUXIrhkT74oSLy6ONyNVmpaIJhAc/exec',
    title: '휴대폰계산기',
    logKey: 'mobileCalc',
  },
  '/subs-calc': {
    url: 'https://script.google.com/macros/s/AKfycbwBFvbLj0DwgWtmuETTkjLCMQ1tLx_kUIYVnBpgnMAGN2lLhyQI6Cn6NcJGsoUp1rQ/exec',
    title: '구독계산기',
    logKey: 'subsCalc',
  },
}

/* 점코드를 실은 주소 — 교차 출처라 세션을 못 넘겨 `?code=` 로 보낸다 */
export function calcUrl(url: string): string {
  const code = getStoreCode()
  return code ? url + '?code=' + encodeURIComponent(code) + '&from=sc' : url
}

/*
 * 계산기 주소면 새 창으로 열고 true. 아니면 false(호출한 쪽이 평소대로 이동한다).
 * **클릭 처리 안에서 바로 불러야 한다** — 비동기로 미루면 브라우저가 팝업으로 보고 막는다.
 * `noopener` 를 주면 열려도 null 이 오므로 성공 여부는 보지 않는다(새 창이 이 앱을 조작하지 못하게 하는 쪽이 중요하다).
 */
export function openCalcWindow(href: string): boolean {
  const app = CALC_APPS[href]
  if (!app || typeof window === 'undefined') return false
  window.open(calcUrl(app.url), '_blank', 'noopener')
  logOnce(app.logKey, 'page_view')
  return true
}
