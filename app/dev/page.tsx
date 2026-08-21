'use client'

import Link from 'next/link'
import Icon, { IconName } from '@/components/Icon'
import { DEV_MODULES } from '@/lib/devModules'

/*
 * 개발중인 서비스 — 사이드바 최하단의 칸(2026-08-17 사용자 요청).
 *
 * **목록은 열어 두고 도구로 들어갈 때만 묻는다**(2026-08-17 사용자: *"개발중인 서비스
 * 제목은 노출해주면 좋겠습니다"*). 이 지면을 통째로 잠갔더니 **무엇이 준비되고 있는지조차
 * 안 보였다** — 상담사가 "그런 게 있었나" 하게 된다. 잠가야 하는 것은 **반쯤 만든 화면**
 * 이지 그 이름이 아니다.
 *
 * 그래서 잠금은 도구 쪽(`DevGate` 로 감싼 `/place` 등)에 둔다. 허브 메인의 「개발중」
 * 그룹도 원래 열려 있으므로 이쪽만 잠그면 앞뒤가 안 맞기도 했다.
 *
 * 목록은 `lib/devModules.ts` 한 곳에서만 적는다 — 허브 메인과 같은 것을 보여줘야 한다.
 */
export default function DevPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-lg font-bold text-gray-800 mb-1">개발 중인 서비스</h1>
      {/*
        **자물쇠를 지우고 그 자리에 부탁을 적는다**(2026-08-17 사용자 요청:
        *"이제 잠금을 해제했기 때문에 자물쇠 마크는 필요없습니다. 차라리 어플 만져보고
        개발 아이디어를 전달해달라고 표기해주는 게 좋을 것 같습니다"*).

        자물쇠는 **들어오지 말라는 말**이라, 정작 비밀번호를 안 묻는데 그려 두면
        상담사가 열어 보지도 않는다. 이 칸에 바라는 것은 정반대다 — 써 보고 알려 주는 것.
        보낼 곳은 **이미 헤더에 있는 개발자 문의**(💬)라 새 통로를 만들지 않는다.
      */}
      <p className="text-xs text-gray-400 mb-5 flex items-start gap-1.5">
        <Icon name="bulb" size={13} style={{ opacity: 0.7, flexShrink: 0, marginTop: 1 }} />
        <span>
          자유롭게 만져 보시고 <b className="text-gray-500">개선 아이디어를 보내 주세요</b> — 오른쪽 위
          <Icon name="chat" size={11} style={{ display: 'inline', margin: '0 3px', verticalAlign: '-1px' }} />
          개발자 문의로 받습니다. 아직 다듬는 중이라 값이 바뀔 수 있으니 고객에게 그대로 읽지는 마세요.
        </span>
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {DEV_MODULES.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="block bg-white rounded-2xl p-4 shadow-sm no-underline"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex items-center justify-center rounded-xl" style={{ width: 34, height: 34, background: m.bg }}>
                <Icon name={m.icon as IconName} size={18} style={{ color: m.color }} />
              </span>
              <span className="text-sm font-bold text-gray-800">{m.title}</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: '#FEF3C7', color: '#92400E' }}>구축중</span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">{m.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
