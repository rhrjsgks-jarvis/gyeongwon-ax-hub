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
      <h1 className="text-lg font-bold text-gray-800 mb-1">개발중인 서비스</h1>
      <p className="text-xs text-gray-400 mb-5 flex items-center gap-1.5">
        <Icon name="lock" size={13} style={{ opacity: 0.6 }} />
        아직 다듬는 중입니다 — 들어갈 때 비밀번호를 묻습니다. 값이 바뀌거나 화면이 달라질 수 있으니 고객에게 그대로 읽지 마세요.
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
              <Icon name="lock" size={12} style={{ opacity: 0.4, marginLeft: 'auto' }} />
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">{m.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
