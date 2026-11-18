import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { motion } from 'motion/react'

import { cx } from './cx'
import { springs } from '../lib/motion'
import { CountUp } from './fx/CountUp'

// ── 6.1 Button ──────────────────────────────
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'
const variantCls: Record<Variant, string> = {
  // 호버: 그라데이션이 밝아지고 빛이 한 번 쓸고 지나가며 brand glow (DESIGN.md §6.1, §3.4)
  primary:
    'btn-shimmer bg-brand-gradient text-on-accent hover:shadow-[0_0_0_1px_rgb(108_71_255/0.4),0_8px_32px_rgb(108_71_255/0.35)] disabled:bg-none disabled:bg-panel-raised disabled:text-text-faint disabled:shadow-none',
  secondary: 'bg-panel text-text border border-line-strong hover:border-text-muted hover:bg-panel-raised',
  ghost: 'text-text-muted hover:bg-panel-raised hover:text-text',
  danger: 'text-alert border border-alert/40 hover:bg-alert/8',
}
const sizeCls: Record<Size, string> = {
  sm: 'h-7 px-2.5 gap-1.5 text-[14px]',
  md: 'h-9 px-3.5 gap-2 text-[15px]',
  lg: 'h-11 px-5 gap-2 text-[16px]',
}
function buttonCls(variant: Variant = 'secondary', size: Size = 'md', extra?: string) {
  return cx(
    'inline-flex shrink-0 items-center justify-center rounded-md font-semibold whitespace-nowrap',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.97]',
    'disabled:cursor-not-allowed disabled:opacity-40',
    variantCls[variant],
    sizeCls[size],
    extra,
  )
}
export function Button({
  variant,
  size,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={buttonCls(variant, size, className)} {...rest} />
}
export function ButtonLink({
  variant,
  size,
  className,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={buttonCls(variant, size, className)} {...rest} />
}

// Icon-only button: 32×32 hit area + aria-label + tooltip
export function IconButton({
  label,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex size-8 items-center justify-center rounded-md text-text-muted transition-colors duration-[120ms] hover:bg-panel-raised hover:text-text',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

// ── 6.2 Panel ───────────────────────────────
export function Panel({
  label,
  title,
  actions,
  children,
  className,
  bodyClassName,
  flush,
}: {
  label: string
  title?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
  bodyClassName?: string
  flush?: boolean
}) {
  return (
    <section className={cx('flex min-h-0 flex-col rounded-md border border-line bg-panel shadow-sm', className)}>
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-line px-4">
        <span className="label">{label}</span>
        {title && <h2 className="truncate text-[16px] leading-[22px] font-semibold text-text">{title}</h2>}
        {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
      </header>
      <div className={cx('min-h-0 flex-1', !flush && 'p-4', bodyClassName)}>{children}</div>
    </section>
  )
}

// ── 6.3 Tabs ────────────────────────────────
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { value: T; label: ReactNode }[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  // 인디케이터는 탭 사이를 미끄러져 이동한다 (DESIGN.md §6.3, Motion layoutId)
  const indicatorId = useId()
  return (
    <div role="tablist" className={cx('flex h-9 items-stretch gap-4', className)}>
      {tabs.map((t) => {
        const active = t.value === value
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cx(
              'relative inline-flex items-center gap-1.5 text-[15px] font-medium transition-colors duration-[180ms]',
              active ? 'text-text' : 'text-text-muted hover:text-text',
            )}
          >
            {t.label}
            {active && (
              <motion.span layoutId={indicatorId} transition={springs.snappy} className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand-gradient" />
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── 6.6 Score Chip ──────────────────────────
function scoreTone(score: number) {
  if (score >= 80) return 'signal'
  if (score >= 60) return 'info'
  if (score >= 40) return 'caution'
  return 'alert'
}
const chipCls = {
  signal: 'bg-signal/12 text-signal',
  info: 'bg-info/12 text-info',
  caution: 'bg-caution/12 text-caution',
  alert: 'bg-alert/12 text-alert',
}
export function ScoreChip({ score, className }: { score: number; className?: string }) {
  return (
    <span
      className={cx(
        'tnum inline-flex h-[22px] items-center rounded-sm px-1.5 font-mono text-[13px] font-semibold',
        chipCls[scoreTone(score)],
        className,
      )}
    >
      {score}
    </span>
  )
}

// ── 6.5 Metric Tile ─────────────────────────
export function MetricTile({
  label,
  value,
  unit,
  delta,
  deltaText,
  sub,
}: {
  label: string
  value: ReactNode
  unit?: string
  delta?: number
  deltaText?: string
  sub?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-line bg-panel px-4 py-3 shadow-sm">
      <span className="label">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className="tnum font-mono text-[32px] leading-9 font-semibold text-text">
          {typeof value === 'number' ? <CountUp value={value} decimals={Number.isInteger(value) ? 0 : 1} /> : value}
        </span>
        {unit && <span className="text-[14px] text-text-muted">{unit}</span>}
      </div>
      {delta !== undefined ? <Delta value={delta} text={deltaText} /> : sub && <div className="text-[14px] text-text-muted">{sub}</div>}
    </div>
  )
}

export function Delta({ value, text }: { value: number; text?: string }) {
  const up = value >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className="inline-flex items-center gap-1 text-[14px]">
      <span className={cx('tnum inline-flex items-center gap-0.5 font-mono font-semibold', up ? 'text-signal' : 'text-alert')}>
        <Icon size={16} strokeWidth={2} aria-hidden />
        {up ? '+' : ''}
        {value}
      </span>
      {text && <span className="text-text-muted">{text}</span>}
    </span>
  )
}

// ── 상태 점 + 텍스트 (색만으로 전달하지 않음) ──
export type Status = 'ok' | 'check' | 'down'
const statusMap: Record<Status, { dot: string; text: string; label: string }> = {
  ok: { dot: 'bg-signal', text: 'text-signal', label: '정상' },
  check: { dot: 'bg-caution', text: 'text-caution', label: '확인 필요' },
  down: { dot: 'bg-alert', text: 'text-alert', label: '끊김' },
}
export function StatusDot({ status, label }: { status: Status; label?: string }) {
  const s = statusMap[status]
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-[14px] font-medium', s.text)}>
      <span className={cx('size-1.5 rounded-full', s.dot)} aria-hidden />
      {label ?? s.label}
    </span>
  )
}

export function ModeBadge({ mode }: { mode: 'self' | 'live' }) {
  return mode === 'live' ? (
    <span className="inline-flex h-[22px] items-center rounded-sm bg-alert/12 px-1.5 font-mono text-[12px] font-semibold tracking-[0.08em] text-alert">
      LIVE EXAM
    </span>
  ) : (
    <span className="inline-flex h-[22px] items-center rounded-sm bg-info/12 px-1.5 font-mono text-[12px] font-semibold tracking-[0.08em] text-info">
      SELF-CHECK
    </span>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cx('inline-flex items-center gap-2 font-mono text-[16px] font-semibold text-text', className)} aria-label="pAIr 처음으로">
      <svg width="18" height="18" viewBox="0 0 32 32" aria-hidden>
        <path d="M10 7v18M10 13l9 6v6" stroke="var(--color-brand)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="10" cy="7" r="3" fill="var(--color-brand)" />
        <circle cx="19" cy="25" r="3" fill="var(--color-branch-2)" />
      </svg>
      <span>
        p<span className="text-brand-gradient">AI</span>r
      </span>
    </Link>
  )
}

// 메타 정보 구분선. 가운데 점(·) 대신 사용한다 (DESIGN.md §2.4)
export function Sep() {
  return <span className="inline-block h-3 w-px shrink-0 self-center bg-line-strong" aria-hidden />
}
