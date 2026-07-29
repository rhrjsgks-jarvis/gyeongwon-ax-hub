'use client'

import { useEffect } from 'react'
import { logEvent } from '@/lib/logEvent'
import IframeModule from '@/components/IframeModule'

export default function InstallPage() {
  useEffect(() => { logEvent('install', 'page_view') }, [])

  return (
    <IframeModule
      src="/install-app.html"
      title="제품별 설치환경 가이드"
      className="-m-4 md:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    />
  )
}
