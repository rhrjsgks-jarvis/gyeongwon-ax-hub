'use client'

import { useEffect } from 'react'
import { logEvent } from '@/lib/logEvent'

export default function InstallPage() {
  useEffect(() => { logEvent('install', 'page_view') }, [])

  return (
    <div
      className="-m-4 md:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    >
      <iframe
        src="/install-app.html"
        className="w-full h-full border-0"
        title="제품별 설치환경 가이드"
      />
    </div>
  )
}
