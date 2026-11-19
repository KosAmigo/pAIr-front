// 콘솔 화면들이 같이 쓰는 작은 조각: 행 메뉴, 확인 모달, 토스트, 상태 배지
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { cx } from '../../components/cx'
import { Button } from '../../components/ui'
import type { TaskPublicationStatus } from '../../consoleApi'
import { tabOf } from '../../data/consoleTasks'

export function RowMenu({ label, items }: { label: string; items: { text: string; onClick: () => void; danger?: boolean; disabled?: boolean }[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-panel-raised hover:text-text"
      >
        <MoreHorizontal size={18} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="fade-in absolute top-9 right-0 z-30 min-w-40 rounded-md border border-line bg-panel p-1 shadow-modal">
          {items.map((it) => (
            <button
              key={it.text}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false)
                it.onClick()
              }}
              className={cx(
                'flex w-full rounded-sm px-3 py-2 text-left text-[14px] hover:bg-panel-raised disabled:cursor-not-allowed disabled:opacity-40',
                it.danger ? 'text-alert' : 'text-text',
              )}
            >
              {it.text}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Modal({ title, children, onClose, actions }: { title: string; children: ReactNode; onClose: () => void; actions: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-text/30 p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] rounded-lg border border-line bg-panel shadow-modal"
      >
        <h2 id="modal-title" className="px-6 pt-6 text-h2 font-semibold text-text">
          {title}
        </h2>
        <div className="px-6 pt-3 pb-6 text-[15px] leading-6 text-text-muted">{children}</div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">{actions}</div>
      </div>
    </div>
  )
}

export function ConfirmModal({
  title,
  body,
  confirm,
  danger,
  disabled,
  onConfirm,
  onClose,
}: {
  title: string
  body: ReactNode
  confirm: string
  danger?: boolean
  disabled?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} disabled={disabled} onClick={onConfirm}>
            {confirm}
          </Button>
        </>
      }
    >
      {body}
    </Modal>
  )
}

const STATUS = {
  draft: { text: '검수 대기', cls: 'bg-caution/10 text-caution', dot: 'bg-caution' },
  open: { text: '공개', cls: 'bg-signal/10 text-signal', dot: 'bg-signal' },
}
// 다크 무대(ConsoleHero) 위에서 쓰는 상태 배지 색
const STATUS_STAGE: Record<string, { cls: string; dot: string }> = {
  draft: { cls: 'bg-stage-caution/15 text-stage-caution', dot: 'bg-stage-caution' },
  open: { cls: 'bg-stage-signal/15 text-stage-signal', dot: 'bg-stage-signal' },
}
export function TaskStatusBadge({ status, stage }: { status: TaskPublicationStatus; stage?: boolean }) {
  const tab = tabOf(status)
  const s = stage ? { ...STATUS[tab], ...STATUS_STAGE[tab] } : STATUS[tab]
  return (
    <span className={cx('inline-flex h-[22px] items-center gap-1.5 rounded-sm px-2 text-[13px] font-semibold', s.cls)}>
      <span className={cx('size-1.5 rounded-full', s.dot)} aria-hidden />
      {s.text}
    </span>
  )
}

