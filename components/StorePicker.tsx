'use client'

import { useEffect, useMemo, useState } from 'react'
import { STORE_LIST, getStoreCode, setStoreCode, findStores } from '@/lib/stores'
import { logEvent } from '@/lib/logEvent'

/*
 * **첫 접속에 지점을 고르고 들어간다**(2026-08-20 사장님 요청).
 *
 * 점별 사용 로그를 취합하려면 "이 기기가 어느 매장인가"를 알아야 하는데, 로그인 없는
 * 공개 주소라 서버가 알 방법이 없다. 그래서 **처음 한 번만 묻고 기기에 남긴다**
 * (`localStorage`). 매장 태블릿은 자리에 고정돼 있어 한 번 고르면 바뀌지 않는다.
 *
 * 지키는 것 셋:
 *  · **지점명과 점코드 어느 쪽으로도 찾는다** — 상담사는 매장 이름을 알고, 관리자는
 *    코드를 안다. 이름은 띄어쓰기를 무시한다("스타필드수원" · "스타필드 수원").
 *  · **건너뛸 수 있다.** 고르지 않으면 로그의 지점 칸이 비고, 대시보드가 '(미지정)'으로
 *    따로 센다 — 0 으로 적어 "안 썼다"로 읽히게 하지 않는다. 상담을 막는 것이 더 나쁘다.
 *  · **나중에 바꿀 수 있다.** 헤더의 지점 이름을 누르면 이 화면이 다시 뜬다(`ax-store-open`).
 */
export default function StorePicker() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [code, setCode] = useState('')

  useEffect(() => {
    const saved = getStoreCode()
    setCode(saved)
    if (!saved) setOpen(true)
    const reopen = () => { setQ(''); setOpen(true) }
    window.addEventListener('ax-store-open', reopen)
    return () => window.removeEventListener('ax-store-open', reopen)
  }, [])

  const list = useMemo(() => findStores(q), [q])

  function choose(c: string) {
    setStoreCode(c)
    setCode(c)
    setOpen(false)
    /* 어느 매장이 언제 들어왔는지도 신호다 — 지점을 고른 그 순간을 남긴다 */
    logEvent('hub', 'tab_switch', `지점 선택: ${c}`)
    window.dispatchEvent(new CustomEvent('ax-store-changed', { detail: c }))
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="지점 선택"
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(16,24,40,.55)' }}
    >
      <div
        className="w-full sm:max-w-md bg-white flex flex-col"
        style={{ borderRadius: '18px 18px 0 0', maxHeight: '88vh' }}
      >
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-lg font-extrabold" style={{ color: 'var(--color-primary)' }}>
            어느 매장인가요?
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            매장별 사용 현황을 모으는 데 씁니다. 한 번만 고르면 이 기기에 기억됩니다.
            <br />지점명이나 점코드로 찾으세요.
          </p>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="스타필드 수원 · ZN01 · 분당…"
            className="mt-3 w-full rounded-xl border px-3 py-2.5 text-[15px] outline-none"
            style={{ borderColor: '#e5e7eb', background: '#fafbfc' }}
          />
        </div>

        <div className="flex-1 overflow-auto px-3 pb-2" style={{ minHeight: '38vh' }}>
          {list.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">
              찾는 매장이 없습니다.<br />점코드(Z…)로도 찾아보세요.
            </p>
          ) : (
            list.map((s) => (
              <button
                key={s.code}
                type="button"
                onClick={() => choose(s.code)}
                className="w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left"
                style={{
                  background: s.code === code ? 'rgba(20,40,160,.08)' : 'transparent',
                  color: s.code === code ? 'var(--color-primary)' : '#374151',
                  fontWeight: s.code === code ? 700 : 500,
                }}
              >
                <span className="text-[14px]">{s.name}</span>
                <span className="text-[11px] tracking-wide text-gray-400">{s.code}</span>
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t px-5 py-3" style={{ borderColor: '#f1f3f6' }}>
          <span className="text-[11px] text-gray-400">전체 {STORE_LIST.length}곳</span>
          {/* 나중에 고를 수 있게 둔다 — 상담을 막는 것이 로그가 비는 것보다 나쁘다 */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[13px] font-semibold text-gray-500 px-3 py-1.5"
          >
            나중에 고르기
          </button>
        </div>
      </div>
    </div>
  )
}
