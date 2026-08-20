'use client'

import { useEffect, useMemo, useState } from 'react'
import { ACTIVE_STORES, getStoreCode, setStoreCode, findStores, isTestStore, clearLegacyStore } from '@/lib/stores'

/*
 * **접속할 때마다 지점을 고르고 들어간다**(2026-08-20 사장님 요청).
 *
 * 점별 사용 로그를 취합하려면 "지금 이 접속이 어느 매장인가"를 알아야 하는데, 로그인 없는
 * 공개 주소라 서버가 알 방법이 없다. 그래서 묻는다.
 *
 *  · **세션마다 묻는다.** 저장 자리가 `sessionStorage` 라 앱을 닫으면 지워지고 다음에 열
 *    때 다시 고른다. 같은 세션 안에서 화면을 옮길 때는 묻지 않는다 — 그것까지 물으면
 *    상담이 막힌다. 익명 세션 id 와 수명이 같아져 "한 세션 = 한 매장의 상담 한 판"이 된다.
 *
 *  · **고르기 전에는 쓸 수 없다**(2026-08-20 사장님 재지시 — *"이제는 어느 지점에서
 *    활용하는지 기록이 중요합니다"*). 예전에는 '나중에 고르기'로 건너뛸 수 있었는데,
 *    그러면 그 세션의 사용이 통째로 '(미지정)'으로 빠진다. **지점을 모르는 기록은
 *    점별 집계에서 아무 쓸모가 없다** — 뒤로 물러설 길을 닫는 것이 맞다.
 *    이미 고른 뒤 헤더에서 다시 열었을 때만 닫을 수 있다(바꾸려다 만 경우다).
 *
 *  · **지점명·점코드 어느 쪽으로도 찾는다** — 상담사는 매장 이름을, 관리자는 코드를 안다.
 *    이름은 띄어쓰기를 무시한다("스타필드수원" · "스타필드 수원").
 *
 *  · **고르는 것만으로는 로그를 남기지 않는다.** 예전에는 여기서 `hub/tab_switch` 를
 *    하나 남겼는데, 그러면 앱을 열었다 닫기만 해도 사용 기록이 생긴다 — 허브 메인
 *    페이지뷰를 집계에서 뺀 것과 같은 이유다(진입은 사용이 아니다).
 */
export default function StorePicker() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [code, setCode] = useState('')

  useEffect(() => {
    clearLegacyStore()          // 예전 방식(기기 영구 저장)으로 남은 값 정리
    const saved = getStoreCode()
    setCode(saved)
    if (!saved) setOpen(true)
    const reopen = () => { setQ(''); setOpen(true) }
    window.addEventListener('ax-store-open', reopen)
    return () => window.removeEventListener('ax-store-open', reopen)
  }, [])

  /*
   * **지점명을 미리 보여주지 않는다**(2026-08-20 사장님 지시).
   * 목록을 펼쳐 두면 상담사가 **읽어 내려가다 눈에 먼저 걸린 것을 누른다** — 자기 매장이
   * 아닌데도 그럴듯하면 고르게 되고, 그 매장 통계가 통째로 엉뚱한 곳에 잡힌다.
   * 자기 매장을 **알고 치는 사람만** 고르게 한다.
   */
  const typed = q.trim().length > 0
  const list = useMemo(() => (typed ? findStores(q) : []), [q, typed])
  /* 아직 안 골랐으면 닫을 수 없다 — 지점 없는 기록은 점별 집계에서 쓸모가 없다 */
  const required = !code

  function choose(c: string) {
    setStoreCode(c)
    setCode(c)
    setOpen(false)
    window.dispatchEvent(new CustomEvent('ax-store-changed', { detail: c }))
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="지점 선택"
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(16,24,40,.62)' }}
      /* 이미 고른 상태에서 다시 연 것이면 바깥을 눌러 닫을 수 있다 */
      onClick={() => { if (!required) setOpen(false) }}
    >
      <div
        className="w-full sm:max-w-md bg-white flex flex-col"
        style={{ borderRadius: '18px 18px 0 0', maxHeight: '88vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-lg font-extrabold" style={{ color: 'var(--color-primary)' }}>
            어느 매장인가요?
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            {required
              ? '매장별 사용 현황을 모으는 데 씁니다. 지점을 골라야 시작할 수 있습니다.'
              : '매장별 사용 현황을 모으는 데 씁니다.'}
            <br />지점명이나 점코드로 찾으세요.
          </p>
          {/*
            **예시 지점을 적지 않는다**(2026-08-20 사장님 요청). 한 매장 이름을 예시로
            띄우면 그 매장이 기본값처럼 읽혀 **그대로 두고 들어가는 사람이 생긴다** —
            점별 통계가 그 한 곳으로 쏠린다. 무엇을 넣는지만 말한다.
          */}
          {/*
            **자동완성을 끈다**(2026-08-20 사장님 지시). 브라우저가 지난번에 친 지점명을
            드롭다운으로 띄우면, **지점명을 미리 보여주지 않기로 한 것이 그 자리에서
            무너진다** — 남의 기기·다른 매장에서 그 목록을 그대로 눌러 들어가게 된다.
            맞춤법 교정·첫 글자 대문자도 끈다(점코드가 `Zn01` 로 바뀌면 못 찾는다).
          */}
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            name="ax-store-q"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            data-lpignore="true"
            data-form-type="other"
            placeholder="지점명 or 점코드를 입력해주세요"
            className="mt-3 w-full rounded-xl border px-3 py-2.5 text-[15px] outline-none"
            style={{ borderColor: '#e5e7eb', background: '#fafbfc' }}
          />
        </div>

        <div className="flex-1 overflow-auto px-3 pb-2" style={{ minHeight: '38vh' }}>
          {!typed ? (
            <p className="py-12 text-center text-sm text-gray-400 leading-relaxed">
              지점명 또는 점코드를 입력하면<br />해당하는 매장이 나옵니다.
            </p>
          ) : list.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-400 leading-relaxed">
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
                {/* 테스트점은 검색해야만 나온다 — 무심코 고르면 그 매장 사용량이 사라진다 */}
                <span className="text-[14px]" style={isTestStore(s.code) ? { color: '#9aa0a6' } : undefined}>
                  {s.name}
                </span>
                <span className="text-[11px] tracking-wide text-gray-400">{s.code}</span>
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t px-5 py-3" style={{ borderColor: '#f1f3f6' }}>
          {/* **활성 지점만, 테스트점은 빼고 센다** — 목록에 안 보이는 것을 세면 화면이 거짓말을 한다 */}
          <span className="text-[11px] text-gray-400">
            경원영업팀 {ACTIVE_STORES.filter((x) => !isTestStore(x.code)).length}곳
          </span>
          {required ? (
            <span className="text-[11px] text-gray-400">지점을 골라야 시작됩니다</span>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[13px] font-semibold text-gray-500 px-3 py-1.5"
            >
              닫기
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
