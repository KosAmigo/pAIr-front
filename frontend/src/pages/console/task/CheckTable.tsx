// 자동 확인 결과 표 (생성 결과와 검수 상세가 같이 쓴다). 통과 ✓, 실패 ✗ + 빨간 줄. 실패를 위로.
import { Check, X } from 'lucide-react'
import { cx } from '../../../components/cx'
import type { GenCheck } from '../../../data/taskGen'

export function CheckTable({ checks }: { checks: GenCheck[] }) {
  const passed = checks.filter((c) => c.ok).length
  const sorted = [...checks].sort((a, b) => Number(a.ok) - Number(b.ok))
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="flex items-center gap-3 border-b border-line bg-panel-raised/60 px-4 py-2.5">
        <span className="text-[14px] font-bold text-text">자동 확인</span>
        <span className={cx('tnum font-mono text-[13px] font-semibold', passed === checks.length ? 'text-signal' : 'text-alert')}>
          {passed} / {checks.length} 통과
        </span>
        {/* 통과 비율 막대 */}
        <span aria-hidden className="ml-auto flex h-1.5 w-32 overflow-hidden rounded-full bg-alert/25">
          <span className="h-full origin-left rounded-full bg-signal" style={{ width: `${checks.length ? (passed / checks.length) * 100 : 0}%` }} />
        </span>
      </div>
      <ul aria-label="자동 확인 결과" className="fx-cards divide-y divide-line">
        {sorted.map((c) => (
          <li key={c.name} className={cx('grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-0.5 px-4 py-3 sm:grid-cols-[auto_minmax(0,14rem)_minmax(0,1fr)]', !c.ok && 'bg-alert/6')}>
            <span
              className={cx('mt-0.5 inline-flex size-5 items-center justify-center rounded-full', c.ok ? 'bg-signal/12 text-signal' : 'bg-alert text-on-accent')}
              role="img"
              aria-label={c.ok ? '통과' : '실패'}
            >
              {c.ok ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />}
            </span>
            <span className={cx('text-[14px] font-semibold break-keep', c.ok ? 'text-text' : 'text-alert')}>{c.name}</span>
            <span className={cx('col-start-2 text-[13px] leading-5 break-words sm:col-start-3', c.ok ? 'text-text-muted' : 'font-medium text-alert')}>{c.detail || '-'}</span>
          </li>
        ))}
        {checks.length === 0 && <li className="px-4 py-5 text-center text-[14px] text-text-muted">확인 결과가 없어요.</li>}
      </ul>
    </div>
  )
}
