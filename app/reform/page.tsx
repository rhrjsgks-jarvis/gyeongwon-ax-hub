'use client'

import { useEffect } from 'react'
import { logOnce } from '@/lib/logEvent'
import IframeModule from '@/components/IframeModule'

export default function ReformPage() {
  /* **세션당 1회** — 설치비용·사전준비와 같은 성격이라 통으로 한 번만 센다.
     매번 쌓으면 "누가 많이 눌렀는가"가 되어 같은 상담이 두 번 세어진다. */
  useEffect(() => { logOnce('reform', 'page_view') }, [])

  return (
    <IframeModule
      src="/reform-app.html"
      title="가구장 리폼 · 타공 규격"
      className="-m-4 lg:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    />
  )
}
