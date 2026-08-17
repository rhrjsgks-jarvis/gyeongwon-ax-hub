'use client'

import { useState, useEffect } from 'react'
import { sendFeedback } from '@/lib/logEvent'
import Icon from './Icon'

export default function FeedbackButton() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  /*
   * ── 헤더에 고정한다 (2026-08-17 사용자 결정) ─────────────────────────
   *
   * 예전에는 오른쪽 아래에 **떠 있는 버튼**이었고, 배치 시뮬레이터에서 아래 버튼들을
   * 가려서 **끌어서 옮길 수 있게** 해 두었다. 그건 고친 것이 아니라 **문제를 상담사에게
   * 떠넘긴 것**이다 — 옮긴 자리는 그 기기에만 남아, 매장 태블릿을 새로 깔면 또 가린다.
   *
   * **공유 버튼이 이미 같은 이유로 헤더에 옮겨져 있다**(2026-08-11: 미니앱 안에 떠 있다가
   * AS 안내문 첫 줄을 가려 오른쪽 여백으로 자리를 비워 두고 있었다). 같은 병이므로
   * 같은 해법을 쓴다 — 헤더 우측, 공유 아이콘 옆.
   *
   * 배치를 3D 에서만 하기로 한 뒤로는 더 분명해졌다 — 3D 는 화면을 꽉 쓰고 하단에 조작
   * 띠가 있어, 떠 있는 버튼이 가장 방해되는 화면이 앞으로 주 화면이 된다.
   */
  /* 옛 드래그 자리는 더 쓰지 않는다 — 남겨 두면 기기에 쓰레기로 굳는다 */
  useEffect(() => { try { localStorage.removeItem('ax_feedback_pos') } catch { /* 무시 */ } }, [])

  function close() {
    setOpen(false)
    setStatus('idle')
    setMessage('')
    setContact('')
  }

  async function submit() {
    const trimmed = message.trim()
    if (!trimmed) return
    setStatus('sending')
    const ok = await sendFeedback(trimmed, contact.trim() || undefined)
    if (ok) {
      setStatus('sent')
      setTimeout(close, 1500)
    } else {
      setStatus('error')
    }
  }

  return (
    <>
      {/*
        헤더 안에 들어가므로 **공유 아이콘과 같은 모양**을 쓴다 — 둘이 다르게 생기면
        같은 줄에서 하나만 버튼처럼 보인다. 크기(30px)·배경 투명도까지 맞춘다.
      */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="개발자에게 문의하기"
        title="개발자에게 문의하기"
        className="flex items-center justify-center rounded-full text-white shrink-0"
        style={{ width: 30, height: 30, background: 'rgba(255,255,255,0.18)' }}
      >
        <Icon name="chat" size={16} />
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
                <p className="mb-2 flex justify-center"><Icon name="check" size={30} style={{ color: '#059669' }} /></p>
                <p className="text-sm font-semibold text-gray-700">감사합니다! 담당자에게 전달되었습니다.</p>
              </div>
            ) : (
              <>
                <h3 className="font-bold text-sm text-gray-800 mb-1 flex items-center gap-1.5"><Icon name="chat" size={15} style={{ color: '#1428A0' }} /> 건의사항 보내기</h3>
                <p className="text-xs text-gray-400 mb-3">
                  세일즈 코파일럿 사용 중 불편한 점이나 아이디어를 자유롭게 남겨주세요.
                </p>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="예: 파인더에서 OO 검색이 잘 안 돼요 / OO 기능이 있으면 좋겠어요"
                  rows={4}
                  autoFocus
                  disabled={status === 'sending'}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-2 resize-none focus:outline-none focus:border-blue-400 disabled:opacity-60"
                />
                <input
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="연락처 (선택, 회신이 필요하면)"
                  disabled={status === 'sending'}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:border-blue-400 disabled:opacity-60"
                />
                {status === 'error' && (
                  <p className="text-xs text-red-500 mb-3">
                    전송에 실패했습니다. 네트워크를 확인하고 다시 시도해주세요.
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={close}
                    disabled={status === 'sending'}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-500 border border-gray-200 disabled:opacity-50"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!message.trim() || status === 'sending'}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: '#1428A0' }}
                  >
                    {status === 'sending' ? '전송 중…' : status === 'error' ? '다시 시도' : '보내기'}
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
