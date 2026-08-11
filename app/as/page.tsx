'use client'

import { useEffect } from 'react'
import { logEvent } from '@/lib/logEvent'
import IframeModule from '@/components/IframeModule'

export default function AsPage() {
  useEffect(() => { logEvent('as', 'page_view') }, [])

  return (
    <IframeModule
      src="/as-app.html"
      title="AS 관련 정보"
      className="-m-4 lg:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    />
  )
}
