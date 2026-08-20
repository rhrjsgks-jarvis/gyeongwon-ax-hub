'use client'

import { useEffect } from 'react'
import { logEvent } from '@/lib/logEvent'
import IframeModule from '@/components/IframeModule'

export default function InstallCostPage() {
  useEffect(() => { logEvent('installcost', 'page_view') }, [])

  return (
    <IframeModule
      src="/install-cost-app.html"
      title="설치비용 · 사전준비"
      className="-m-4 lg:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    />
  )
}
