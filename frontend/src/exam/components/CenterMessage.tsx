import { Loader2 } from 'lucide-react'

export function CenterMessage({ text, error }: { text: string; error?: string | null }) {
  return (
    <div className="flex h-full items-center justify-center bg-bg">
      {error ? (
        <div className="max-w-[520px] rounded-md border border-alert/40 bg-panel p-6">
          <span className="label text-alert">ERROR</span>
          <p className="mt-2 text-body text-text">{error}</p>
        </div>
      ) : (
        <span className="flex items-center gap-2 text-body text-text-muted">
          <Loader2 size={18} className="animate-spin" aria-hidden /> {text}
        </span>
      )}
    </div>
  )
}
