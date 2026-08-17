'use client'

import Link from 'next/link'
import Icon, { IconName } from '@/components/Icon'
import DevGate from '@/components/DevGate'
import { DEV_MODULES } from '@/lib/devModules'

/*
 * 개발중인 서비스 — 사이드바 최하단의 잠긴 칸(2026-08-17 사용자 요청).
 *
 * 아직 다듬는 중인 도구를 그대로 열어 두면 상담사가 반쯤 만든 화면을 고객에게 보여준다.
 * 잠금은 `DevGate` 가 맡고, **도구 페이지도 같은 자물쇠로 감싼다** — 목록만 잠그면
 * 주소를 아는 사람은 그냥 들어간다.
 *
 * 목록은 `lib/devModules.ts` 한 곳에서만 적는다 — 허브 메인의 「개발중」 그룹과 같은 것을
 * 보여줘야 한다. 두 곳에 적으면 어긋나고, 어긋난 쪽을 본 상담사가 없는 도구를 찾는다.
 */
export default function DevPage() {
  return (
    <DevGate title="개발중인 서비스">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-lg font-bold text-gray-800 mb-1">개발중인 서비스</h1>
        <p className="text-xs text-gray-400 mb-5">
          아직 다듬는 중입니다 — 값이 바뀌거나 화면이 달라질 수 있습니다. 고객에게 그대로 읽지 마세요.
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
    </DevGate>
  )
}
