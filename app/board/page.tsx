'use client'

/*
 * 자유게시판 (2026-08-30 사장님 요청 — *"별도로 게시판같은걸만들어서 여러가지 이야기를
 * 적을 수 있도록 하면 좋을것같습니다"*)
 *
 * 65개 매장 상담사들이 자유롭게 적는 자리다. 저장은 Google 시트
 * (`docs/apps-script/Board.gs`)이고, 이 화면은 `/api/board` 만 본다.
 *
 * · **지점명은 접속 지점에서 자동으로 붙는다** — 로그·포스터와 같은 규칙.
 * · **글 내용은 남이 쓴 글**이다 — React 가 기본으로 이스케이프하는 텍스트로만 그린다
 *   (dangerouslySetInnerHTML 금지). 게시판은 이 저장소에서 가장 넓은 자유 입력 자리다.
 * · **실패를 성공으로 적지 않는다** — 등록이 실패하면 실패라고 말하고 쓴 글을 지우지
 *   않는다(응시 기록 저장에서 못 박은 그 원칙).
 * · 삭제·수정은 화면에 없다 — 로그인 없는 앱이라 "내 글"을 증명할 길이 없다.
 *   지워야 할 글은 시트 관리자가 시트에서 지운다(화면이 그 사실을 밝힌다).
 */

import { useEffect, useRef, useState } from 'react'
import { logOnce, logEvent } from '@/lib/logEvent'
import { getStoreCode, storeName } from '@/lib/stores'
import Icon from '@/components/Icon'

type Post = {
  ts: number; store: string; storeName: string
  author: string; topic: string; title: string; body: string
}

const TOPICS = ['자유', '정보', '질문', '건의'] as const

const TOPIC_COLOR: Record<string, string> = {
  자유: '#475569', 정보: '#1428A0', 질문: '#B45309', 건의: '#059669',
}

