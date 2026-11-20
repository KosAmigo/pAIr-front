import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { History, Loader2, Pencil, RotateCcw } from 'lucide-react'
import { api, ApiError, type Checkpoint } from '../../api'
import { useCredits } from '../../data/credits'
import { Button } from '../ui'
import { ErrorState } from '../ErrorState'
import { shortTime, turnLabel } from './format'

/** 이름 입력: Enter 로 저장, Esc 로 취소. 비우면 이름이 지워진다 */
function LabelEditor({ initial, onSave, onCancel, busy }: { initial: string; onSave: (v: string) => void; onCancel: () => void; busy: boolean }) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])
  return (
    <input
      ref={ref}
      value={value}
      maxLength={100}
      disabled={busy}
      aria-label="체크포인트 이름"
      placeholder="이름 (비우면 지워집니다)"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSave(value)
        if (e.key === 'Escape') onCancel()
      }}
      onBlur={() => onCancel()}
      className="h-8 w-full rounded-md border border-stage-line-strong bg-stage-panel px-2 text-[14px] text-stage-text"
    />
  )
}

/**
 * 현재 응시의 체크포인트 목록 (질문마다 하나). 여기서 이름을 붙이고, 그 시점으로 돌아가 새로 풀 수 있다.
 * 다시 풀기 = 원래 풀이는 그대로 두고 그 질문 시점에서 갈라진 새 응시를 만든다 (크레딧 차감, 부족하면 안내).
 */
export function CheckpointPanel({ attemptId }: { attemptId: string }) {
  const navigate = useNavigate()
  const { refresh: refreshCredits } = useCredits()
  const [items, setItems] = useState<Checkpoint[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [editing, setEditing] = useState<number | null>(null)
  const [confirming, setConfirming] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api
      .checkpoints(attemptId)
      .then((d) => alive && (setItems(d), setLoadError(null)))
      .catch((e: ApiError) => alive && setLoadError(e.message))
    return () => {
      alive = false
    }
  }, [attemptId, tick])

  const rename = async (c: Checkpoint, label: string) => {
    setBusy(true)
    setActionError(null)
    try {
      const saved = await api.renameCheckpoint(c.checkpointId, label)
      setItems((list) => list?.map((x) => (x.checkpointId === saved.checkpointId ? saved : x)) ?? null)
      setEditing(null)
    } catch (e) {
      setActionError((e as ApiError).message)
    } finally {
      setBusy(false)
    }
  }

  const rollback = async (c: Checkpoint) => {
    setBusy(true)
    setActionError(null)
    try {
      const { attemptId: next } = await api.rollback(c.checkpointId)
      void refreshCredits()
      navigate(`/exam/${encodeURIComponent(next)}`)
    } catch (e) {
      setActionError((e as ApiError).message)
      setBusy(false)
    }
  }

  if (loadError) return <ErrorState compact message={loadError} onRetry={() => setTick((t) => t + 1)} />
  if (!items)
    return (
      <p className="flex items-center gap-2 text-[14px] text-stage-muted">
        <Loader2 size={16} className="animate-spin" aria-hidden /> 체크포인트를 불러오는 중
      </p>
    )
  if (items.length === 0)
    return <p className="text-[14px] text-stage-muted">이 풀이에는 체크포인트가 없습니다. AI에게 질문을 보내면 질문마다 하나씩 만들어집니다.</p>

  return (
    <div>
      {actionError && (
        <p role="alert" className="mb-2 rounded-md border border-alert/30 bg-alert/8 px-3 py-2 text-[14px] text-text">{actionError}</p>
      )}
      <ul className="flex flex-col gap-1">
        {items.map((c) => (
          <li key={c.checkpointId} className="rounded-lg border border-stage-line bg-stage-panel px-3 py-2">
            <div className="flex items-center gap-2">
              <History size={14} className="shrink-0 text-stage-muted" aria-hidden />
              <span className="font-mono text-[13px] text-stage-text">{turnLabel(c.turnNo)}</span>
              <span className="font-mono text-[12px] text-stage-muted">{shortTime(c.createdAt)}</span>
              <div className="ml-auto flex items-center gap-1">
                <Button size="sm" variant="ghost" aria-label={`${turnLabel(c.turnNo)} 이름 바꾸기`} title="이름 바꾸기" disabled={busy}
                  onClick={() => (setEditing(c.checkpointId), setConfirming(null))}>
                  <Pencil size={14} aria-hidden />
                </Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => (setConfirming(c.checkpointId), setEditing(null), setActionError(null))}>
                  <RotateCcw size={14} aria-hidden /> 여기서 다시 풀기
                </Button>
              </div>
            </div>
            <div className="mt-1 pl-6">
              {editing === c.checkpointId ? (
                <LabelEditor initial={c.label ?? ''} busy={busy} onSave={(v) => void rename(c, v)} onCancel={() => setEditing(null)} />
              ) : (
                <p className="truncate text-[14px] text-stage-text">{c.label ?? <span className="text-stage-muted">이름 없음</span>}</p>
              )}
            </div>
            {confirming === c.checkpointId && (
              <div className="mt-2 rounded-md bg-stage-raised px-3 py-2 pl-6 text-[14px] text-stage-text" role="group" aria-label="다시 풀기 확인">
                <p>
                  {turnLabel(c.turnNo)} 질문을 보낸 순간의 코드와 그 앞 대화로 새 풀이를 시작합니다. 지금 풀이는 그대로 남고, <b>크레딧이 차감됩니다.</b>
                </p>
                <div className="mt-2 flex justify-end gap-2">
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(null)}>취소</Button>
                  <Button size="sm" variant="primary" disabled={busy} onClick={() => void rollback(c)}>
                    {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RotateCcw size={14} aria-hidden />} 다시 풀기
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
