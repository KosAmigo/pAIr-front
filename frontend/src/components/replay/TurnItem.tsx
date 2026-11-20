import { Bot, User } from 'lucide-react'
import type { Turn } from '../../api'
import { cx } from '../cx'

/** AI 대화 한 턴 (복기 화면의 대화 기록) */
export function TurnItem({ t }: { t: Turn }) {
  const ai = t.role === 'ai'
  return (
    <li className={cx('rounded-sm border-l-2 bg-panel-raised px-4 py-3', ai ? 'border-info' : 'border-text-muted')}>
      <div className="flex items-center gap-2 font-mono text-[12px] text-text-muted">
        {ai ? <Bot size={14} className="text-info" aria-hidden /> : <User size={14} aria-hidden />}
        <span>#T{String(t.turn).padStart(2, '0')}</span>
        <span className={ai ? 'text-info' : 'text-text'}>{ai ? 'AI' : '응시자'}</span>
        <span>{t.time}</span>
      </div>
      <p className="mt-1 text-[15px] leading-6 break-words whitespace-pre-wrap text-text">{t.text}</p>
    </li>
  )
}
