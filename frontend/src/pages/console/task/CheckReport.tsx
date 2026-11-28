// 자동 확인 결과 (검수 상세 '자동 확인 결과' 탭): 맨 위 한 줄 요약 + 실패·경고·통과 묶음 (처음엔 모두 접힘).
// 실패·경고만 색을 크게 쓰고 통과는 조용하게. 접힌 묶음 머리에서도 실패·경고 항목 이름은 보인다.
import { useState, type ReactNode } from 'react'
import { Check, ChevronDown, Clock, Coins, Repeat, TriangleAlert, X, type LucideIcon } from 'lucide-react'
import { cx } from '../../../components/cx'
import { checkState, type CheckState, type GenCheck, type GenReport } from '../../../data/taskGen'
import { Collapse } from './Collapse'

const LABEL: Record<CheckState, string> = { fail: '실패', warn: '경고', pass: '통과' }
const GROUPS: CheckState[] = ['fail', 'warn', 'pass']
const DOT: Record<CheckState, string> = { fail: 'bg-alert', warn: 'bg-caution', pass: 'bg-signal' }
const fmtNum = (n: number | undefined) => (n == null ? '-' : n.toLocaleString('ko-KR'))

function Mark({ s, size }: { s: CheckState; size: number }) {
  const cls = s === 'pass' ? 'bg-signal/12 text-signal' : s === 'warn' ? 'bg-caution/20 text-caution' : 'bg-alert text-on-accent'
  const icon = Math.round(size * 0.62)
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center rounded-full', cls)} style={{ width: size, height: size }} role="img" aria-label={LABEL[s]}>
      {s === 'pass' && <Check size={icon} strokeWidth={3} />}
      {s === 'warn' && <TriangleAlert size={icon} strokeWidth={2.5} />}
      {s === 'fail' && <X size={icon} strokeWidth={3} />}
    </span>
  )
}

function Meta({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-text-muted">
      <Icon size={14} aria-hidden className="text-text-faint" />
      {children}
    </span>
  )
}

export function CheckReport({ r }: { r: GenReport }) {
  const checks = r.checks ?? []
  const by: Record<CheckState, GenCheck[]> = { fail: [], warn: [], pass: [] }
  for (const c of checks) by[checkState(c)].push(c)
  const [open, setOpen] = useState<Record<CheckState, boolean>>({ fail: false, warn: false, pass: false })
  const mood = by.fail.length > 0 ? 'from-alert/12' : by.warn.length > 0 ? 'from-caution/12' : 'from-signal/12'

  return (
    <div data-testid="check-report" className="flex flex-col gap-3">
      <div className={cx('flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-line bg-gradient-to-r to-panel px-5 py-4 shadow-sm', mood)}>
        <ul aria-label="검사 요약" className="flex items-center gap-2">
          {GROUPS.map((s) => {
            const n = by[s].length
            const tone = n === 0 ? 'border-line text-text-faint' : s === 'fail' ? 'border-alert/40 bg-alert/10 text-alert' : s === 'warn' ? 'border-caution/40 bg-caution/12 text-caution' : 'border-signal/40 bg-signal/10 text-signal'
            return (
              <li key={s} data-testid={`sum-${s}`} className={cx('inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[14px] font-bold', tone)}>
                <span aria-hidden className={cx('size-2 rounded-full', n === 0 ? 'bg-line-strong' : DOT[s])} />
                {LABEL[s]} <span className="tnum font-mono">{n}</span>
              </li>
            )
          })}
        </ul>
        <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
          <Meta icon={Repeat}>
            시도 <span className="tnum font-mono">{r.attempts ?? 0}</span>번
          </Meta>
          <Meta icon={Clock}>
            <span className="tnum font-mono">{r.seconds ?? 0}</span>초
          </Meta>
          <Meta icon={Coins}>
            <span className="tnum font-mono">
              {fmtNum(r.inputTokens)} / {fmtNum(r.outputTokens)}
            </span>
          </Meta>
        </span>
      </div>

      {checks.length === 0 && <p className="rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center text-[14px] text-text-muted">확인 결과가 없어요.</p>}

      {GROUPS.filter((s) => by[s].length > 0).map((s) => {
        const quiet = s === 'pass'
        return (
          <section key={s} data-testid={`group-${s}`} className={cx('overflow-hidden rounded-2xl border bg-panel shadow-sm', s === 'fail' ? 'border-alert/40' : s === 'warn' ? 'border-caution/40' : 'border-line')}>
            <button
              type="button"
              aria-expanded={open[s]}
              onClick={() => setOpen((o) => ({ ...o, [s]: !o[s] }))}
              className={cx('flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors', s === 'fail' ? 'bg-alert/6 hover:bg-alert/10' : s === 'warn' ? 'bg-caution/8 hover:bg-caution/12' : 'hover:bg-panel-raised')}
            >
              <Mark s={s} size={quiet ? 20 : 24} />
              <span className={cx('shrink-0 text-[15px] font-bold', s === 'fail' ? 'text-alert' : s === 'warn' ? 'text-caution' : 'text-text-muted')}>
                {LABEL[s]} <span className="tnum font-mono">{by[s].length}</span>개
              </span>
              {!quiet && !open[s] && <span className="min-w-0 flex-1 truncate text-[13px] text-text-muted">{by[s].map((c) => c.name).join(', ')}</span>}
              <ChevronDown size={18} aria-hidden className={cx('ml-auto shrink-0 text-text-faint transition-transform duration-300 motion-reduce:transition-none', open[s] && 'rotate-180')} />
            </button>
            <Collapse open={open[s]}>
              <ul aria-label={`${LABEL[s]} 항목`} className="divide-y divide-line border-t border-line">
                {by[s].map((c) => (
                  <li key={c.name} data-state={s} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-0.5 px-4 py-3 sm:grid-cols-[auto_minmax(0,14rem)_minmax(0,1fr)]">
                    <span aria-hidden className={cx('mt-[7px] size-2 rounded-full', DOT[s])} />
                    <span className={cx('text-[14px] break-keep', quiet ? 'font-semibold text-text-muted' : s === 'warn' ? 'font-bold text-caution' : 'font-bold text-alert')}>{c.name}</span>
                    <span className={cx('col-start-2 text-[13px] leading-5 break-words sm:col-start-3', quiet ? 'text-text-faint' : 'font-medium text-text')}>{c.detail || '-'}</span>
                  </li>
                ))}
              </ul>
            </Collapse>
          </section>
        )
      })}
    </div>
  )
}
