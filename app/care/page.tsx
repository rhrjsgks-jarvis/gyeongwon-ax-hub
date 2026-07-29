'use client'

import { useEffect } from 'react'
import { logEvent } from '@/lib/logEvent'
import IframeModule from '@/components/IframeModule'

export default function CarePage() {
  useEffect(() => { logEvent('care', 'page_view') }, [])

  return (
    <IframeModule
      src="/care-app.html"
      title="AI Care 케어십 검색기"
      className="-m-4 md:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    />
  )
}
