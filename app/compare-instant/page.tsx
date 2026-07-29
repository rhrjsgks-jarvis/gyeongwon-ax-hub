'use client'

import { useEffect } from 'react'
import { logEvent } from '@/lib/logEvent'
import IframeModule from '@/components/IframeModule'

export default function CompareInstantPage() {
  useEffect(() => { logEvent('compareInstant', 'page_view') }, [])

  return (
    <IframeModule
      src="/compare-app.html?mode=db"
      title="즉시비교 (개선중)"
      className="-m-4 md:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    />
  )
}
