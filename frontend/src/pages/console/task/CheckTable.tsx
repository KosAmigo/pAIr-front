// 자동 확인 결과 표 (생성 결과와 검수 상세가 같이 쓴다).
// 통과 ✓(초록), 경고 ▲(주의색, 재생성 안 함), 실패 ✗(빨강). 실패 → 경고 → 통과 순으로 위에서부터.
import { Check, TriangleAlert, X } from 'lucide-react'
import { cx } from '../../../components/cx'
import { checkState, countChecks, type CheckState, type GenCheck } from '../../../data/taskGen'

const ORDER: Record<CheckState, number> = { fail: 0, warn: 1, pass: 2 }
const LABEL: Record<CheckState, string> = { pass: '통과', warn: '경고', fail: '실패' }

export function CheckTable({ checks }: { checks: GenCheck[] }) {
  const n = countChecks(checks)
  const sorted = [...checks].sort((a, b) => ORDER[checkState(a)] - ORDER[checkState(b)])
  const tone = n.fail > 0 ? 'text-alert' : n.warn > 0 ? 'text-caution' : 'text-signal'
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="flex items-center gap-3 border-b border-line bg-panel-raised/60 px-4 py-2.5">
        <span className="text-[14px] font-bold text-text">자동 확인</span>
        <span className={cx('tnum text-[13px] font-semibold', tone)}>
          <span className="font-mono">{n.pass} / {checks.length}</span> 통과{n.warn > 0 && <> (경고 <span className="font-mono">{n.warn}</span>개)</>}
        </span>
        {/* 통과 비율 막대: 실패 빨강, 경고 주의색, 통과 초록 */}
        <span aria-hidden className="ml-auto flex h-1.5 w-32 overflow-hidden rounded-full bg-alert/25">
          <span className="h-full bg-signal" style={{ width: `${checks.length ? (n.pass / checks.length) * 100 : 0}%` }} />
          <span className="h-full bg-caution" style={{ width: `${checks.length ? (n.warn / checks.length) * 100 : 0}%` }} />
        </span>
      </div>
      <ul aria-label="자동 확인 결과" className="fx-cards divide-y divide-line">
        {sorted.map((c) => {
          const s = checkState(c)
          return (
            <li
              key={c.name}
              data-state={s}
              className={cx('grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-0.5 px-4 py-3 sm:grid-cols-[auto_minmax(0,14rem)_minmax(0,1fr)]', s === 'fail' && 'bg-alert/6', s === 'warn' && 'bg-caution/8')}
            >
              <span
                className={cx(
                  'mt-0.5 inline-flex size-5 items-center justify-center rounded-full',
                  s === 'pass' && 'bg-signal/12 text-signal',
                  s === 'warn' && 'bg-caution/20 text-caution',
                  s === 'fail' && 'bg-alert text-on-accent',
                )}
                role="img"
                aria-label={LABEL[s]}
              >
                {s === 'pass' && <Check size={13} strokeWidth={3} />}
                {s === 'warn' && <TriangleAlert size={13} strokeWidth={2.5} />}
                {s === 'fail' && <X size={13} strokeWidth={3} />}
              </span>
              <span className={cx('text-[14px] font-bold break-keep', s === 'pass' ? 'text-text' : s === 'warn' ? 'text-caution' : 'text-alert')}>
                {c.name}
                {s === 'warn' && <span className="ml-2 rounded-full bg-caution/15 px-2 py-0.5 text-[12px] font-bold text-caution">경고</span>}
              </span>
              <span className={cx('col-start-2 text-[13px] leading-5 break-words sm:col-start-3', s === 'pass' ? 'text-text-muted' : cx('font-medium', s === 'warn' ? 'text-text' : 'text-alert'))}>{c.detail || '-'}</span>
            </li>
          )
        })}
        {checks.length === 0 && <li className="px-4 py-5 text-center text-[14px] text-text-muted">확인 결과가 없어요.</li>}
      </ul>
    </div>
  )
}
