// 실시간 현황 응시자 표의 감독 이벤트 표시: 작은 빨간 점(+ 건수). 누르면 그 응시자의 이벤트 기록이 팝오버로 열린다.
// 전체 응시자의 이벤트를 한 곳에 쌓지 않고, 보고 싶은 응시자만 골라 본다 (DESIGN.md §9-4 실시간 현황).
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight } from 'lucide-react'
import { cx } from '../../components/cx'
import type { ProctorEventView } from '../../consoleApi'
import { EVENT_LABEL, isCameraEvent } from '../../data/consoleSessions'
import { fmtTime } from './format'

const POPOVER_WIDTH = 320
const GAP = 6
const MARGIN = 8

const REVIEW_LABEL = { OK: '문제 없음', SUSPECT: '부정 의심' } as const

type Pos = { top: number; left: number }

/** 버튼 아래(공간이 모자라면 위)에 팝오버를 놓는다. 화면 밖으로 나가지 않게 가로·세로를 맞춘다 */
function place(anchor: DOMRect, height: number): Pos {
  const left = Math.min(Math.max(MARGIN, anchor.right - POPOVER_WIDTH), window.innerWidth - POPOVER_WIDTH - MARGIN)
  const below = anchor.bottom + GAP
  const top = below + height + MARGIN > window.innerHeight ? Math.max(MARGIN, anchor.top - GAP - height) : below
  return { top, left }
}

export function EventDot({
  name,
  events,
  freshIds,
  onOpenAll,
}: {
  name: string
  /** 이 응시자의 감독 이벤트 (시간순이 아니어도 된다) */
  events: ProctorEventView[]
  /** 방금 들어온 이벤트 id */
  freshIds: ReadonlySet<number>
  /** 팝오버의 "전체 기록" 버튼: 판단·사진까지 볼 수 있는 감독 패널 서랍을 연다 */
  onOpenAll: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<Pos | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const count = events.length
  const unreviewed = events.filter((e) => isCameraEvent(e) && !e.review).length
  const hasFresh = events.some((e) => freshIds.has(e.id))
  const list = [...events].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))

  // 열린 동안 위치를 맞추고, 바깥 클릭·Esc·스크롤·크기 변경이면 닫는다
  useLayoutEffect(() => {
    if (!open || !btnRef.current || !popRef.current) return
    setPos(place(btnRef.current.getBoundingClientRect(), popRef.current.offsetHeight))
  }, [open, count])
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onDown = (ev: MouseEvent) => {
      const t = ev.target as Node
      if (!popRef.current?.contains(t) && !btnRef.current?.contains(t)) close()
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        close()
        btnRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  if (count === 0) return <span className="text-text-faint" aria-label="감독 이벤트 없음">—</span>

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(ev) => {
          ev.stopPropagation() // 행을 눌러 서랍이 열리는 것과 따로 동작한다
          setPos(null)
          setOpen((v) => !v)
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${name} 감독 이벤트 ${count}건${unreviewed ? `, 미확인 ${unreviewed}건` : ''} 보기`}
        title="이벤트 기록 보기"
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 hover:bg-panel-raised focus-visible:outline-2 focus-visible:outline-brand"
      >
        <i className={cx('size-2.5 rounded-full bg-alert', hasFresh && 'animate-pulse')} aria-hidden />
        <span className="tnum font-mono text-[12px] font-semibold text-text-muted">{count}</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label={`${name} 감독 이벤트 기록`}
            onClick={(ev) => ev.stopPropagation()}
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, width: POPOVER_WIDTH, visibility: pos ? 'visible' : 'hidden' }}
            className="fixed z-50 flex max-h-[360px] flex-col overflow-hidden rounded-md border border-line bg-panel shadow-modal"
          >
            <header className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-text">{name}</span>
              <span className="tnum font-mono text-[12px] text-text-muted">{count}건</span>
            </header>
            <ol className="min-h-0 flex-1 overflow-auto">
              {list.map((e) => {
                const cam = isCameraEvent(e)
                return (
                  <li key={e.id} className={cx('flex items-start gap-2.5 border-b border-line px-3 py-2 last:border-0', freshIds.has(e.id) && 'bg-brand-dim')}>
                    <i className={cx('mt-1.5 size-2 shrink-0', cam ? 'rounded-full bg-alert' : 'rotate-45 bg-caution')} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-text">{EVENT_LABEL[e.type] ?? e.type}</span>
                      <span className="tnum font-mono text-[12px] text-text-muted">
                        {fmtTime(e.startedAt).slice(11)}
                        {e.confidence != null && ` │ 확신도 ${e.confidence.toFixed(2)}`}
                      </span>
                    </span>
                    {e.review ? (
                      <span className={cx('shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold', e.review === 'SUSPECT' ? 'bg-alert/10 text-alert' : 'bg-signal/10 text-signal')}>{REVIEW_LABEL[e.review]}</span>
                    ) : (
                      cam && <span className="shrink-0 rounded-sm bg-caution/15 px-1.5 py-0.5 text-[11px] font-semibold text-caution">미확인</span>
                    )}
                  </li>
                )
              })}
            </ol>
            <footer className="shrink-0 border-t border-line bg-panel-raised/50 p-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onOpenAll()
                }}
                className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-md text-[13px] font-semibold text-brand hover:bg-brand-dim"
              >
                사진·판단까지 전체 기록 보기 <ChevronRight size={14} aria-hidden />
              </button>
            </footer>
          </div>,
          document.body,
        )}
    </>
  )
}
