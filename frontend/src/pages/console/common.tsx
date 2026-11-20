// 콘솔 화면들이 같이 쓰는 작은 조각: 행 메뉴, 확인 모달, 토스트, 상태 배지
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal } from 'lucide-react'
import { cx } from '../../components/cx'
import { Button } from '../../components/ui'
import type { ConsoleTaskSummary } from '../../consoleApi'
import { isClosed, TAB_LABEL, tabOf } from '../../data/taskBoard'

/** 메뉴 한 줄의 대략적인 높이(px). 아래 공간이 모자랄 때 위로 열지 정하는 데만 쓴다 */
const MENU_ITEM_HEIGHT = 40
const MENU_GAP = 4

type MenuPos = { right: number; top?: number; bottom?: number }

export function RowMenu({ label, items }: { label: string; items: { text: string; onClick: () => void; danger?: boolean; disabled?: boolean }[] }) {
  const [pos, setPos] = useState<MenuPos | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const open = pos !== null

  useEffect(() => {
    if (!open) return
    const close = () => setPos(null)
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) close()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    // 메뉴는 화면 기준(fixed)으로 띄우므로, 스크롤·크기 변경 때는 위치가 어긋나기 전에 닫는다
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  const toggle = () => {
    if (open) return setPos(null)
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const right = window.innerWidth - rect.right
    const needed = items.length * MENU_ITEM_HEIGHT + 8
    // 아래 공간이 모자라면 위로 연다. 표가 컨테이너에 잘려도 body 로 띄워서 보인다
    const opensUp = rect.bottom + MENU_GAP + needed > window.innerHeight && rect.top > needed
    setPos(opensUp ? { right, bottom: window.innerHeight - rect.top + MENU_GAP } : { right, top: rect.bottom + MENU_GAP })
  }

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className="inline-flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-panel-raised hover:text-text"
      >
        <MoreHorizontal size={18} aria-hidden />
      </button>
      {pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: 'fixed', right: pos.right, top: pos.top, bottom: pos.bottom }}
            className="fade-in z-50 min-w-40 rounded-md border border-line bg-panel p-1 shadow-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {items.map((it) => (
              <button
                key={it.text}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setPos(null)
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
          </div>,
          document.body,
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
  draft: { cls: 'bg-caution/10 text-caution', dot: 'bg-caution' },
  public: { cls: 'bg-brand-dim text-brand', dot: 'bg-brand' },
  private: { cls: 'bg-text/8 text-text', dot: 'bg-text' },
}
// 스포트라이트(ConsoleHero) 위에서 쓰는 상태 배지 색
const STATUS_STAGE = {
  draft: { cls: 'bg-stage-caution/15 text-stage-caution', dot: 'bg-stage-caution' },
  public: { cls: 'bg-stage-brand/12 text-stage-brand', dot: 'bg-stage-brand' },
  private: { cls: 'bg-stage-text/8 text-stage-text', dot: 'bg-stage-text' },
}
/** 과제 상태 배지: 검수 전 / 공개 문제 / 비공개 문제 (+ 내림). 영어 상태 이름은 보이지 않는다 */
export function TaskStatusBadge({ task, stage }: { task: Pick<ConsoleTaskSummary, 'status' | 'usage'>; stage?: boolean }) {
  const tab = tabOf(task)
  const s = (stage ? STATUS_STAGE : STATUS)[tab]
  return (
    <span className={cx('inline-flex h-[22px] items-center gap-1.5 rounded-sm px-2 text-[13px] font-semibold', s.cls)}>
      <span className={cx('size-1.5 rounded-full', s.dot)} aria-hidden />
      {TAB_LABEL[tab]}
      {isClosed(task) && <span className="font-medium opacity-80">(내림)</span>}
    </span>
  )
}
