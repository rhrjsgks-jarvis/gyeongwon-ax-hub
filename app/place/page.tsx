'use client'

import { useEffect } from 'react'
import { logEvent } from '@/lib/logEvent'
import Icon from '@/components/Icon'
import IframeModule from '@/components/IframeModule'

/*
 * 가전 배치 시뮬레이터 — 개발중인 서비스이지만 **비밀번호 없이 연다**
 * (2026-08-17 사용자 요청: *"비밀번호 없이 확인해볼 수 있게 해주세요"*).
 *
 * 잠시 전까지 `DevGate` 로 감싸 비밀번호를 물었다. 풀면서 **같이 사라지는 것**이 있어
 * 그것만 남긴다 — 비밀번호 화면이 *"아직 다듬는 중입니다. 값이 바뀌거나 화면이 달라질
 * 수 있으니 고객에게 그대로 읽지 마세요"* 라는 경고를 함께 지고 있었다. 자물쇠를
 * 없애고 경고까지 없애면 상담사가 **완성된 도구로 오해**한다. 잠가야 했던 이유가
 * "반쯤 만든 화면을 고객에게 보여주는 것"이었으므로, 자물쇠보다 이 경고가 더 중요한
 * 절반이다.
 *
 * 띠는 **한 줄로 얇게** 둔다. 이 도구는 화면을 꽉 쓰고 좁은 화면에서는 안내문까지
 * 숨겨 가며 자리를 아끼는 곳이라(`place-app.html` 의 `#status`), 경고가 도면을
 * 밀어내면 안 된다. 실측 26px.
 *
 * `components/DevGate.tsx` 는 **지우지 않는다** — 다음 개발중 도구에 그대로 쓸 수 있고,
 * 서버 검증(`/api/admin-auth` `scope:'dev'`)은 `test-admin` 이 계속 지킨다.
 */
const BAR_PX = 26

export default function PlacePage() {
  useEffect(() => { logEvent('place', 'page_view') }, [])

  return (
    <div className="-m-4 lg:-m-6">
      <div
        className="flex items-center justify-center gap-1.5 text-[11px] font-semibold"
        style={{ height: BAR_PX, background: '#FEF3C7', color: '#92400E' }}
      >
        <Icon name="lock" size={11} style={{ opacity: 0.7 }} />
        개발중 — 값이 바뀌거나 화면이 달라질 수 있습니다. 고객에게 그대로 읽지 마세요.
      </div>
      <IframeModule
        src="/place-app.html"
        title="가전 배치 시뮬레이터"
        style={{ height: `calc(100vh - ${60 + BAR_PX}px)`, marginBottom: '-6rem' }}
      />
    </div>
  )
}
