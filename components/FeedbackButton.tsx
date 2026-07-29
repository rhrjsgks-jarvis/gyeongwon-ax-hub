'use client'

import { useState } from 'react'
import { sendFeedback } from '@/lib/logEvent'

export default function FeedbackButton() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [status, setStatus] = useState<'idle' | 'sent'>('idle')

  function close() {
    setOpen(false)
    setStatus('idle')
    setMessage('')
    setContact('')
  }

  function submit() {
    const trimmed = message.trim()
    if (!trimmed) return
    sendFeedback(trimmed, contact.trim() || undefined)
    setStatus('sent')
    setTimeout(close, 1500)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="개발자에게 문의하기"
        className="fixed z-40 rounded-full shadow-lg flex items-center gap-1.5 text-white whitespace-nowrap bottom-24 right-3 md:bottom-6 md:right-6 px-3.5 py-3 md:px-4 md:py-3 min-h-[44px]"
        style={{ background: '#1428A0' }}
      >
        <span className="text-base leading-none">💬</span>
        <span className="text-xs md:text-sm font-semibold leading-none">개발자에게 문의하기</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => status === 'idle' && close()}
        >
          <div
            className="bg-white rounded-t-2xl md:rounded-2xl w-full md:w-96 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {status === 'sent' ? (
              <div className="text-center py-6">
                <p className="text-2xl mb-2">✅</p>
                <p className="text-sm font-semibold text-gray-700">감사합니다! 담당자에게 전달되었습니다.</p>
              </div>
            ) : (
              <>
                <h3 className="font-bold text-sm text-gray-800 mb-1">💬 건의사항 보내기</h3>
                <p className="text-xs text-gray-400 mb-3">
                  AX 허브 사용 중 불편한 점이나 아이디어를 자유롭게 남겨주세요.
                </p>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="예: 파인더에서 OO 검색이 잘 안 돼요 / OO 기능이 있으면 좋겠어요"
                  rows={4}
                  autoFocus
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-2 resize-none focus:outline-none focus:border-blue-400"
                />
                <input
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="연락처 (선택, 회신이 필요하면)"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:border-blue-400"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={close}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-500 border border-gray-200"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!message.trim()}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: '#1428A0' }}
                  >
                    보내기
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
