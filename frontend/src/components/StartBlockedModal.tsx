import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Coins, X } from 'lucide-react'
import { Button, ButtonLink, IconButton } from './ui'

/**
 * 응시를 시작하지 못했을 때 누른 자리에 띄우는 창.
 * 크레딧 부족(402)이면 충전 화면으로 가는 버튼을 같이 보여 준다. 그 밖의 오류는 이유만 보여 준다.
 */
export function StartBlockedModal({ message, creditShortage, onClose }: { message: string; creditShortage: boolean; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div
      className="fade-in fixed inset-0 z-[70] flex items-center justify-center bg-bg/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-blocked-title"
      aria-describedby="start-blocked-body"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-[420px] rounded-xl border border-line bg-panel p-6 shadow-modal">
        <div className="flex items-start gap-3">
          {creditShortage && (
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-dim text-brand">
              <Coins size={20} aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id="start-blocked-title" className="text-[18px] leading-7 font-bold text-text">
              {creditShortage ? '크레딧이 부족합니다' : '응시를 시작하지 못했습니다'}
            </h2>
            <p id="start-blocked-body" className="mt-1 break-keep text-[15px] leading-6 text-text-muted">
              {/* 서버 문장 앞의 "크레딧이 부족합니다." 는 제목과 겹치므로 숫자만 남긴다 */}
              {creditShortage ? message.replace(/^크레딧이 부족합니다\.\s*/, '') : message}
              {creditShortage && <span className="block">충전한 뒤 다시 도전해 주세요.</span>}
            </p>
          </div>
          <IconButton label="닫기 (Esc)" onClick={onClose} className="-mt-1 -mr-2">
            <X size={18} aria-hidden />
          </IconButton>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          {creditShortage ? (
            <>
              <Button variant="ghost" onClick={onClose}>
                닫기
              </Button>
              <ButtonLink autoFocus to="/credits" variant="primary">
                충전하러 가기
              </ButtonLink>
            </>
          ) : (
            <Button autoFocus variant="primary" onClick={onClose}>
              확인
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
