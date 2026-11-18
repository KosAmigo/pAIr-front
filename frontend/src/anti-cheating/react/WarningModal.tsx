import { X } from 'lucide-react'
import type { Violation } from '../core/types.ts'

const LABELS: Record<Violation['signals'][number]['type'], string> = {
  MOUSE_LEAVE: '시험 페이지 영역 이탈',
  WINDOW_BLUR: '브라우저 창 포커스 상실',
  TAB_HIDDEN: '시험 탭 숨김',
  FULLSCREEN_EXIT: '전체 화면 해제',
}

function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'medium' }).format(date)
}

export function WarningModal({ violation, count, onClose }: { violation: Violation | null; count: number; onClose: () => void }) {
  if (!violation) return null
  const types = [...new Set(violation.signals.map((signal) => signal.type))]

  return (
    <div className="fade-in fixed inset-0 z-[70] flex items-center justify-center bg-bg/70 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="anti-cheating-title" className="w-full max-w-[480px] rounded-lg border border-alert/50 bg-panel shadow-modal">
        <header className="flex h-11 items-center border-b border-line px-4">
          <span className="label text-alert">BROWSER EVENT DETECTED</span>
          <button type="button" aria-label="경고 닫기" onClick={onClose} className="ml-auto inline-flex size-8 items-center justify-center rounded-sm text-text-muted hover:bg-panel-raised hover:text-text">
            <X size={18} aria-hidden />
          </button>
        </header>
        <div className="p-6">
          <h2 id="anti-cheating-title" className="text-h2 font-semibold">시험 화면 이탈이 감지됐습니다</h2>
          <p className="mt-2 text-[15px] leading-6 text-text-muted">감지 유형: {types.map((type) => LABELS[type]).join(', ')}</p>
          <p className="mt-3 font-mono text-[13px] text-text-faint">누적 {count}회 · 발생 {formatTime(violation.occurredAt)}</p>
          <p className="mt-4 text-[13px] leading-5 text-text-faint">브라우저 상태 변화 기록이며, 이 기록만으로 부정행위를 확정하지 않습니다.</p>
        </div>
        <footer className="flex justify-end border-t border-line px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-md bg-brand-gradient px-4 py-2 text-[14px] font-semibold text-on-accent">확인</button>
        </footer>
      </section>
    </div>
  )
}
