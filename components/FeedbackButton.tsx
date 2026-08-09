'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { sendFeedback } from '@/lib/logEvent'

/**
 * 버튼을 옮겨 둔 자리. 화면 크기가 달라져도 쓸 수 있게 **비율(0~1)** 로 저장한다 —
 * px 로 저장하면 가로/세로를 돌렸을 때 화면 밖으로 나간다.
 */
const POS_KEY = 'ax_feedback_pos'
const EDGE = 8

export default function FeedbackButton() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  /*
   * ── 끌어서 옮기기 ──────────────────────────────────────────────────
   * 기본 자리가 오른쪽 아래인데, 배치 시뮬레이터처럼 화면을 꽉 쓰는 도구에서는
   * **그 아래 버튼들을 가린다**(사용자 지적). 그렇다고 자리를 옮기면 다른 화면에서
   * 또 무언가를 가리므로, 쓰는 사람이 직접 옮기게 한다.
   * 옮긴 자리는 기기에 남겨 다음에도 그대로 쓴다.
   */
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null)

  /** 비율로 저장된 자리를 지금 화면 크기에 맞춰 px 로 돌려놓는다 */
  const clamp = useCallback((x: number, y: number) => {
    const el = btnRef.current
    const w = el?.offsetWidth ?? 160
    const h = el?.offsetHeight ?? 44
    return {
      x: Math.max(EDGE, Math.min(window.innerWidth - w - EDGE, x)),
      y: Math.max(EDGE, Math.min(window.innerHeight - h - EDGE, y)),
    }
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(POS_KEY)
      if (!raw) return
      const r = JSON.parse(raw) as { rx: number; ry: number }
      if (typeof r?.rx !== 'number' || typeof r?.ry !== 'number') return
      setPos(clamp(r.rx * window.innerWidth, r.ry * window.innerHeight))
    } catch { /* 저장된 자리가 깨졌으면 기본 자리를 쓴다 */ }
  }, [clamp])

  // 화면을 돌리거나 크기가 바뀌면 밖으로 나가지 않게 다시 안으로 넣는다
  useEffect(() => {
    if (!pos) return
    const onResize = () => setPos((p) => (p ? clamp(p.x, p.y) : p))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [pos, clamp])

  function onDown(e: React.PointerEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* 이미 놓인 포인터 */ }
  }
  function onMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current
    if (!d) return
    const nx = e.clientX - d.dx, ny = e.clientY - d.dy
    // 손가락이 살짝 흔들린 것까지 이동으로 보면 누르기가 안 된다
    if (!d.moved && Math.abs(e.movementX) + Math.abs(e.movementY) < 1) return
    d.moved = true
    setPos(clamp(nx, ny))
  }
  function onUp() {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (!d.moved) { setOpen(true); return }   // 안 움직였으면 그냥 누른 것이다
    setPos((p) => {
      if (p) {
        try {
          localStorage.setItem(POS_KEY, JSON.stringify({ rx: p.x / window.innerWidth, ry: p.y / window.innerHeight }))
        } catch { /* 저장 못 해도 이번 화면에서는 옮겨져 있다 */ }
      }
      return p
    })
  }

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
      <button
        ref={btnRef}
        type="button"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => { drag.current = null }}
        aria-label="개발자에게 문의하기 (끌어서 옮길 수 있습니다)"
        title="끌어서 옮길 수 있습니다"
        className={
          'z-40 rounded-full shadow-lg flex items-center gap-1.5 text-white whitespace-nowrap px-3.5 py-3 md:px-4 md:py-3 min-h-[44px] select-none ' +
          // 옮기기 전에는 기본 자리(오른쪽 아래)를 그대로 쓴다
          (pos ? 'fixed' : 'fixed bottom-24 right-3 md:bottom-6 md:right-6')
        }
        style={{
          background: '#1428A0',
          touchAction: 'none',            // 끌 때 화면이 같이 스크롤되지 않게
          cursor: 'grab',
          ...(pos ? { left: pos.x, top: pos.y } : null),
        }}
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
                    ⚠️ 전송에 실패했습니다. 네트워크를 확인하고 다시 시도해주세요.
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
