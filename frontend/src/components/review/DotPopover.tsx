import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, RotateCcw } from 'lucide-react'
import type { Checkpoint } from '../../api'
import { Button } from '../ui'
import { useRollback } from '../replay/useRollback'
import { turnTag } from './shared'

/** 점(질문 시점)의 화면 위치 */
export type Anchor = { left: number; top: number; bottom: number; width: number }

const WIDTH = 300
const HEIGHT_GUESS = 190

/**
 * 갈래 선 위의 점을 눌렀을 때 그 자리에서 뜨는 "여기서 다시 풀기" 확인 창.
 * 서랍(NodeDrawer)은 변형이 걸린 영역 밖에 그려야 위치가 맞아서 body 로 꺼내 그린다.
 */
export function DotPopover({ laneName, cp, anchor, onClose }: { laneName: string; cp: Checkpoint; anchor: Anchor; onClose: () => void }) {
  const rb = useRollback()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const left = Math.min(Math.max(8, anchor.left + anchor.width / 2 - WIDTH / 2), window.innerWidth - WIDTH - 8)
  const below = anchor.bottom + 10 + HEIGHT_GUESS < window.innerHeight
  const style = below ? { left, top: anchor.bottom + 10 } : { left, top: anchor.top - 10, transform: 'translateY(-100%)' }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[55]" aria-hidden onClick={onClose} />
      <div role="dialog" aria-label={`${laneName} ${turnTag(cp.turnNo)} 질문 시점에서 다시 풀기`} className="fixed z-[56] rounded-xl border border-line bg-panel p-4 shadow-lg" style={{ ...style, width: WIDTH }}>
        <p className="label">CHECKPOINT</p>
        <h3 className="text-[15px] font-semibold text-text">
          {laneName} · {turnTag(cp.turnNo)} 질문 시점
        </h3>
        {cp.label && <p className="mt-0.5 truncate text-[13px] text-text-muted">{cp.label}</p>}
        <p className="mt-2 text-[14px] leading-5 text-text">
          이 질문을 보낸 순간의 코드와 그 앞 대화로 새 풀이를 시작해요. 지금 풀이는 그대로 남고, <b>크레딧이 차감돼요.</b>
        </p>
        {rb.error && (
          <p role="alert" className="mt-2 rounded-md border border-alert/30 bg-alert/8 px-3 py-2 text-[13px] text-text">
            {rb.error}
          </p>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" variant="ghost" disabled={rb.busy} onClick={onClose}>
            취소
          </Button>
          <Button size="sm" variant="primary" disabled={rb.busy} onClick={() => void rb.run(cp.checkpointId)}>
            {rb.busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RotateCcw size={14} aria-hidden />} 여기서 다시 풀기
          </Button>
        </div>
      </div>
    </>,
    document.body,
  )
}