function when(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const mins = Math.floor((Date.now() - ts) / 60000)
  if (mins < 1) return '방금'
  if (mins < 60) return `${mins}분 전`
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}시간 전`
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function BoardPage() {
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [connected, setConnected] = useState(true)
  const [reason, setReason] = useState('')
  const [stale, setStale] = useState(false)

  const [topic, setTopic] = useState<string>('자유')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [author, setAuthor] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null)
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const store = useRef({ code: '', name: '' })

  useEffect(() => {
    logOnce('board', 'page_view')
    const code = getStoreCode() || ''
    store.current = { code, name: storeName(code) }
  }, [])

  const load = async (fresh = false) => {
    try {
      const res = await fetch(fresh ? '/api/board?fresh=1' : '/api/board', { cache: 'no-store' })
      const d = await res.json()
      setPosts(Array.isArray(d.posts) ? d.posts : [])
      setConnected(!!d.connected)
      setStale(!!d.stale)
      setReason(d.reason || '')
    } catch {
      setPosts([])
      setConnected(false)
      setReason('네트워크')
    }
  }
  useEffect(() => { load() }, [])

  const submit = async () => {
    if (sending) return
    if (!title.trim() || !body.trim()) {
      setNotice({ ok: false, msg: '제목과 내용을 적어주세요.' })
      return
    }
    setSending(true)
    setNotice(null)
    try {
      const res = await fetch('/api/board', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          store: store.current.code, storeName: store.current.name,
          author: author.trim(), topic, title: title.trim(), body: body.trim(),
        }),
      })
      const d = await res.json().catch(() => null)
      if (res.ok && d && d.ok) {
        setNotice({ ok: true, msg: '등록되었습니다.' })
        setTitle(''); setBody('')
        logEvent('board', 'generate', topic)
        await load(true)
      } else {
        /* 실패라고 사실대로 적고 **쓴 글은 지우지 않는다** — 다시 누르면 된다 */
        setNotice({ ok: false, msg: `등록 실패 — ${(d && d.reason) || `HTTP ${res.status}`}. 쓰신 글은 그대로 있으니 다시 눌러주세요.` })
      }
    } catch {
      setNotice({ ok: false, msg: '등록 실패 — 네트워크를 확인해주세요. 쓰신 글은 그대로 있습니다.' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="-m-4 lg:-m-6">
      {/* 머리 — 아홉 미니앱과 같은 꼴(남색 바 + 아이콘 배지 + 제목 + 부제) */}
      <div style={{ background: '#1428A0' }} className="text-white px-4 py-3.5">
        <div className="max-w-[840px] mx-auto flex items-center gap-2.5">
          <div className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center shrink-0"
            style={{ background: 'rgba(255,255,255,.16)' }}>
            <Icon name="chat" size={20} />
          </div>
          <div>
            <div className="text-[17px] font-extrabold leading-tight">자유게시판</div>
            <div className="text-[11.5px] mt-0.5" style={{ color: '#c7d2fe' }}>
              공지·정보·질문·건의 — 경원영업팀이 함께 적는 자리
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[840px] mx-auto px-4 py-4 pb-24">
        {/* 글쓰기 */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
          <p className="text-[11px] font-extrabold text-gray-400 mb-2">글쓰기</p>
          <div className="flex gap-2 mb-2">
            {TOPICS.map((t) => (
              <button key={t} onClick={() => setTopic(t)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-bold border transition-colors ${
                  topic === t ? 'text-white border-transparent' : 'text-gray-500 border-gray-200 bg-white'
                }`}
                style={topic === t ? { background: TOPIC_COLOR[t] } : undefined}>
                {t}
              </button>
            ))}
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80}
            placeholder="제목"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-2 focus:outline-none focus:border-blue-400" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={4}
            placeholder="내용 — 매장에서 있었던 일, 공유하고 싶은 정보, 궁금한 것, 무엇이든 적어주세요"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-2 focus:outline-none focus:border-blue-400 resize-y" />
          <div className="flex gap-2 items-center">
            <input value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={20}
              placeholder="이름 (선택)"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400" />
            <span className="text-[11px] text-gray-400 shrink-0">{store.current.name || '지점 미확인'}</span>
            <button onClick={submit} disabled={sending}
              className="shrink-0 px-5 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50"
              style={{ background: '#1428A0' }}>
              {sending ? '등록 중…' : '등록'}
            </button>
          </div>
          {notice && (
            <p className={`mt-2 text-[12px] font-semibold ${notice.ok ? 'text-green-600' : 'text-red-600'}`}>
              {notice.msg}
            </p>
          )}
        </div>

        {/* 연결 상태 — 실패를 빈 게시판처럼 보이게 하지 않는다 */}
        {!connected && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 text-[12.5px] leading-relaxed text-amber-800">
            <b>게시판 시트가 아직 연결되지 않았습니다</b> ({reason}).<br />
            연결 방법: <code className="text-[11px]">docs/apps-script/Board.gs</code> 를 새 Google 시트의
            Apps Script 로 배포하고, 그 /exec 주소를 Vercel 환경변수 <b>BOARD_GAS_URL</b> 에 넣은 뒤
            재배포하면 됩니다 (사용 로그 시트를 연동했던 것과 같은 절차입니다).
          </div>
        )}
        {stale && (
          <p className="text-[11px] text-amber-600 mb-2">시트 연결이 느려 마지막으로 받아 둔 목록을 보여드리고 있습니다.</p>
        )}

        {/* 목록 */}
        {posts === null ? (
          <p className="text-center text-gray-400 text-sm py-10">불러오는 중…</p>
        ) : posts.length === 0 && connected ? (
          <p className="text-center text-gray-400 text-sm py-10">아직 글이 없습니다 — 첫 글을 적어주세요.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {posts.map((p, i) => {
              const open = openIdx === i
              const long = p.body.length > 120 || p.body.split('\n').length > 3
              return (
                <button key={`${p.ts}-${i}`} onClick={() => setOpenIdx(open ? null : i)}
                  className="text-left bg-white rounded-2xl border border-gray-100 p-4 hover:border-blue-200 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full text-white"
                      style={{ background: TOPIC_COLOR[p.topic] || '#475569' }}>{p.topic || '자유'}</span>
                    <span className="text-sm font-bold text-gray-800 flex-1 min-w-0 truncate">{p.title}</span>
                  </div>
                  {/* 글 내용은 남이 쓴 글 — 텍스트로만 그린다(React 기본 이스케이프) */}
                  <p className={`text-[13px] text-gray-600 whitespace-pre-wrap leading-relaxed ${
                    open ? '' : 'line-clamp-3'}`}>{p.body}</p>
                  {long && (
                    <p className="text-[11px] font-bold mt-1" style={{ color: '#1428A0' }}>
                      {open ? '접기 ▲' : '더 보기 ▼'}
                    </p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-2">
                    {p.storeName || p.store || '지점 미상'}{p.author ? ` · ${p.author}` : ''} · {when(p.ts)}
                  </p>
                </button>
              )
            })}
          </div>
        )}

        <p className="text-[10.5px] text-gray-300 mt-5 leading-relaxed">
          글 삭제·수정이 필요하면 관리자에게 말씀해주세요 — 게시판 시트에서 지울 수 있습니다.
          지점명은 접속하신 지점으로 자동으로 붙습니다.
        </p>
      </div>
    </div>
  )
}
