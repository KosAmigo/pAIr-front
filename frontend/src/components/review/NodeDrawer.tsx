import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'motion/react'
import { FileBarChart2, Loader2, X } from 'lucide-react'
import { api, ApiError, type Turn } from '../../api'
import { ButtonLink, IconButton } from '../ui'
import { ErrorState } from '../ErrorState'
import { TurnItem } from '../replay/TurnItem'
import type { TreeLane } from '../../lib/reviewTree'
import { shortDate, turnTag } from './shared'

/** 노드 서랍 (DESIGN.md §7-5): 한 갈래의 AI 대화 기록, 리포트 링크 */
export function NodeDrawer({ lane, onClose }: { lane: TreeLane; onClose: () => void }) {
  const reduce = useReducedMotion()
  const [tick, setTick] = useState(0)
  const [state, setState] = useState<{ id: string; turns: Turn[] | null; error: string | null }>({ id: '', turns: null, error: null })
  useEffect(() => {
    let alive = true
    api
      .report(lane.attemptId)
      .then((r) => alive && setState({ id: lane.attemptId, turns: r.report?.transcript ?? [], error: null }))
      .catch((e: ApiError) => alive && setState({ id: lane.attemptId, turns: null, error: e.message }))
    return () => {
      alive = false
    }
  }, [lane.attemptId, tick])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const cur = state.id === lane.attemptId ? state : { id: '', turns: null, error: null }

  // 변형(transform)이 걸린 화면 전환 영역 안에서는 fixed 가 어긋나므로 body 로 꺼내 그린다
  return createPortal(
    <motion.aside
      role="dialog"
      aria-label={`${lane.name} 대화 기록`}
      className="fixed inset-y-0 right-0 z-40 flex w-[440px] max-w-full flex-col border-l border-line bg-panel shadow-lg"
      initial={reduce ? false : { x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
    >
      <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
        <div className="min-w-0">
          <p className="label">BRANCH</p>
          <h2 className="truncate text-[17px] font-bold text-text">{lane.name}</h2>
          <p className="text-[12px] text-text-muted">
            {shortDate(lane.startedAt)}
            {lane.parentLane != null ? ` · ${turnTag(lane.startTurn)}에서 갈라짐` : ' · 원래 응시'}
            {lane.score ? ` · ${lane.score.total}점` : ' · 채점 전'}
          </p>
        </div>
        <ButtonLink to={`/report/${encodeURIComponent(lane.attemptId)}`} variant="secondary" size="sm" className="ml-auto">
          <FileBarChart2 size={15} aria-hidden /> 리포트
        </ButtonLink>
        <IconButton label="닫기" onClick={onClose}>
          <X size={18} aria-hidden />
        </IconButton>
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        <p className="label">TRANSCRIPT</p>
        <h3 className="mb-2 text-[15px] font-semibold text-text">AI 대화 기록</h3>
        {cur.error ? (
          <ErrorState compact message={cur.error} onRetry={() => setTick((t) => t + 1)} />
        ) : !cur.turns ? (
          <p className="flex items-center gap-2 text-[14px] text-text-muted">
            <Loader2 size={16} className="animate-spin" aria-hidden /> 불러오는 중
          </p>
        ) : cur.turns.length === 0 ? (
          <p className="py-6 text-center text-[14px] text-text-muted">{lane.score ? '이 응시에는 AI 대화 기록이 없습니다.' : '채점이 끝나면 대화 기록을 볼 수 있습니다.'}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {cur.turns.map((t) => (
              <TurnItem key={`${t.turn}-${t.role}`} t={t} attemptId={lane.attemptId} />
            ))}
          </ol>
        )}
      </div>
    </motion.aside>,
    document.body,
  )
}
