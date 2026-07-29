'use client'

import { useEffect } from 'react'
import { logEvent } from '@/lib/logEvent'
import IframeModule from '@/components/IframeModule'

export default function QuizPage() {
  useEffect(() => { logEvent('quiz', 'page_view') }, [])

  return (
    <IframeModule
      src="/quiz-app.html"
      title="URL 퀴즈 생성기"
      className="-m-4 md:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    />
  )
}
