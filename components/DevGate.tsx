'use client'

import { useEffect, useState } from 'react'
import Icon from './Icon'

/*
 * 개발중인 서비스 잠금 — **`/dev` 목록과 그 안의 도구가 같은 자물쇠를 쓴다.**
 *
 * 목록만 잠그면 주소를 아는 사람은 그냥 들어간다(`/place` 처럼 원래 열려 있던 도구를
 * 개발중으로 내리면 특히 그렇다). 그래서 도구 페이지 자체를 이 컴포넌트로 감싼다.
 *
 *  · 상태는 `sessionStorage` + 만료시각 — 탭을 닫으면 잠기고 2시간이 지나면 다시 묻는다.
 *    `localStorage` 에 '1' 만 저장했다가 **한 번 통과한 기기가 영구히 열려 있던** 사고가 있었다.
 *  · 검증은 **서버에서만** 한다(`/api/admin-auth`, `scope:'dev'`). 클라이언트로 옮기면
 *    번들에 실려 검증이 통째로 무의미해진다.
 *  · **새 비밀번호를 만들지 않는다.** `DEV_PW` 가 있으면 그것을, 없으면 관리자 비번을
 *    그대로 쓴다(`lib/adminAuth.ts`). 매장에 알려 줄 비밀번호가 늘수록 새는 곳도 는다.
 *
 * 한 번 풀면 `/dev` 와 그 안의 도구가 함께 열린다 — 같은 열쇠라 키를 두 번 묻지 않는다.
 */
export const DEV_SESSION_KEY = 'ax_dev_unlocked_until'
const UNLOCK_TTL_MS = 2 * 60 * 60 * 1000

export function isDevUnlocked(): boolean {
  try {
    const until = Number(sessionStorage.getItem(DEV_SESSION_KEY) || 0)
    return Number.isFinite(until) && until > Date.now()
  } catch {
    return false
  }
}

function markUnlocked(): void {
  try { sessionStorage.setItem(DEV_SESSION_KEY, String(Date.now() + UNLOCK_TTL_MS)) } catch {}
}

function Form({ title, onUnlock }: { title: string; onUnlock: () => void }) {
  const [pw, setPw] = useState('')
  const [error, setError] = useState<'' | 'wrong' | 'locked'>('')
  const [checking, setChecking] = useState(false)

  const submit = async () => {
    setChecking(true)
    try {
      const res = await fetch('/api/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw, scope: 'dev' }),
      })
      const data = await res.json()
      if (data.ok) { markUnlocked(); onUnlock() }
      else setError(res.status === 429 ? 'locked' : 'wrong')
    } catch {
      setError('wrong')
    }
    setChecking(false)
  }

  return (
    <div className="max-w-sm mx-auto mt-16 bg-white rounded-2xl shadow-sm p-6 text-center">
      <p className="flex justify-center mb-3"><Icon name="lock" size={30} style={{ color: '#1428A0' }} /></p>
      <h1 className="text-base font-bold text-gray-800 mb-1">{title}</h1>
      <p className="text-xs text-gray-400 mb-5">
        아직 다듬는 중인 도구입니다. 값이 바뀌거나 화면이 달라질 수 있으니 고객에게 그대로 읽지 마세요.
      </p>
      <input
        type="password"
        value={pw}
        onChange={(e) => { setPw(e.target.value); setError('') }}
        onKeyDown={(e) => { if (e.key === 'Enter' && pw && !checking) submit() }}
        placeholder="비밀번호"
        autoFocus
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-2 text-center focus:outline-none focus:border-blue-400"
      />
      {error === 'wrong' && <p className="text-xs text-red-500 mb-2">비밀번호가 다릅니다.</p>}
      {error === 'locked' && <p className="text-xs text-red-500 mb-2">시도가 많습니다 — 10분 뒤 다시 시도해주세요.</p>}
      <button
        type="button"
        onClick={submit}
        disabled={!pw || checking}
        className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: '#1428A0' }}
      >
        {checking ? '확인 중…' : '들어가기'}
      </button>
    </div>
  )
}

export default function DevGate({ title, children }: { title: string; children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false)
  const [ready, setReady] = useState(false)

  /* 서버 렌더와 어긋나지 않게 마운트 뒤에 판정한다 */
  useEffect(() => { setUnlocked(isDevUnlocked()); setReady(true) }, [])

  if (!ready) return null
  if (!unlocked) return <Form title={title} onUnlock={() => setUnlocked(true)} />
  return <>{children}</>
}
