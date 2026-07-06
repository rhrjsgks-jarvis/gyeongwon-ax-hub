'use client'

import { useState, useEffect } from 'react'
import { logEvent } from '@/lib/logEvent'

type Tab = 'compare' | 'quiz'

const TABS = [
  { id: 'compare' as Tab, label: '⚖️ 타사비교 가이드', src: '/compare-app.html' },
  { id: 'quiz'   as Tab, label: '🎯 URL 퀴즈 생성',  src: '/quiz-app.html'   },
]

export default function ComparePage() {
  const [tab, setTab] = useState<Tab>('compare')

  useEffect(() => { logEvent('compare', 'page_view') }, [])

  function handleTabClick(t: Tab) {
    setTab(t)
    logEvent(t === 'compare' ? 'compare' : 'quiz', 'tab_switch', t)
  }

  return (
    <div
      className="-m-4 md:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem', display: 'flex', flexDirection: 'column' }}
    >
      {/* 탭 바 */}
      <div
        style={{
          display: 'flex',
          background: '#ffffff',
          borderBottom: '1.5px solid #e5e7eb',
          flexShrink: 0,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => handleTabClick(t.id)}
            style={{
              flex: 1,
              padding: '13px 0',
              fontSize: '13.5px',
              fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? '#1428A0' : '#6b7280',
              background: 'none',
              border: 'none',
              borderBottom: tab === t.id ? '2.5px solid #1428A0' : '2.5px solid transparent',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* iframes */}
      {TABS.map((t) => (
        <iframe
          key={t.id}
          src={t.src}
          title={t.label}
          style={{
            flex: 1,
            border: 'none',
            display: tab === t.id ? 'block' : 'none',
            width: '100%',
          }}
        />
      ))}
    </div>
  )
}
