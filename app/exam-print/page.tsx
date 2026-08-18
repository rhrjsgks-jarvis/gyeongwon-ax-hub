'use client'

import { useEffect } from 'react'
import { logEvent } from '@/lib/logEvent'
import IframeModule from '@/components/IframeModule'

export default function ExamPrintPage() {
  useEffect(() => { logEvent('examprint', 'page_view') }, [])

  return (
    <IframeModule
      src="/exam-print-app.html"
      title="시험지 인쇄"
      className="-m-4 lg:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    />
  )
}
