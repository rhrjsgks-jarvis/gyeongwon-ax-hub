'use client'

import { useEffect } from 'react'
import { logEvent } from '@/lib/logEvent'
import Icon from '@/components/Icon'
import IframeModule from '@/components/IframeModule'

/*
 * 당사제품 비교 — 개발중인 서비스 (2026-08-30 사장님 요청)
 *   *"당사제품끼리 비교할수있는 방법이 있으면 좋겠습니다. 최대 4개까지 비교가되면
 *     좋을 것 같습니다. … 위치는 개발 중 안으로 넣어주세요"*
 *
 * **비밀번호를 걸지 않는다** — 배치 시뮬레이터와 같다. 잠가야 했던 이유는 "반쯤 만든
 * 화면을 고객에게 보여주는 것"이지 접근 자체가 아니므로, 자물쇠 대신 **경고 띠**를 둔다.
 * (그 판단의 근거는 `app/place/page.tsx` 주석에 적혀 있다.)
 *
 * **타사비교와 다른 도구다.** 그쪽은 우열을 등급(S~E)으로 말하지만 이쪽은 우리 제품끼리라
 * 등급을 매기지 않는다 — 상담사가 "어느 쪽이 이 고객에게 맞나"를 고르는 자리다.
 */
const BAR_PX = 26

export default function OwnComparePage() {
  useEffect(() => { logEvent('ownCompare', 'page_view') }, [])

  return (
    <div className="-m-4 lg:-m-6">
      <div
        className="flex items-center justify-center gap-1.5 text-[11px] font-semibold"
        style={{ height: BAR_PX, background: '#FEF3C7', color: '#92400E' }}
      >
        <Icon name="bulb" size={11} style={{ opacity: 0.8, flexShrink: 0 }} />
        <span>
          개발 중 — 써 보시고 <b>개선 아이디어를 보내 주세요</b>
          <span className="hidden sm:inline"> · 값이 바뀔 수 있으니 고객에게 그대로 읽지 마세요</span>
        </span>
      </div>
      <IframeModule
        src="/own-compare-app.html"
        title="당사제품 비교"
        style={{ height: `calc(100vh - ${60 + BAR_PX}px)`, marginBottom: '-6rem' }}
      />
    </div>
  )
}
