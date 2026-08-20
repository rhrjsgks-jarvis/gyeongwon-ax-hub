'use client'

import { useEffect, useState } from 'react'
import { getStoreCode, setStoreCode, matchStore, isTestStore, clearLegacyStore } from '@/lib/stores'

/*
 * **점코드 또는 점명을 쳐야 들어간다**(2026-08-20 사장님 결정 —
 * *"점코드 또는 점명으로만 접속해도 됩니다"*).
 *
 * 별도 비밀번호를 두지 않고 **지점 식별자 자체를 통행증**으로 쓴다. 로그인이 없고 주소가
 * 공개인 앱에서, 매장을 아는 사람만 들어오게 하는 가장 가벼운 방법이다.
 *
 * 그래서 화면이 이렇게 생겼다:
 *  · **목록이 없다.** 펼쳐 두면 상담사가 읽어 내려가다 눈에 걸린 것을 누르고, 무엇보다
 *    **아무나 아무 매장으로 들어올 수 있어 통행증 구실을 못 한다.**
 *  · **정확히 일치해야 통과한다.** `수` 한 글자로 뚫리면 열쇠가 아니다.
 *    다만 사람이 치는 방식은 받아 준다 — 점코드 대소문자, 지점명 띄어쓰기.
 *  · **자동완성을 끈다.** 브라우저가 지난번 입력을 띄우면 위 두 가지가 그 자리에서
 *    무너진다(남의 기기에서 그대로 눌러 들어간다).
 *  · **건너뛸 수 없다.** 지점을 모르는 기록은 점별 집계에서 쓸모가 없다.
 *    이미 들어온 뒤 헤더에서 다시 열었을 때만 닫힌다(바꾸려다 만 경우다).
 *
 * **고르는 것만으로는 로그를 남기지 않는다** — 진입은 사용이 아니다(허브 메인 페이지뷰를
 * 집계에서 뺀 것과 같은 이유).
 */
export default function StorePicker() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    clearLegacyStore()          // 예전 방식(기기 영구 저장)으로 남은 값 정리
    const saved = getStoreCode()
    setCode(saved)
    if (!saved) setOpen(true)
    const reopen = () => { setQ(''); setErr(''); setOpen(true) }
    window.addEventListener('ax-store-open', reopen)
    return () => window.removeEventListener('ax-store-open', reopen)
  }, [])

  /* 아직 안 들어왔으면 닫을 수 없다 */
  const required = !code

  function submit() {
    const hit = matchStore(q)
    if (!hit) {
      /*
       * **왜 틀렸는지는 알려 주지 않는다.** "그런 코드는 없습니다" 와 "이름이 다릅니다" 를
       * 갈라 주면 하나씩 넣어 보며 맞는 코드를 찾아낼 수 있다 — 통행증의 뜻이 없어진다.
       */
      setErr('확인되지 않는 지점입니다. 점코드 또는 지점명을 정확히 입력해 주세요.')
      return
    }
    setStoreCode(hit.code)
    setCode(hit.code)
    setErr('')
    setOpen(false)
    window.dispatchEvent(new CustomEvent('ax-store-changed', { detail: hit.code }))
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="지점 선택"
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(16,24,40,.62)' }}
      onClick={() => { if (!required) setOpen(false) }}
    >
      <div
        className="w-full sm:max-w-md bg-white"
        style={{ borderRadius: '18px 18px 0 0' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-6 pb-5">
          <h2 className="text-lg font-extrabold" style={{ color: 'var(--color-primary)' }}>
            어느 매장인가요?
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
            매장별 사용 현황을 모으는 데 씁니다.
            <br />점코드 또는 지점명을 입력해야 시작할 수 있습니다.
          </p>

          {/*
            자동완성·맞춤법 교정·첫 글자 대문자를 모두 끈다.
            브라우저가 지난번 입력을 띄우면 "미리 보여주지 않는다"가 무너지고,
            첫 글자가 대문자로 바뀌면 점코드가 `Zn01` 이 되어 못 찾는다.
          */}
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); if (err) setErr('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            name="ax-store-q"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            data-lpignore="true"
            data-form-type="other"
            placeholder="지점명 or 점코드를 입력해주세요"
            className="mt-4 w-full rounded-xl border px-3 py-3 text-[15px] outline-none"
            style={{
              borderColor: err ? '#fca5a5' : '#e5e7eb',
              background: err ? '#fff5f5' : '#fafbfc',
            }}
          />
          {err && <p className="mt-2 text-[12px] leading-relaxed text-red-500">{err}</p>}

          <button
            type="button"
            onClick={submit}
            disabled={!q.trim()}
            className="mt-3 w-full rounded-xl py-3 text-[15px] font-bold text-white disabled:opacity-40"
            style={{ background: 'var(--color-primary)' }}
          >
            시작하기
          </button>

          {!required && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-2 w-full text-[13px] font-semibold text-gray-400 py-2"
            >
              닫기
            </button>
          )}

          {/* 지금 어느 지점으로 들어와 있는지 — 바꾸려고 다시 연 경우에 필요하다 */}
          {code && (
            <p className="mt-3 text-[11px] text-center text-gray-400">
              지금 {isTestStore(code) ? '테스트점 (로그 미기록)' : `${code} 로 접속 중`}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
