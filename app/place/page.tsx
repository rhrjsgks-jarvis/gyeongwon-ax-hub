'use client'

import { useEffect } from 'react'
import { logEvent } from '@/lib/logEvent'
import IframeModule from '@/components/IframeModule'
import DevGate from '@/components/DevGate'

/*
 * 가전 배치 시뮬레이터 — **개발중인 서비스로 내렸다**(2026-08-17 사용자 요청).
 *
 * 목록(`/dev`)만 잠그면 주소를 아는 사람은 그냥 들어온다. 원래 사이드바·하단탭에
 * 열려 있던 도구라 더 그렇다. 그래서 **도구 페이지도 같은 자물쇠로 감싼다** —
 * 한 번 풀면 `/dev` 와 함께 열리므로 비밀번호를 두 번 묻지 않는다.
 *
 * 페이지뷰는 **잠금을 통과한 뒤에만** 남긴다. 잠긴 화면을 본 것까지 세면
 * 대시보드가 "이 도구를 이만큼 쓴다"고 잘못 말한다.
 */
function PlaceInner() {
  useEffect(() => { logEvent('place', 'page_view') }, [])

  return (
    <IframeModule
      src="/place-app.html"
      title="가전 배치 시뮬레이터"
      className="-m-4 lg:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    />
  )
}

export default function PlacePage() {
  return (
    <DevGate title="가전 배치 시뮬레이터">
      <PlaceInner />
    </DevGate>
  )
}
