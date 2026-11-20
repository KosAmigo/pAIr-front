import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { api, ApiError, type FileDiff } from '../../api'
import { fileChange, type FileChange } from '../../lib/codeCompare'
import { cx } from '../cx'
import { ErrorState } from '../ErrorState'

const STATUS_TEXT: Record<FileChange['status'], string> = { added: 'B에만 있음', removed: 'A에만 있음', modified: '수정됨' }

/** 바뀐 파일 하나: 파일 이름 줄을 누르면 바뀐 줄(앞뒤 3줄 포함)이 펼쳐진다 */
function FileCard({ c, open, onToggle }: { c: FileChange; open: boolean; onToggle: () => void }) {
  return (
    <li className="overflow-hidden rounded-lg border border-line">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-2 bg-panel-raised px-3 py-2 text-left hover:bg-line/50">
        {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-text">{c.path}</span>
        <span className="rounded-full bg-line px-2 text-[12px] text-text-muted">{STATUS_TEXT[c.status]}</span>
        <span className="tnum font-mono text-[13px]">
          <span className="text-signal">+{c.add}</span> <span className="text-alert">−{c.del}</span>
        </span>
      </button>
      {open &&
        (c.tooLarge ? (
          <p className="px-3 py-3 text-[14px] text-text-muted">파일이 너무 커서 줄 단위 비교는 건너뛰었습니다.</p>
        ) : (
          <pre className="max-h-[420px] overflow-auto bg-panel-sunken py-1 font-mono text-[13px] leading-5">
            {c.lines.map((l, i) =>
              l.kind === 'skip' ? (
                <div key={i} className="px-3 py-0.5 text-center text-[12px] text-text-faint">⋯ {l.skipped}줄 생략 ⋯</div>
              ) : (
                <div
                  key={i}
                  className={cx(
                    'flex px-3 whitespace-pre',
                    l.kind === 'add' && 'bg-signal/10 text-text',
                    l.kind === 'del' && 'bg-alert/10 text-text-muted line-through decoration-alert/40',
                    l.kind === 'same' && 'text-text-muted',
                  )}
                >
                  <span aria-hidden className="mr-2 w-3 shrink-0 select-none">{l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' '}</span>
                  <span>{l.text}</span>
                </div>
              ),
            )}
          </pre>
        ))}
    </li>
  )
}

/**
 * 코드 변경 비교: 두 풀이의 최종 파일에서 내용이 다른 파일만, A 에서 B 로 바뀐 줄을 보여 준다.
 * 점수가 달라진 이유(감점 근거)와 함께 보면 어떤 코드를 고쳐서 달라졌는지 확인할 수 있다.
 */
export function CodeCompare({ aId, bId }: { aId: string; bId: string }) {
  const [files, setFiles] = useState<FileDiff[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [openPath, setOpenPath] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let alive = true
    api
      .compareFiles(aId, bId)
      .then((d) => alive && (setFiles(d), setError(null)))
      .catch((e: ApiError) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [aId, bId, tick])

  const changes = useMemo(() => (files ?? []).map((f) => fileChange(f)), [files])
  const total = changes.reduce((s, c) => ({ add: s.add + c.add, del: s.del + c.del }), { add: 0, del: 0 })
  return (
    <section aria-label="코드 변경 비교" className="mt-6 border-t border-line pt-4">
      <p className="label">CODE</p>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
        <h3 className="text-[15px] font-semibold text-text">코드 변경 비교 (A → B)</h3>
        {files && files.length > 0 && (
          <span className="tnum font-mono text-[13px] text-text-muted">
            {files.length}개 파일 <span className="text-signal">+{total.add}</span> <span className="text-alert">−{total.del}</span>
          </span>
        )}
      </div>
      {error ? (
        <ErrorState compact message={error} onRetry={() => setTick((t) => t + 1)} />
      ) : !files ? (
        <p className="flex items-center gap-2 text-[14px] text-text-muted">
          <Loader2 size={16} className="animate-spin" aria-hidden /> 불러오는 중
        </p>
      ) : files.length === 0 ? (
        <p className="text-[14px] text-text-muted">두 풀이의 최종 코드가 같습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {changes.map((c, i) => (
            <FileCard key={c.path} c={c} open={openPath[c.path] ?? i === 0} onToggle={() => setOpenPath((o) => ({ ...o, [c.path]: !(o[c.path] ?? i === 0) }))} />
          ))}
        </ul>
      )}
    </section>
  )
}
