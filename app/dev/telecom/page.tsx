import Link from 'next/link'

/**
 * 통신향 상담기 — **닫아 두었다** (2026-09-14 사장님 지시).
 *
 * *"세일즈코파일럿 안에 통신향계산기를 닫아주세요 (통신향 자급제 비교계산기로 추후
 * 업데이트 예정)"*. 허브 카드·개발중 목록·통합검색 색인에서 뺐고(lib/devModules.ts 의
 * CLOSED_DEV_MODULES), 저쪽 배포로 넘기던 rewrite(next.config.js)도 껐다.
 *
 * 이 페이지를 지우지 않는 이유 — 옛 링크·북마크·카톡으로 공유된 주소로 들어온 상담사가
 * 404 를 보면 고장으로 읽는다. 무엇이 어떻게 됐는지 한 줄로 말하고 허브로 돌려보낸다.
 * 다시 열 때는 git 이력의 iframe 판(useTabbarHeight 포함)을 되살리면 된다.
 */
export const metadata = { title: '통신향 상담기 (준비 중) — 세일즈 코파일럿' }

export default function TelecomClosedPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-8 text-center shadow-sm">
        <div className="text-xs font-semibold tracking-wide text-[#1428A0] mb-2">준비 중</div>
        <h1 className="text-xl font-bold text-gray-900 mb-3">통신향 상담기는 잠시 닫았습니다</h1>
        <p className="text-sm text-gray-600 leading-relaxed">
          <b className="text-gray-800">통신향 · 자급제 비교계산기</b>로 새로 만들어 다시 열 예정입니다.
          <br />그때까지는 매장 계산기(엑셀·웹앱)를 그대로 써 주세요.
        </p>
        <Link
          href="/"
          className="inline-block mt-6 px-5 py-2.5 rounded-lg bg-[#1428A0] text-white text-sm font-semibold hover:bg-[#0f1f80]"
        >
          허브로 돌아가기
        </Link>
      </div>
    </div>
  )
}
