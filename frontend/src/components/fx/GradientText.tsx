import type { ReactNode } from 'react'
import { cx } from '../cx'
import { useOnStage } from './stage'

/** 핵심 단어 하나에만 쓰는 그라데이션 글씨. 다크 무대 안에서는 stage 그라데이션으로 바뀐다. */
export function GradientText({ children, className }: { children: ReactNode; className?: string }) {
  const onStage = useOnStage()
  return <span className={cx(onStage ? 'text-brand-gradient-stage' : 'text-brand-gradient', className)}>{children}</span>
}
