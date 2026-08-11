'use client'

import { useEffect } from 'react'
import { logEvent } from '@/lib/logEvent'
import IframeModule from '@/components/IframeModule'

export default function PosterPage() {
  useEffect(() => { logEvent('poster', 'page_view') }, [])

  return (
    <IframeModule
      src="/poster-app.html"
      title="컨시어지 접수 포스터"
      className="-m-4 lg:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    />
  )
}
