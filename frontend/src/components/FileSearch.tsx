// 파일 검색 창: 파일 이름과 내용에서 찾아, 고른 결과의 파일과 줄로 간다
import { useEffect, useRef, useState } from 'react'
import { FileText } from 'lucide-react'
import { MAX_HITS, searchFiles, type SearchHit } from '../lib/fileSearch'
import { cx } from './cx'

export function FileSearch({
  paths,
  contents,
  loading,
  onPick,
  onClose,
}: {
  paths: string[]
  contents: Record<string, string>
  /** 아직 안 불러온 파일을 읽는 중 */
  loading: boolean
  onPick: (hit: SearchHit) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const list = useRef<HTMLUListElement>(null)
  const hits = searchFiles(paths, contents, query)
  const current = Math.min(index, hits.length - 1)
  useEffect(() => {
    list.current?.children[current]?.scrollIntoView({ block: 'nearest' })
  }, [current])
  return (
    <div
      className="fade-in fixed inset-0 z-[70] flex items-start justify-center bg-bg/60 px-6 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="파일 검색"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[64vh] w-[min(720px,94vw)] flex-col overflow-hidden rounded-lg border border-line-strong bg-panel shadow-modal">
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIndex(0)
          }}
          onKeyDown={(e) => {
            // 한글 조합 중의 Enter·방향키는 무시한다
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter' && hits[current]) onPick(hits[current])
            else if (e.key === 'ArrowDown') setIndex(Math.min(current + 1, hits.length - 1))
            else if (e.key === 'ArrowUp') setIndex(Math.max(current - 1, 0))
            else return
            e.preventDefault()
          }}
          placeholder="파일 이름이나 코드 검색"
          aria-label="검색어"
          spellCheck={false}
          className="h-11 shrink-0 border-b border-line bg-panel-raised px-4 font-mono text-[14px] text-text outline-none"
        />
        <ul ref={list} className="min-h-0 flex-1 overflow-auto" aria-label="검색 결과">
          {hits.map((h, i) => (
            <li key={`${h.path}:${h.line ?? 0}`}>
              <button
                type="button"
                aria-current={i === current}
                onClick={() => onPick(h)}
                onMouseMove={() => setIndex(i)}
                className={cx('flex w-full items-center gap-2 px-4 py-1.5 text-left font-mono text-[13px]', i === current ? 'bg-panel-raised text-text' : 'text-text-muted')}
              >
                {h.line ? (
                  <>
                    <span className="min-w-0 flex-1 truncate">{h.text}</span>
                    <span className="shrink-0 text-[12px] text-text-faint" title={h.path}>
                      {h.path.split('/').pop()}:{h.line}
                    </span>
                  </>
                ) : (
                  <>
                    <FileText size={14} className="shrink-0" aria-hidden />
                    <span className="truncate">{h.path}</span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
        <p role="status" className="shrink-0 border-t border-line px-4 py-1.5 text-[12px] text-text-faint">
          {loading
            ? '파일을 읽는 중입니다'
            : !query.trim()
              ? '↑↓ 이동 · Enter 열기 · Esc 닫기'
              : hits.length === 0
                ? '결과가 없습니다'
                : `결과 ${hits.length}개${hits.length === MAX_HITS ? ' (더 있을 수 있습니다. 검색어를 더 입력하세요)' : ''}`}
        </p>
      </div>
    </div>
  )
}
