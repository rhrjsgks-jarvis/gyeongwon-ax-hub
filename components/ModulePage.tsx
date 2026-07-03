import Link from 'next/link'

interface ModulePageProps {
  icon: string
  title: string
  desc: string
  color: string
  bg: string
  status?: 'live' | 'building'
  children?: React.ReactNode
}

export default function ModulePage({
  icon, title, desc, color, bg, status = 'live', children
}: ModulePageProps) {
  return (
    <div className="max-w-3xl mx-auto">
      {/* 브레드크럼 */}
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
        <Link href="/" className="hover:text-gray-600 no-underline">🏠 허브</Link>
        <span>›</span>
        <span style={{ color }}>{title}</span>
      </div>

      {/* 모듈 헤더 */}
      <div
        className="rounded-2xl p-5 mb-5 text-white"
        style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl">{icon}</span>
          <div>
            <h1 className="text-xl font-black">{title}</h1>
            <p className="text-sm opacity-80 mt-0.5">{desc}</p>
          </div>
        </div>
        {status === 'building' && (
          <div className="mt-3 bg-white/20 rounded-xl px-3 py-2 text-xs">
            🔧 현재 구축 중입니다. 곧 사용 가능합니다.
          </div>
        )}
      </div>

      {/* 콘텐츠 */}
      {children ?? (
        <div className="bg-white rounded-2xl p-8 text-center border border-gray-100">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4"
            style={{ background: bg }}
          >
            {icon}
          </div>
          <p className="text-gray-400 text-sm">
            {status === 'building'
              ? '이 모듈은 현재 구축 중입니다.'
              : '콘텐츠를 이식 중입니다.'}
          </p>
          <Link href="/" className="btn-primary inline-block mt-4 no-underline">
            허브로 돌아가기
          </Link>
        </div>
      )}
    </div>
  )
}
