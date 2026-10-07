'use client'

import { useEffect, useState } from 'react'
import { logOnce } from '@/lib/logEvent'
import { getStoreCode } from '@/lib/stores'
import IframeModule from '@/components/IframeModule'

/*
 * 통신향 · 자급제 비교계산기 — 「통신향자급제상담도구」 섹션 (2026-09-16 사장님 지시)
 *   *"통신향상담기 전체를 폐기하고 … mobile phone 폴더에 있는 프로그램으로 이식해주세요"*
 *
 * **이 저장소가 아니라 Apps Script 웹앱이다** — 원본은 `~/mobile phone/계산기_웹앱_v3`
 * (Code.gs · calculator.html · dashboard.html). 화면을 iframe 으로 안고 요청만 넘긴다.
 * 옮겨 적지 않는 이유는 옛 통신향 상담기 때와 같다 — **계산 엔진이 두 벌이 되면 반드시
 * 어긋나고 어긋난 쪽 숫자가 손님에게 읽힌다.** 게다가 이 계산기는 단말기 출고가·지원금·
 * 제휴카드를 **구글 시트**에서 읽고 상담 로그도 그 시트에 쌓아 활용율 대시보드가 그것을
 * 본다 — 관리자가 시트만 고치면 반영되는 흐름을 여기로 옮기면 그 흐름이 끊긴다.
 *
 * 저쪽 `doGet` 이 `setXFrameOptionsMode(ALLOWALL)` 이라 iframe 이 된다. 화면 안에
 * 새 창을 여는 링크·reload 가 없어 Apps Script 샌드박스 함정(링크가 새 탭으로 열림 ·
 * reload 가 빈 화면)에 걸리지 않는 것을 소스에서 확인했다.
 *
 * **점코드를 주소로 넘긴다 — 저쪽이 또 묻지 않는다**(2026-09-16 사장님 지시: *"세일즈코파일럿
 * 에서는 이미 점코드를 넣고 접속하게 됩니다 … 추가로 넣지 않게"*). 교차 출처라 세션을 직접
 * 넘길 수는 없어 `?code=` 로 보내고, 저쪽 `doGet` 이 그것을 화면에 심어 `lookupStore` 로
 * **다시 대조**한 뒤 자동으로 들어간다(계산기 v3.8). 그쪽 점포 목록에 없는 코드면 저쪽 점
 * 확인 화면이 그대로 뜬다 — 여기서 짐작해 넘기지 않는다. 로그는 그 점코드로 저쪽 시트에 쌓인다.
 *
 * 점코드는 세션에서 읽으므로(클라이언트) **마운트 뒤에** src 를 만든다 — 먼저 맨 주소로 띄우고
 * 나중에 바꾸면 2초짜리 화면을 두 번 받는다.
 *
 * 주소는 **배포 id 가 박힌 exec 주소**라 저쪽이 「배포 관리 → 새 버전」으로 올리는 한
 * 그대로다. 「새 배포」를 만들면 바뀌므로(QR 도 함께 무효가 된다) 그쪽 안내문이 이미
 * 그것을 경고하고 있다. 바꿔야 하면 아래 상수 하나다.
 */
const MOBILE_CALC_URL =
  'https://script.google.com/macros/s/AKfycbyY09aCq_pSARMAYXkeRK9jEtnx23v_puU5gdCxUXIrhkT74oSLy6ONyNVmpaIJhAc/exec'

export default function MobileCalcPage() {
  /* 세션당 1회 — 그 안에서 무엇을 계산했는지는 저쪽 시트의 로그가 든다 */
  useEffect(() => { logOnce('mobileCalc', 'page_view') }, [])

  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    const code = getStoreCode()
    setSrc(code ? MOBILE_CALC_URL + '?code=' + encodeURIComponent(code) + '&from=sc' : MOBILE_CALC_URL)
  }, [])
  /*
   * **폰에서 하단 버튼이 탭바에 덮이던 것**(2026-10-07 사장님: *"하단에 버튼들이 짤려보입니다"*).
   * 다른 미니앱은 iframe 을 탭바 아래까지 채우고 탭바 높이를 `--ax-tabbar` 로 알려 받아 비키지만,
   * 이 계산기는 **다른 출처(Apps Script)** 라 그 postMessage 가 닿지 않는다(받는 코드도 없다).
   * 그래서 여기서는 iframe 을 **탭바 위에서 끝낸다** — 높이 = 화면 − 머리글(60) − 탭바(실측, PC 는 0).
   * `100vh` 는 폰 주소창이 보일 때 실제 보이는 화면보다 커서 맨 아래가 또 잘리므로 `100dvh` 로 잰다.
   */
  const [tabbar, setTabbar] = useState(0)
  useEffect(() => {
    const measure = () => {
      const nav = document.querySelector<HTMLElement>('nav[data-tabbar]')
      setTabbar(nav && getComputedStyle(nav).display !== 'none' ? nav.offsetHeight : 0)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  if (!src) return null

  return (
    <IframeModule
      src={src}
      title="통신향 · 자급제 비교계산기"
      className="-m-4 lg:-m-6"
      style={{ height: `calc(100dvh - ${60 + tabbar}px)`, marginBottom: '-6rem' }}
    />
  )
}
