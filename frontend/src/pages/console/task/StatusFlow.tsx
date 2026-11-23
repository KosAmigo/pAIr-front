// 과제 상태 흐름: 검수 전 → 자가진단 또는 실전. 지금 있는 칸을 강조하고,
// 가는 길(용도)은 실선, 다른 길은 점선으로 그린다. 복기 트리처럼 한 줄기에서 두 갈래로 갈라지는 모양.
import { Check, FileClock, Globe2, Lock, type LucideIcon } from 'lucide-react'
import { cx } from '../../../components/cx'
import type { TaskUsage } from '../../../consoleApi'
import type { TaskTab } from '../../../data/taskBoard'

function Node({ icon: Icon, label, sub, state, tone }: { icon: LucideIcon; label: string; sub: string; state: 'now' | 'done' | 'next' | 'off'; tone: 'caution' | 'brand' | 'text' }) {
  const color = { caution: 'text-stage-caution bg-stage-caution/12', brand: 'text-stage-brand bg-stage-brand/12', text: 'text-stage-text bg-stage-text/8' }[tone]
  const ring = { caution: 'ring-stage-caution/50', brand: 'ring-stage-brand/50', text: 'ring-stage-text/40' }[tone]
  return (
    <div
      className={cx(
        'flex items-center gap-2.5 rounded-xl border px-3 py-2 transition-opacity',
        state === 'now' ? cx('border-transparent bg-stage-panel shadow-md ring-2', ring) : 'border-stage-line bg-stage-panel/70',
        state === 'off' && 'opacity-45',
      )}
      aria-current={state === 'now' ? 'step' : undefined}
    >
      <span className={cx('relative inline-flex size-8 items-center justify-center rounded-lg', color)} aria-hidden>
        {state === 'done' ? <Check size={16} strokeWidth={3} /> : <Icon size={16} />}
        {state === 'now' && <span className="rec-pulse absolute -top-0.5 -right-0.5 size-2 rounded-full bg-current" />}
      </span>
      <span className="leading-tight">
        <span className="block text-[14px] font-bold text-stage-text">{label}</span>
        <span className="block text-[12px] text-stage-muted">{state === 'now' ? '지금 여기' : sub}</span>
      </span>
    </div>
  )
}

export function StatusFlow({ tab, usage }: { tab: TaskTab; usage: TaskUsage }) {
  const draft = tab === 'draft'
  const pub = (u: TaskUsage) => (draft ? (usage === u ? 'next' : 'off') : usage === u ? 'now' : 'off')
  return (
    <div className="flex items-center gap-0" aria-label="과제 상태 흐름">
      <Node icon={FileClock} label="검수 전" sub="숨김" state={draft ? 'now' : 'done'} tone="caution" />
      <svg width="44" height="76" viewBox="0 0 44 76" aria-hidden className="shrink-0 overflow-visible">
        <path d="M0 38 H10 C22 38 22 16 34 16 H44" fill="none" strokeWidth="2" strokeLinecap="round" className={usage === 'SELF' ? 'stroke-stage-brand' : 'stroke-stage-line-strong'} strokeDasharray={usage === 'SELF' ? undefined : '3 4'} />
        <path d="M0 38 H10 C22 38 22 60 34 60 H44" fill="none" strokeWidth="2" strokeLinecap="round" className={usage === 'LIVE' ? 'stroke-stage-text' : 'stroke-stage-line-strong'} strokeDasharray={usage === 'LIVE' ? undefined : '3 4'} />
      </svg>
      <div className="flex flex-col gap-2">
        <Node icon={Globe2} label="자가진단" sub="누구나 풀어요" state={pub('SELF')} tone="brand" />
        <Node icon={Lock} label="실전" sub="회차 전용" state={pub('LIVE')} tone="text" />
      </div>
    </div>
  )
}
