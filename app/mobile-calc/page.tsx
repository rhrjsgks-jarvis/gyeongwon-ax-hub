'use client'

import { useEffect } from 'react'
import { logOnce } from '@/lib/logEvent'
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
 * **점코드는 저쪽이 따로 묻는다.** 교차 출처라 이 허브의 세션(지점)을 넘겨줄 수 없다 —
 * 저쪽 화면이 `?code=` 를 받게 고치면 그때 여기서 붙여 준다.
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

  return (
    <IframeModule
      src={MOBILE_CALC_URL}
      title="통신향 · 자급제 비교계산기"
      className="-m-4 lg:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    />
  )
}
