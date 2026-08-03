'use client'

import { useEffect } from 'react'

/**
 * 서비스워커 등록 (public/sw.js)
 *
 * 매장에서 전파가 약하거나 끊겨도 한 번 본 화면은 열리게 하는 것이 목적이다.
 * 렌더링에 관여하지 않으므로 아무것도 그리지 않는다.
 *
 * 로컬 개발 중에는 캐시가 수정 내용을 가려 디버깅을 어렵게 만들므로 프로덕션에서만 등록한다.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    // 첫 페인트를 방해하지 않도록 load 이후에 등록한다
    const register = () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) }
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])

  return null
}
