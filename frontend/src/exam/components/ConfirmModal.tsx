import { X } from 'lucide-react'
import { Button, IconButton } from '../../components/ui'

export function ConfirmModal({ busy, onCancel, onConfirm }: { busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-bg/70" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="w-[440px] rounded-lg border border-line bg-panel shadow-modal">
        <header className="flex h-10 items-center border-b border-line px-4">
          <span className="label">SUBMIT</span>
          <IconButton label="닫기" className="ml-auto" onClick={onCancel}>
            <X size={18} aria-hidden />
          </IconButton>
        </header>
        <div className="p-6">
          <h2 id="confirm-title" className="text-h2 font-semibold">
            풀이를 제출할까요?
          </h2>
          <p className="mt-2 text-[15px] leading-6 text-text-muted">제출하면 파일과 AI 대화가 잠기고, 후속 질문 3개가 이어집니다.</p>
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="ghost" onClick={onCancel}>
            계속 풀기
          </Button>
          <Button variant="primary" disabled={busy} onClick={onConfirm}>
            제출
          </Button>
        </footer>
      </div>
    </div>
  )
}
