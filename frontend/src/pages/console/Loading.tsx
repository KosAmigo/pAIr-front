// 콘솔 화면 공용: 불러오는 중 한 줄
import { Loader2 } from 'lucide-react'
import { cx } from '../../components/cx'

export function Loading({ text = '불러오는 중', className }: { text?: string; className?: string }) {
  return (
    <p role="status" className={cx('flex items-center justify-center gap-2 py-16 text-[14px] text-text-muted', className)}>
      <Loader2 size={18} className="animate-spin text-brand" aria-hidden /> {text}
    </p>
  )
}
