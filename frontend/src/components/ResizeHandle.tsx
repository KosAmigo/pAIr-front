import { useRef, useState } from 'react'
import { cx } from './cx'

const KEY_STEP = 16

// 패널 경계에 얹는 세로 손잡이. 드래그나 좌우 화살표로 폭을 바꾸고, 두 번 누르면 기본 폭으로 돌아간다.
// edge 는 손잡이가 패널의 어느 쪽에 붙는지다. 왼쪽에 붙으면(오른쪽 패널) 왼쪽으로 끌수록 넓어진다.
export function ResizeHandle({
  label,
  edge,
  value,
  min,
  maxWidth,
  onResize,
  onReset,
}: {
  label: string
  edge: 'left' | 'right'
  value: number
  min: number
  /** 지금 화면에서 가운데 칸을 남기고 넓힐 수 있는 최대 폭 */
  maxWidth: (panel: HTMLElement) => number
  onResize: (width: number) => void
  onReset: () => void
}) {
  // 저장한 폭보다 화면이 좁으면 실제 폭이 더 작으므로, 시작 폭은 화면에서 잰다
  const drag = useRef<{ x: number; width: number; max: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const sign = edge === 'right' ? 1 : -1
  const measure = (handle: HTMLElement) => {
    const panel = handle.parentElement!
    return { width: panel.getBoundingClientRect().width, max: maxWidth(panel) }
  }
  const apply = (width: number, max: number) => onResize(Math.round(Math.max(min, Math.min(width, max))))
  const end = () => {
    drag.current = null
    setDragging(false)
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      tabIndex={0}
      title={`${label} (두 번 누르면 기본 크기)`}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        // 포인터를 잡아 두면 PDF·편집기 위로 지나가도 끌기가 끊기지 않는다
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { x: e.clientX, ...measure(e.currentTarget) }
        setDragging(true)
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (d) apply(d.width + sign * (e.clientX - d.x), d.max)
      }}
      onLostPointerCapture={end}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
        if (!dir) return
        e.preventDefault()
        const m = measure(e.currentTarget)
        apply(m.width + sign * dir * KEY_STEP, m.max)
      }}
      className={cx(
        'absolute inset-y-0 z-20 w-1.5 cursor-col-resize touch-none outline-none select-none',
        'transition-colors duration-[120ms] hover:bg-brand/50 focus-visible:bg-brand/50',
        edge === 'right' ? 'right-0' : 'left-0',
        dragging && 'bg-brand/70',
      )}
    />
  )
}
