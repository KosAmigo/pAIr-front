// 디자인에 맞춘 드롭다운. 브라우저 기본 <select> 는 열린 목록을 CSS 로 꾸밀 수 없어서 따로 만들었다.
// 목록은 body 로 띄워(fixed) 표·카드의 overflow 에 잘리지 않고, 아래 공간이 모자라면 위로 열린다.
// 키보드: ↑↓ 이동, Enter·Space 선택, Esc 닫기, Home·End 처음·끝.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { cx } from './cx'

export interface SelectOption<T extends string | number> {
  value: T
  label: string
}

interface SelectProps<T extends string | number> {
  value: T
  options: readonly SelectOption<T>[]
  onChange: (value: T) => void
  /** 화면에 보이는 이름표가 없을 때 스크린 리더용 이름 */
  ariaLabel?: string
  size?: 'sm' | 'md'
  className?: string
}

/** 목록 한 줄의 대략적인 높이(px). 위로 열지 정하는 데만 쓴다 */
const OPTION_HEIGHT = 36
const LIST_GAP = 4
const LIST_MAX_HEIGHT = 288

interface ListPos {
  left: number
  minWidth: number
  top?: number
  bottom?: number
  maxHeight: number
}

export function Select<T extends string | number>({ value, options, onChange, ariaLabel, size = 'md', className }: SelectProps<T>) {
  const [pos, setPos] = useState<ListPos | null>(null)
  const [active, setActive] = useState(0)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()
  const open = pos !== null
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value))
  const selected = options[selectedIndex]

  useEffect(() => {
    if (!open) return
    const close = () => setPos(null)
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (!buttonRef.current?.contains(target) && !listRef.current?.contains(target)) close()
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', close)
    // 목록 안에서 스크롤하는 것은 무시하고, 바깥이 스크롤되면 위치가 어긋나기 전에 닫는다
    const onScroll = (e: Event) => !listRef.current?.contains(e.target as Node) && close()
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  // 열리면 선택된 항목이 보이게 하고, 키보드 포커스를 목록으로 옮긴다
  useEffect(() => {
    if (!open) return
    listRef.current?.focus()
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const openList = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const needed = Math.min(LIST_MAX_HEIGHT, options.length * OPTION_HEIGHT + 8)
    const below = window.innerHeight - rect.bottom - LIST_GAP - 8
    const above = rect.top - LIST_GAP - 8
    const opensUp = below < needed && above > below
    setActive(selectedIndex)
    setPos({
      left: rect.left,
      minWidth: rect.width,
      maxHeight: Math.min(LIST_MAX_HEIGHT, opensUp ? above : below),
      ...(opensUp ? { bottom: window.innerHeight - rect.top + LIST_GAP } : { top: rect.bottom + LIST_GAP }),
    })
  }

  const close = (refocus = true) => {
    setPos(null)
    if (refocus) buttonRef.current?.focus()
  }

  const choose = (index: number) => {
    const opt = options[index]
    if (opt) onChange(opt.value)
    close()
  }

  const onButtonKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) openList()
    }
  }

  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const last = options.length - 1
    if (e.key === 'Escape') return close()
    if (e.key === 'Tab') return close(false)
    const next =
      e.key === 'ArrowDown' ? Math.min(last, active + 1)
      : e.key === 'ArrowUp' ? Math.max(0, active - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null
    if (next !== null) {
      e.preventDefault()
      setActive(next)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      choose(active)
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onButtonKey}
        className={cx(
          'inline-flex items-center justify-between gap-2 rounded-md border bg-panel text-text outline-none transition-colors',
          'hover:border-brand/60 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25',
          open ? 'border-brand ring-2 ring-brand/25' : 'border-line-strong',
          size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3 text-[14px]',
          className,
        )}
      >
        <span className="truncate">{selected?.label}</span>
        <ChevronDown size={size === 'sm' ? 14 : 16} aria-hidden className={cx('shrink-0 text-text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {pos &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-label={ariaLabel}
            aria-activedescendant={`${listId}-${active}`}
            onKeyDown={onListKey}
            style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: pos.minWidth, maxHeight: pos.maxHeight }}
            className="fade-in z-50 overflow-auto rounded-md border border-line bg-panel p-1 shadow-modal outline-none"
          >
            {options.map((o, i) => {
              const isSelected = o.value === value
              return (
                <li
                  key={String(o.value)}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  data-active={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                  className={cx(
                    'flex cursor-pointer items-center justify-between gap-3 rounded-sm px-3 py-2 text-[14px]',
                    i === active ? 'bg-brand/10 text-text' : 'text-text',
                    isSelected && 'font-semibold text-brand',
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {isSelected && <Check size={14} aria-hidden className="shrink-0" />}
                </li>
              )
            })}
          </ul>,
          document.body,
        )}
    </>
  )
}
