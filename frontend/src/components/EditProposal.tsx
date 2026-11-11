import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, FilePlus2, FileCode2, Maximize2, X } from 'lucide-react'
import type { EditProposal } from '../api'
import { diffStat, lineDiff, type DiffLine } from '../lib/edits'
import { Button, cx, IconButton } from './ui'

// AI 수정 제안: 채팅 안의 카드와, 넓게 보는 코드 보기 팝업. DESIGN.md §6.15

export type EditAction = 'apply' | 'reject'

function hunkDiffs(e: EditProposal) {
  return e.hunks.map((h) => lineDiff(h.search, h.replace))
}

const statusText: Record<EditProposal['status'], string> = { PENDING: '', APPLIED: '적용함', REJECTED: '거절함' }

export function EditCard({
  edit,
  busy,
  disabled,
  onAction,
  onView,
}: {
  edit: EditProposal
  busy: boolean
  disabled: boolean
  onAction: (a: EditAction) => void
  onView: () => void
}) {
  const stat = useMemo(() => {
    const s = hunkDiffs(edit).map(diffStat)
    return { add: s.reduce((x, y) => x + y.add, 0), del: s.reduce((x, y) => x + y.del, 0) }
  }, [edit])
  const pending = edit.status === 'PENDING'
  const Icon = edit.newFile ? FilePlus2 : FileCode2
  return (
    <div className={cx('rounded-md border bg-bg', pending ? 'border-line-strong' : 'border-line')}>
      <button
        type="button"
        onClick={onView}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-panel-raised"
        title="코드 보기"
      >
        <Icon size={16} className="shrink-0 text-info" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-text">{edit.path}</span>
        <span className="tnum shrink-0 font-mono text-[12px]">
          <span className="text-signal">+{stat.add}</span> <span className="text-alert">-{stat.del}</span>
        </span>
        <Maximize2 size={14} className="shrink-0 text-text-faint" aria-hidden />
      </button>
      <div className="flex items-center gap-2 border-t border-line px-3 py-2">
        {pending ? (
          <>
            {!edit.applicable && <span className="text-[12px] leading-5 text-caution">지금 파일에서 바꿀 부분을 찾지 못함</span>}
            <span className="ml-auto flex gap-1.5">
              <Button size="sm" variant="ghost" disabled={busy || disabled} onClick={() => onAction('reject')}>
                거절
              </Button>
              <Button size="sm" variant="primary" disabled={busy || disabled || !edit.applicable} onClick={() => onAction('apply')}>
                <Check size={14} aria-hidden /> 적용
              </Button>
            </span>
          </>
        ) : (
          <>
            <span className={cx('text-[13px]', edit.status === 'APPLIED' ? 'text-signal' : 'text-text-faint')}>
              {statusText[edit.status]}
            </span>
            {edit.status === 'REJECTED' && edit.applicable && !disabled && (
              <Button size="sm" variant="ghost" className="ml-auto" disabled={busy} onClick={() => onAction('apply')}>
                다시 적용
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function DiffBlock({ lines }: { lines: DiffLine[] }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-line bg-bg py-2 font-mono text-[13px] leading-6">
      {lines.map((l, i) => (
        <div
          key={i}
          className={cx(
            'min-w-max px-3 whitespace-pre',
            l.kind === 'add' && 'bg-signal/10 text-text',
            l.kind === 'del' && 'bg-alert/10 text-text-muted line-through decoration-alert/40',
            l.kind === 'same' && 'text-text-muted',
          )}
        >
          <span className={cx('mr-3 inline-block w-3 select-none', l.kind === 'add' ? 'text-signal' : l.kind === 'del' ? 'text-alert' : 'text-text-faint')}>
            {l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' '}
          </span>
          {l.text || ' '}
        </div>
      ))}
    </pre>
  )
}

export function EditModal({
  edit,
  turn,
  busy,
  disabled,
  onAction,
  onClose,
}: {
  edit: EditProposal
  turn: number
  busy: boolean
  disabled: boolean
  onAction: (a: EditAction) => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<'diff' | 'new'>('diff')
  const [copied, setCopied] = useState(false)
  const diffs = useMemo(() => hunkDiffs(edit), [edit])
  const newCode = edit.hunks.map((h) => h.replace).join('\n\n// ...\n\n')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(newCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* 클립보드 권한이 없으면 무시 */
    }
  }
  const pending = edit.status === 'PENDING'
  return (
    <div
      className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-bg/70 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-title"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex h-[min(820px,88vh)] w-[min(1200px,94vw)] flex-col rounded-lg border border-line bg-panel shadow-modal">
        <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line px-4">
          <span className="label">AI EDIT</span>
          <span className="font-mono text-[12px] text-text-faint">#T{String(turn).padStart(2, '0')}</span>
          <h2 id="edit-title" className="min-w-0 truncate font-mono text-[14px] text-text">
            {edit.path}
            {edit.newFile && <span className="ml-2 font-sans text-[12px] text-info">새 파일</span>}
          </h2>
          <div className="ml-auto flex rounded-md border border-line p-0.5" role="tablist">
            {(['diff', 'new'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cx('rounded px-2.5 py-1 text-[13px]', mode === m ? 'bg-panel-raised text-text' : 'text-text-muted hover:text-text')}
              >
                {m === 'diff' ? '바뀌는 부분' : '새 코드만'}
              </button>
            ))}
          </div>
          <IconButton label="닫기 (Esc)" onClick={onClose}>
            <X size={18} aria-hidden />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
          {mode === 'diff' ? (
            diffs.map((d, i) => (
              <section key={i}>
                {diffs.length > 1 && <h3 className="label mb-1.5">변경 {i + 1}</h3>}
                <DiffBlock lines={d} />
              </section>
            ))
          ) : (
            <pre className="overflow-x-auto rounded-md border border-line bg-bg p-3 font-mono text-[13px] leading-6 whitespace-pre text-text">{newCode}</pre>
          )}
        </div>
        <footer className="flex shrink-0 items-center gap-2 border-t border-line px-4 py-3">
          {pending && !edit.applicable && (
            <span className="text-[13px] text-caution">지금 파일에서 바꿀 부분을 찾지 못해 적용할 수 없습니다. 새 코드를 복사해 직접 고칠 수 있습니다.</span>
          )}
          {!pending && <span className={cx('text-[13px]', edit.status === 'APPLIED' ? 'text-signal' : 'text-text-faint')}>{statusText[edit.status]}</span>}
          <span className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={() => void copy()}>
              {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />} {copied ? '복사함' : '새 코드 복사'}
            </Button>
            {pending && (
              <Button variant="secondary" disabled={busy || disabled} onClick={() => onAction('reject')}>
                거절
              </Button>
            )}
            {(pending || edit.status === 'REJECTED') && (
              <Button variant="primary" disabled={busy || disabled || !edit.applicable} onClick={() => onAction('apply')}>
                <Check size={16} aria-hidden /> {pending ? '적용' : '다시 적용'}
              </Button>
            )}
          </span>
        </footer>
      </div>
    </div>
  )
}
