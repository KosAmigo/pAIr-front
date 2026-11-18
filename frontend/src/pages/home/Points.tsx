// DESIGN.md §7-1 장점 목록: 실전 시험, 과제 생성, 감독 섹션이 같은 모양을 쓴다.
// 아이콘 칸 44px(brand-dim) + 제목 19px + 설명 16px, 아이콘은 왼쪽, 글은 오른쪽.
import type { LucideIcon } from 'lucide-react'
import { cx } from '../../components/cx'
import { useOnStage } from '../../components/fx'

export type Point = { icon: LucideIcon; title: string; body: string }

export default function Points({ items, className }: { items: Point[]; className?: string }) {
  const stage = useOnStage()
  return (
    <ul data-points className={cx('grid gap-8', className)}>
      {items.map((p) => (
        <li key={p.title} data-point className="flex gap-4">
          <span
            className={cx(
              'inline-flex size-11 shrink-0 items-center justify-center rounded-md',
              stage ? 'border border-stage-line bg-stage-raised text-stage-brand' : 'bg-brand-dim text-brand',
            )}
          >
            <p.icon size={22} strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <p className={cx('text-[19px] font-bold', stage ? 'text-stage-text' : 'text-text')}>{p.title}</p>
            <p className={cx('mt-1 text-[16px] leading-7', stage ? 'text-stage-muted' : 'text-text-muted')}>{p.body}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

/** 화면 그림 뒤의 빛 번짐. 모든 섹션이 같은 색과 세기를 쓴다 */
export function Glow({ className }: { className?: string }) {
  return <div aria-hidden className={cx('absolute inset-x-[10%] top-[10%] bottom-0 rounded-full bg-brand/20 blur-[100px]', className)} />
}

