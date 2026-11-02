'use client'

import { useEffect, useState } from 'react'
import { logOnce, type LogModule } from '@/lib/logEvent'
import { getStoreCode } from '@/lib/stores'
import IframeModule from '@/components/IframeModule'

/*
 * Apps Script 계산기 웹앱을 안는 공용 틀 — 휴대폰계산기(/mobile-calc) · 구독계산기(/subs-calc)
 * (2026-11-02 사장님 지시: *"구동방식은 통신향계산기와 통일"*).
 *
 * 두 계산기가 같은 길을 지나야 한쪽만 고치는 사고가 안 난다 — 점코드 넘기기 · 탭바 비키기 ·
 * 세션당 1회 로그가 전부 여기 한 곳이다.
 *
 * - **점코드를 `?code=` 로 넘긴다.** 교차 출처라 세션을 직접 못 넘긴다. 저쪽 `doGet` 이 그 값을
 *   받아 다시 대조하면 점 확인을 건너뛰고, 받지 않으면 저쪽 점 확인 화면이 그대로 뜬다(해가 없다).
 * - **마운트 뒤에 src 를 만든다** — 점코드는 세션(클라이언트)에서 읽으므로, 맨 주소로 먼저 띄우고
 *   바꾸면 2초짜리 화면을 두 번 받는다.
 * - **iframe 을 탭바 위에서 끝낸다** — 다른 출처라 `--ax-tabbar` postMessage 가 안 닿는다.
 *   높이 = 화면 − 머리글(60) − 탭바(실측, PC 는 0). `100dvh` 는 폰 주소창을 뺀 실제 높이다.
 */
export default function AppsScriptCalc({ url, title, logKey }: { url: string; title: string; logKey: LogModule }) {
  /* 세션당 1회 — 그 안에서 무엇을 계산했는지는 저쪽 시트의 로그가 든다 */
  useEffect(() => { logOnce(logKey, 'page_view') }, [logKey])

  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    const code = getStoreCode()
    setSrc(code ? url + '?code=' + encodeURIComponent(code) + '&from=sc' : url)
  }, [url])

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
      title={title}
      className="-m-4 lg:-m-6"
      style={{ height: `calc(100dvh - ${60 + tabbar}px)`, marginBottom: '-6rem' }}
    />
  )
}
