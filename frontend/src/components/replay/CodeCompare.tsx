import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { api } from '../../api'
import { errorMessage, freshOnMount } from '../../data/queryKeys'
import { fileView, type EditKind, type FileChange, type FileView } from '../../lib/codeCompare'
import { cx } from '../cx'
import { ErrorState } from '../ErrorState'
import { SLOT } from '../review/shared'

const KIND_TEXT: Record<EditKind, string> = { same: 'A·B 똑같이 수정', a: 'A만 수정', b: 'B만 수정', differ: '서로 다르게 수정' }

/** 바뀐 줄 목록. 세로로는 늘어나기만 하고(스크롤은 페이지 하나), 긴 줄만 가로로 넘긴다 */
function DiffLines({ change }: { change: FileChange }) {
  if (change.tooLarge) return <p className="px-3 py-3 text-[14px] text-text-muted">파일이 너무 커서 줄 단위 비교는 건너뛰었습니다.</p>
  return (
    <pre className="overflow-x-auto bg-panel-sunken py-1 font-mono text-[13px] leading-5">
      {change.lines.map((l, i) =>
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
  )
}

/** 제목 줄이 있는 변경 블록 하나 */
function Block({ title, color, change }: { title: string; color?: string; change: FileChange }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-line">
      <p className="flex items-center gap-2 bg-panel-raised px-3 py-1.5 text-[13px] font-semibold" style={color ? { color } : undefined}>
        {title}
        <span className="tnum ml-auto font-mono text-[12px] font-normal">
          <span className="text-signal">+{change.add}</span> <span className="text-alert">−{change.del}</span>
        </span>
      </p>
      <DiffLines change={change} />
    </div>
  )
}

/** 변경이 없는 쪽: 원본 그대로 */
function Untouched({ title, color }: { title: string; color: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-3 py-3 text-[14px] text-text-muted">
      <span className="font-semibold" style={{ color }}>{title}</span>는 이 파일을 원본 그대로 두었어요.
    </div>
  )
}

const stat = (c: FileChange | null, tag: 'a' | 'b') =>
  c ? (
    <span className="tnum font-mono text-[13px]">
      <span className="font-semibold" style={{ color: SLOT[tag].text }}>{SLOT[tag].name}</span> <span className="text-signal">+{c.add}</span> <span className="text-alert">−{c.del}</span>
    </span>
  ) : (
    <span className="font-mono text-[13px] text-text-faint">{SLOT[tag].name} 그대로</span>
  )

/** 바뀐 파일 하나: 기본은 원본 기준 A·B 각각, "A와 B의 차이"로 바꿔 볼 수 있다 */
function FileCard({ v, open, onToggle }: { v: FileView; open: boolean; onToggle: () => void }) {
  const [mode, setMode] = useState<'base' | 'ab'>('base')
  return (
    <li className="overflow-hidden rounded-lg border border-line">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 bg-panel-raised px-3 py-2 text-left hover:bg-line/50">
        {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-text">{v.path}</span>
        <span className="rounded-full bg-line px-2 text-[12px] text-text-muted">{KIND_TEXT[v.kind]}</span>
        {stat(v.baseToA, 'a')}
        {stat(v.baseToB, 'b')}
      </button>
      {open && (
        <div className="flex flex-col gap-2 p-3">
          <div role="group" aria-label="보기 방식" className="flex gap-1">
            {(
              [
                ['base', '원본 기준'],
                ['ab', 'A와 B의 차이'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={mode === key}
                onClick={() => setMode(key)}
                className={cx('rounded-full border px-3 py-1 text-[13px]', mode === key ? 'border-line-strong bg-line font-semibold text-text' : 'border-line text-text-muted hover:text-text')}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === 'ab' ? (
            v.kind === 'same' ? (
              <p className="text-[14px] text-text-muted">A와 B의 최종 코드가 같아요. 둘 다 원본에서 똑같이 바꿨어요.</p>
            ) : (
              <Block title="A → B" change={v.aToB} />
            )
          ) : v.kind === 'same' && v.baseToA ? (
            <Block title="원본 → A·B (두 풀이가 똑같이 수정)" change={v.baseToA} />
          ) : (
            <div className="grid gap-2 lg:grid-cols-2">
              {v.baseToA ? <Block title="A · 원본 → A" color={SLOT.a.text} change={v.baseToA} /> : <Untouched title="A" color={SLOT.a.text} />}
              {v.baseToB ? <Block title="B · 원본 → B" color={SLOT.b.text} change={v.baseToB} /> : <Untouched title="B" color={SLOT.b.text} />}
            </div>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * 코드 변경 비교: 과제 원본에서 A 와 B 가 각각 무엇을 바꿨는지 파일별로 보여 준다.
 * A → B 차이만 보면 두 풀이가 똑같이 고친 부분은 안 나와서 B 만 고친 것처럼 보이므로, 기본은 원본 기준 A·B 각각이다.
 */
export function CodeCompare({ aId, bId }: { aId: string; bId: string }) {
  const q = useQuery({ queryKey: ['review-code-compare', aId, bId], queryFn: () => api.compareFiles(aId, bId), ...freshOnMount })
  const files = q.data ?? null
  const error = errorMessage(q.error)
  const [openPath, setOpenPath] = useState<Record<string, boolean>>({})

  const views = useMemo(() => (files ?? []).map((f) => fileView(f)), [files])
  const sum = (pick: (v: FileView) => FileChange | null) => views.reduce((s, v) => ({ add: s.add + (pick(v)?.add ?? 0), del: s.del + (pick(v)?.del ?? 0) }), { add: 0, del: 0 })
  const a = sum((v) => v.baseToA)
  const b = sum((v) => v.baseToB)
  return (
    <section aria-label="코드 변경 비교" className="mt-6 border-t border-line pt-4">
      <p className="label">CODE</p>
      <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
        <h3 className="text-[15px] font-semibold text-text">코드 변경 비교 (원본 기준)</h3>
        {views.length > 0 && (
          <span className="tnum font-mono text-[13px] text-text-muted">
            {views.length}개 파일 · <span style={{ color: SLOT.a.text }}>A</span> <span className="text-signal">+{a.add}</span> <span className="text-alert">−{a.del}</span> ·{' '}
            <span style={{ color: SLOT.b.text }}>B</span> <span className="text-signal">+{b.add}</span> <span className="text-alert">−{b.del}</span>
          </span>
        )}
      </div>
      <p className="mb-2 text-[13px] text-text-muted">과제 원본에서 A와 B가 각각 바꾼 줄이에요. 둘 다 똑같이 바꾼 코드도 여기서는 두 풀이 모두에 나와요.</p>
      {error ? (
        <ErrorState compact message={error} onRetry={() => void q.refetch()} />
      ) : !files ? (
        <p className="flex items-center gap-2 text-[14px] text-text-muted">
          <Loader2 size={16} className="animate-spin" aria-hidden /> 불러오는 중
        </p>
      ) : views.length === 0 ? (
        <p className="text-[14px] text-text-muted">두 풀이 모두 원본 코드를 바꾸지 않았습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {views.map((v, i) => (
            <FileCard key={v.path} v={v} open={openPath[v.path] ?? i === 0} onToggle={() => setOpenPath((o) => ({ ...o, [v.path]: !(o[v.path] ?? i === 0) }))} />
          ))}
        </ul>
      )}
    </section>
  )
}
