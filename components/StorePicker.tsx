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
 * ── 들어오기 전에는 **아무것도 보여주지 않는다** ──
 * 사장님 지시(2026-08-20): *"하얀 배경에 점을 입력하는 창만 나오게. 아예 어떤 어플인지
 * 모르게 하는 게 좋을 것 같습니다."* 그래서 이 화면은 앱 위에 뜨는 모달이 아니라
 * **앱을 통째로 가리는 문**이다 — 불투명 흰 바탕에 입력칸 하나뿐이고, 앱 이름·로고·
 * 메뉴가 하나도 없다.
 *
 * **기본값이 「잠김」이다.** 열림을 기본으로 두면 서버가 보낸 HTML 에 앱이 먼저 그려지고
 * 자바스크립트가 도는 찰나에 **허브가 번쩍 보인다** — 감추려는 뜻이 그 순간에 무너진다.
 * 이미 들어온 세션이면 그 대신 흰 화면이 잠깐 스치는데, 그쪽이 훨씬 낫다.
 *
 * ── 통행증으로 쓰려면 지켜야 하는 것 ──
 *  · **목록이 없다.** 화면에 매장 이름이 하나라도 적혀 있으면 아무나 그것으로 들어온다.
 *  · **정확히 일치해야 통과한다.** `수` 한 글자로 뚫리면 열쇠가 아니다.
 *    사람이 치는 방식만 받아 준다 — 점코드 대소문자, 지점명 띄어쓰기.
 *  · **자동완성을 끈다.** 브라우저가 지난번 입력을 띄우면 위 둘이 그 자리에서 무너진다.
 *  · **왜 틀렸는지 알려 주지 않는다.** 갈라 주면 하나씩 넣어 보며 찾아낼 수 있다.
 *
 * **고르는 것만으로는 로그를 남기지 않는다** — 진입은 사용이 아니다(허브 메인 페이지뷰를
 * 집계에서 뺀 것과 같은 이유).
 */
export default function StoreGate({ children }: { children: React.ReactNode }) {
  /*
   * `gated` — 아직 못 들어온 상태(문이 닫혀 있다). **처음에는 true 다**(위 주석 참조).
   * `open`  — 이미 들어온 뒤 헤더에서 지점을 바꾸려고 다시 연 상태.
   */
  const [gated, setGated] = useState(true)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    clearLegacyStore()          // 예전 방식(기기 영구 저장)으로 남은 값 정리
    const saved = getStoreCode()
    setCode(saved)
    setGated(!saved)
    const reopen = () => { setQ(''); setErr(''); setOpen(true) }
    window.addEventListener('ax-store-open', reopen)
    return () => window.removeEventListener('ax-store-open', reopen)
  }, [])

  /* 문이 닫혀 있는 동안은 뒤 화면이 스크롤되지 않게 — 가려 놓고 움직이면 비쳐 보인다 */
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.body.style.overflow = gated ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [gated])

  function submit() {
    const hit = matchStore(q)
    if (!hit) {
      setErr('확인되지 않습니다. 다시 입력해 주세요.')
      return
    }
    setStoreCode(hit.code)
    setCode(hit.code)
    setErr('')
    setGated(false)
    setOpen(false)
    window.dispatchEvent(new CustomEvent('ax-store-changed', { detail: hit.code }))
  }

  /* 들어온 뒤에는 앱을 그대로 그린다(바꾸기 시트는 그 위에 얹는다) */

  /* 입력칸 — 문에서도 바꾸기에서도 같은 것을 쓴다 */
  const field = (
    <>
      {/*
        자동완성·맞춤법 교정·첫 글자 대문자를 모두 끈다.
        브라우저가 지난번 입력을 띄우면 "이름을 안 보여준다"가 무너지고,
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
        aria-label="점코드 또는 지점명"
        className="w-full rounded-xl border px-3 py-3 text-[15px] outline-none"
        style={{
          borderColor: err ? '#fca5a5' : '#e5e7eb',
          background: err ? '#fff5f5' : '#fafbfc',
        }}
      />
      {err && <p className="mt-2 text-[12px] text-red-500">{err}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={!q.trim()}
        className="mt-3 w-full rounded-xl py-3 text-[15px] font-bold text-white disabled:opacity-40"
        style={{ background: '#1428A0' }}
      >
        확인
      </button>
    </>
  )

  /* ── 문 — **앱을 아예 그리지 않는다.** 이름도 로고도 설명도 없다 ── */
  if (gated) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="지점 선택"
        className="fixed inset-0 z-[9999] flex items-center justify-center px-6"
        style={{ background: '#fff' }}
      >
        <div className="w-full max-w-xs">{field}</div>
      </div>
    )
  }

  /* ── 들어온 뒤 — 앱을 그리고, 지점을 바꾸려고 열었으면 그 위에 시트를 얹는다 ── */
  if (!open) return <>{children}</>

  return (
    <>
    {children}
    <div
      role="dialog"
      aria-modal="true"
      aria-label="지점 선택"
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(16,24,40,.62)' }}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full sm:max-w-md bg-white px-5 pt-6 pb-5"
        style={{ borderRadius: '18px 18px 0 0' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-extrabold mb-3" style={{ color: '#1428A0' }}>지점 바꾸기</h2>
        {field}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mt-2 w-full text-[13px] font-semibold text-gray-400 py-2"
        >
          닫기
        </button>
        {code && (
          <p className="mt-2 text-[11px] text-center text-gray-400">
            지금 {isTestStore(code) ? '테스트점 (로그 미기록)' : `${code} 로 접속 중`}
          </p>
        )}
      </div>
    </div>
    </>
  )
}
