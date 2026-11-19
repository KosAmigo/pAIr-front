import { Check, Circle, Loader2, TriangleAlert, X } from 'lucide-react'
import { cx } from '../../components/cx'
import type { CheckItem } from '../check/envChecks.ts'

const STYLE: Record<CheckItem['status'], { icon: typeof Check; box: string; label: string }> = {
  pending: { icon: Circle, box: 'border-line text-text-faint', label: '대기' },
  running: { icon: Loader2, box: 'border-brand/40 text-brand', label: '확인 중' },
  pass: { icon: Check, box: 'border-signal/30 text-signal', label: '통과' },
  warn: { icon: TriangleAlert, box: 'border-caution/40 bg-caution/5 text-caution', label: '주의' },
  fail: { icon: X, box: 'border-alert/40 bg-alert/5 text-alert', label: '실패' },
}

/** 점검 항목 목록. 색만으로 상태를 전하지 않도록 아이콘과 글자를 함께 쓴다 */
export function CheckList({ items }: { items: CheckItem[] }) {
  return (
    <ul className="flex flex-col gap-1.5" aria-live="polite">
      {items.map((i) => {
        const s = STYLE[i.status]
        const Icon = s.icon
        return (
          <li key={i.id} className={cx('flex items-start gap-3 rounded-lg border bg-panel px-3 py-2', s.box)}>
            <Icon size={18} className={cx('mt-0.5 shrink-0', i.status === 'running' && 'animate-spin')} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] leading-5 font-semibold text-text">
                {i.label} <span className="sr-only">({s.label})</span>
              </p>
              {i.detail && <p className="text-[13px] leading-5 break-keep text-text-muted">{i.detail}</p>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
