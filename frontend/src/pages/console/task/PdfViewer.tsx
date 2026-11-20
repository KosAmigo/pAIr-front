// 비개발 과제 자료 PDF: 왼쪽 목록 → 누르면 오른쪽 화면 안 뷰어(blob URL 을 iframe 에).
// 관리자 API(/api/console/tasks/{code}/materials…)는 인증 헤더가 필요해 fetch → blob 으로 받는다.
// 검수 상세(과제 콘솔)와 응시자로 보기가 같이 쓴다.
import { useState, type ReactNode } from 'react'
import { FileText, FileWarning, Loader2 } from 'lucide-react'
import { cx } from '../../../components/cx'
import { ErrorState } from '../../../components/ErrorState'
import { fmtBytes, useMaterials, usePdfBlob } from '../../../data/taskReview'

export function PdfViewer({ code, height = 'h-[72vh]' }: { code: string; height?: string }) {
  const list = useMaterials(code)
  const [chosen, setChosen] = useState<string | null>(null)
  const items = list.state === 'ready' ? list.data : []
  const path = chosen ?? items[0]?.path ?? null
  const pdf = usePdfBlob(code, path)

  if (list.state === 'loading') return <Center><Loader2 size={18} className="animate-spin text-brand" aria-hidden /> 자료 목록을 불러오는 중</Center>
  if (list.state === 'error') return <ErrorState message={list.message} onRetry={list.reload} />
  if (list.state === 'missing' || items.length === 0) {
    return (
      <Center>
        <FileText size={22} className="text-text-faint" aria-hidden /> 이 과제에는 PDF 자료가 없어요.
      </Center>
    )
  }

  return (
    <div className={cx('grid min-h-0 grid-cols-1 overflow-hidden rounded-2xl border border-line bg-panel shadow-sm md:grid-cols-[240px_minmax(0,1fr)]', height)}>
      <nav aria-label="자료 PDF" className="flex min-h-0 flex-col border-b border-line md:border-r md:border-b-0">
        <p className="label border-b border-line px-4 py-2.5">MATERIALS</p>
        <ul className="min-h-0 flex-1 overflow-auto p-2">
          {items.map((m) => {
            const on = m.path === path
            return (
              <li key={m.path}>
                <button
                  type="button"
                  aria-current={on || undefined}
                  onClick={() => setChosen(m.path)}
                  className={cx('flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors', on ? 'bg-brand-dim' : 'hover:bg-panel-raised')}
                >
                  <span className={cx('mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md', on ? 'bg-alert text-on-accent' : 'bg-alert/10 text-alert')} aria-hidden>
                    <FileText size={15} />
                  </span>
                  <span className="min-w-0">
                    <span className={cx('block truncate text-[14px]', on ? 'font-bold text-text' : 'font-semibold text-text')}>{m.path.split('/').pop()}</span>
                    <span className="tnum block font-mono text-[12px] text-text-muted">
                      {m.pages}쪽 {fmtBytes(m.sizeBytes)}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="relative min-h-[360px] bg-panel-sunken">
        {pdf.error ? (
          <Center>
            <span className="flex max-w-[420px] flex-col items-center gap-2 text-center">
              <FileWarning size={24} className="text-caution" aria-hidden />
              <span className="break-keep">{pdf.error}</span>
            </span>
          </Center>
        ) : pdf.url ? (
          <iframe key={pdf.url} src={pdf.url} title={`${path} 미리보기`} className="fade-in absolute inset-0 size-full" />
        ) : (
          <Center>
            <Loader2 size={18} className="animate-spin text-brand" aria-hidden /> PDF를 받는 중
          </Center>
        )}
      </div>
    </div>
  )
}

function Center({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-48 items-center justify-center gap-2 p-6 text-[14px] text-text-muted">{children}</div>
}
