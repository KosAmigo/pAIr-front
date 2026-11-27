import { RequirementsView } from '../../components/RequirementsView'
import type { SidePanel as SidePanelKey } from '../../components/ActivityRail'
import { ResizeHandle } from '../../components/ResizeHandle'
import { QuestionPanel } from '../../components/questions/QuestionPanel'
import type { useQuestions } from '../../components/questions/useQuestions'
import type { AttachRef } from '../../lib/chatAttach'
import type { Task } from '../../api'
import { DEFAULT_WIDTHS, MIN_WIDTHS, maxPanelWidth } from '../hooks/usePanelWidths'
import { PathTree, type AttachFor, type TreeNode } from './PathTree'

/** 사이드 패널: 과제 / 파일 */
export function SidePanel({
  side,
  widths,
  sideKey,
  setWidth,
  task,
  dev,
  hasQuestions,
  qs,
  setSide,
  tree,
  active,
  openFile,
  locked,
  setRefTab,
  attachFor,
  attach,
  flash,
}: {
  side: Exclude<SidePanelKey, null>
  widths: typeof DEFAULT_WIDTHS
  sideKey: 'questions' | 'side'
  setWidth: (key: keyof typeof DEFAULT_WIDTHS, width: number) => void
  task: Task
  dev: boolean
  hasQuestions: boolean
  qs: ReturnType<typeof useQuestions>
  setSide: (s: SidePanelKey) => void
  tree: TreeNode[]
  active: string
  openFile: (p: string) => Promise<void>
  locked: boolean
  setRefTab: (t: 'prompts' | 'file') => void
  attachFor: AttachFor
  attach: (r: AttachRef) => string | null
  flash: (msg: string) => void
}) {
  return (

    <aside className="relative flex min-h-0 min-w-0 flex-col border-r border-line bg-panel">
      <ResizeHandle
        label="왼쪽 패널 크기 조절"
        edge="right"
        value={widths[sideKey]}
        min={MIN_WIDTHS[sideKey]}
        maxWidth={maxPanelWidth}
        onResize={(w) => setWidth(sideKey, w)}
        onReset={() => setWidth(sideKey, DEFAULT_WIDTHS[sideKey])}
      />
      <header className="flex h-10 shrink-0 items-center border-b border-line px-4">
        <span className="label">{side === 'task' ? 'TASK' : side === 'questions' ? 'QUESTIONS' : 'EXPLORER'}</span>
      </header>
      {side === 'questions' ? (
        <QuestionPanel qs={qs} />
      ) : side === 'task' ? (
        <div className="fade-in min-h-0 flex-1 overflow-auto p-4">
          <span className="label">{dev ? 'DEV' : 'BIZ'} TASK</span>
          <h2 className="mt-1 text-h3 font-semibold">{task.title}</h2>
          {task.description.map((d) => (
            <p key={d} className="mt-3 text-[15px] leading-6 text-text">
              {d}
            </p>
          ))}
          <h3 className="label mt-6">REQUIREMENTS</h3>
          <RequirementsView lines={task.requirements} className="mt-2" />
          {hasQuestions && (
            <button
              type="button"
              onClick={() => setSide('questions')}
              className="mt-6 flex w-full items-center justify-between rounded-md border border-line bg-panel-raised/40 px-3 py-2.5 text-left text-[15px] font-semibold text-text hover:border-line-strong"
            >
              <span>문항 풀기</span>
              <span className="tnum font-mono text-[13px] font-normal text-text-muted">
                {qs.answered}/{qs.questions.length}
              </span>
            </button>
          )}
          <h3 className="label mt-6">NOTES</h3>
          <ul className="mt-2 space-y-2">
            {task.notes.map((n) => (
              <li key={n} className="border-l-2 border-caution pl-3 text-[14px] leading-5 text-text-muted">
                {n}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <nav className="fade-in min-h-0 flex-1 overflow-auto py-2" aria-label="파일 탐색기">
          <PathTree
            nodes={tree}
            active={active}
            onOpen={(p) => {
              void openFile(p)
              if (locked) setRefTab('file')
            }}
            attachFor={locked ? undefined : attachFor}
            onAttach={(r) => {
              const why = attach(r)
              if (why) flash(why)
            }}
          />
        </nav>
      )}
    </aside>
  )
}
