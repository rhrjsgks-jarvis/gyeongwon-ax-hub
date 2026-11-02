'use client'

import { useEffect, useState } from 'react'
import { logOnce } from '@/lib/logEvent'
import { CALC_APPS, calcUrl } from '@/lib/calcApps'
import IframeModule from '@/components/IframeModule'

/*
 * Apps Script 계산기 웹앱을 안는 공용 틀 — 휴대폰계산기(/mobile-calc) · 구독계산기(/subs-calc)
 * (2026-11-02 사장님 지시: *"구동방식은 통신향계산기와 통일"*).
 *
 * 허브·사이드바에서 누르면 **새 창**으로 열린다(`lib/calcApps.ts` 의 `openCalcWindow`).
 * 이 iframe 화면은 통합검색 결과·옛 링크로 그 주소에 곧장 들어왔을 때 쓰인다.
 *
 * - **점코드를 `?code=` 로 넘긴다.** 교차 출처라 세션을 직접 못 넘긴다(`calcUrl`).
 * - **마운트 뒤에 src 를 만든다** — 점코드는 세션(클라이언트)에서 읽으므로, 맨 주소로 먼저 띄우고
 *   바꾸면 2초짜리 화면을 두 번 받는다.
 * - **iframe 을 탭바 위에서 끝낸다** — 다른 출처라 `--ax-tabbar` postMessage 가 안 닿는다.
 *   높이 = 화면 − 머리글(60) − 탭바(실측, PC 는 0). `100dvh` 는 폰 주소창을 뺀 실제 높이다.
 */
export default function AppsScriptCalc({ route }: { route: '/mobile-calc' | '/subs-calc' }) {
  const app = CALC_APPS[route]
  /* 세션당 1회 — 그 안에서 무엇을 계산했는지는 저쪽 시트의 로그가 든다 */
  useEffect(() => { logOnce(app.logKey, 'page_view') }, [app.logKey])

  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => { setSrc(calcUrl(app.url)) }, [app.url])

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
      title={app.title}
      className="-m-4 lg:-m-6"
      style={{ height: `calc(100dvh - ${60 + tabbar}px)`, marginBottom: '-6rem' }}
    />
  )
}
