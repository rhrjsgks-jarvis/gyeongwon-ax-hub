'use client'

import { useEffect } from 'react'
import { logEvent } from '@/lib/logEvent'
import IframeModule from '@/components/IframeModule'

export default function AsPage() {
  useEffect(() => { logEvent('as', 'page_view') }, [])

  return (
    <IframeModule
      src="/as-app.html"
      title="AS기간 확인"
      className="-m-4 md:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    />
  )
}
