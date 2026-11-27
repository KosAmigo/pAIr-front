import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { GitBranch, Loader2, Play } from 'lucide-react'
import { PageHeader, SelfShell } from '../components/SelfShell'
import { ButtonLink } from '../components/ui'
import { ErrorState } from '../components/ErrorState'
import { CompareTranscripts } from '../components/replay/CompareTranscripts'
import { CodeCompare } from '../components/replay/CodeCompare'
import { BranchStage } from '../components/review/BranchStage'
import { DotPopover, type Anchor } from '../components/review/DotPopover'
import { NodeDrawer } from '../components/review/NodeDrawer'
import { ScoreStairs } from '../components/review/ScoreStairs'
import { TaskRail } from '../components/review/TaskRail'
import { Verdict } from '../components/review/Verdict'
import { startLabel, useCompare } from '../components/review/shared'
import { ConfirmModal } from './console/common'
import { api, type ApiError, type AttemptSummary, type Checkpoint } from '../api'
import { loadCheckpoints, loadTaskTrees } from '../data/review'
import { attemptsQuery } from '../data/userQueries'
import { errorMessage, freshOnMount, queryKeys } from '../data/queryKeys'
import { assignSlot, divergeTurn, groupByTask, layoutLanes, resolveSelection, type TreeLane } from '../lib/reviewTree'

// DESIGN.md §7-5 복기 `/review?task=&a=&b=`
// 왼쪽 과제 레일, 어두운 무대의 갈래 트리, 아래에 결론 카드와 점수 계단. 계산은 lib/reviewTree.ts, lib/scoreSteps.ts.

type Scored = TreeLane & { score: NonNullable<TreeLane['score']> }
type Slot = 'a' | 'b'

function Loading({ text = '불러오는 중' }: { text?: string }) {
  return (
    <p className="flex items-center gap-2 p-6 text-body text-text-muted">
      <Loader2 size={18} className="animate-spin" aria-hidden /> {text}
    </p>
  )
}

export default function Review() {
  const [params, setParams] = useSearchParams()
  const queryClient = useQueryClient()
  // 빈 응시도 받아야 지울 수 있다 (안 보이면 과제 창의 이어서 풀기가 계속 남는다)
  const listQ = useQuery(attemptsQuery(true))
  const list: AttemptSummary[] | null = listQ.data ?? null
  const listError = errorMessage(listQ.error)
  const [slot, setSlot] = useState<Slot>('a')
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [removing, setRemoving] = useState<{ lane: TreeLane; busy: boolean; error: string | null } | null>(null)
  const [dot, setDot] = useState<{ lane: TreeLane; cp: Checkpoint; anchor: Anchor } | null>(null)

  const groups = useMemo(() => (list ? groupByTask(list) : []), [list])
  const qTask = params.get('task')
  const qa = params.get('a')
  const qb = params.get('b')
  const group = groups.find((g) => g.taskId === qTask) ?? groups.find((g) => g.attempts.some((x) => x.id === qb || x.id === qa)) ?? groups[0] ?? null
  const taskId = group?.taskId ?? null
  const newestFirst = useMemo(() => (group ? [...group.attempts].reverse().map((x) => x.id) : []), [group])

  // 과제나 응시 수가 바뀌면 키가 달라져 이전 과제의 트리는 보이지 않는다
  const treeQ = useQuery({
    queryKey: queryKeys.reviewTrees(group?.taskId ?? '', group?.count ?? 0),
    queryFn: () => loadTaskTrees(newestFirst),
    enabled: !!group,
    ...freshOnMount,
  })
  const treeReady = group ? { nodes: treeQ.data ?? null, error: errorMessage(treeQ.error) } : null
  const layout = useMemo(() => (treeQ.data ? layoutLanes(treeQ.data) : null), [treeQ.data])
  const lanes = useMemo(() => layout?.lanes ?? [], [layout])
  const sel = useMemo(() => (layout ? resolveSelection(layout.lanes, qa, qb) : { a: null, b: null }), [layout, qa, qb])
  const byId = useMemo(() => new Map(lanes.map((l) => [l.attemptId, l])), [lanes])
  const laneA = sel.a ? (byId.get(sel.a) as Scored | undefined) : undefined
  const laneB = sel.b ? (byId.get(sel.b) as Scored | undefined) : undefined
  const compare = useCompare(laneA && laneB ? laneA.attemptId : null, laneA && laneB ? laneB.attemptId : null)
  const openLane = openId ? byId.get(openId) : undefined

  // 갈래마다 체크포인트(질문 시점)를 불러와 선 위의 점으로 쓴다
  const laneKey = lanes.map((l) => l.attemptId).join(',')
  const cpsQ = useQuery({
    queryKey: queryKeys.reviewCheckpoints(laneKey),
    queryFn: () => loadCheckpoints(laneKey.split(',')),
    enabled: !!laneKey,
    ...freshOnMount,
  })
  const checkpoints = cpsQ.data ?? {}
  const openDot = (lane: TreeLane, cp: Checkpoint, target: Element) => {
    const r = target.getBoundingClientRect()
    setDot({ lane, cp, anchor: { left: r.left, top: r.top, bottom: r.bottom, width: r.width } })
  }

  const write = (next: { a: string | null; b: string | null }) => {
    const p = new URLSearchParams()
    if (taskId) p.set('task', taskId)
    if (next.a) p.set('a', next.a)
    if (next.b) p.set('b', next.b)
    setParams(p, { replace: true })
  }
  const pick = (id: string) => {
    const r = assignSlot(sel, slot, id)
    setSlot(r.slot)
    write(r.sel)
  }
  const selectTask = (id: string) => {
    setOpenId(null)
    setDot(null)
    setSlot('a')
    setParams(new URLSearchParams({ task: id }), { replace: true })
  }

  const remove = (lane: TreeLane) => {
    setRemoving({ lane, busy: true, error: null })
    api
      .deleteAttempt(lane.attemptId)
      .then(() => {
        setRemoving(null)
        setOpenId(null)
        setDot(null)
        setParams(new URLSearchParams(taskId ? { task: taskId } : {}), { replace: true })
        // 목록을 다시 읽으면 응시 수가 바뀌어 트리도 새 목록으로 다시 불러온다
        void queryClient.invalidateQueries({ queryKey: ['attempts'] })
      })
      .catch((e: ApiError) => setRemoving({ lane, busy: false, error: e.message }))
  }

  let body
  if (listError) body = <ErrorState message={listError} onRetry={() => void listQ.refetch()} className="mt-16" />
  else if (!list) body = <Loading />
  else if (groups.length === 0)
    body = (
      <div className="mx-auto mt-16 flex max-w-[560px] flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-panel/60 px-10 py-12 text-center">
        <GitBranch size={28} className="text-text-faint" aria-hidden />
        <p className="text-[17px] font-semibold text-text">아직 복기할 풀이가 없어요</p>
        <p className="text-[14px] text-text-muted">과제를 풀고 채점이 끝나면 여기에 갈래 트리로 쌓여요.</p>
        <ButtonLink to="/tasks" variant="primary" className="mt-2">
          <Play size={18} aria-hidden /> 과제 보러 가기
        </ButtonLink>
      </div>
    )
  else
    body = (
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-8 py-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
          <TaskRail groups={groups} selected={taskId} onSelect={selectTask} />
          <div className="min-w-0">
            {treeReady?.error ? (
              <ErrorState message={treeReady.error} onRetry={() => void treeQ.refetch()} />
            ) : !layout ? (
              <div className="review-stage rounded-[20px] p-6">
                <p className="relative z-10 flex items-center gap-2 text-[14px] text-[#9b97c4]">
                  <Loader2 size={16} className="animate-spin" aria-hidden /> 갈래 트리를 불러오는 중
                </p>
              </div>
            ) : (
              <>
                <BranchStage title={group?.title ?? ''} lanes={lanes} lastFork={layout.lastFork} a={sel.a} b={sel.b} slot={slot} onSlot={setSlot} onPick={pick} onOpen={setOpenId} onDelete={(lane) => setRemoving({ lane, busy: false, error: null })} checkpoints={checkpoints} onDot={openDot} />
                {lanes.length === 1 && <p className="mt-2 text-[13px] text-text-muted">선 위의 작은 점(질문을 보낸 시점)을 눌러 &quot;여기서 다시 풀기&quot;를 하면 갈래가 생겨요.</p>}
              </>
            )}
          </div>
        </div>

        {layout &&
          (laneA && laneB ? (
            <>
              <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.05fr_1fr]">
                <Verdict a={laneA} b={laneB} state={compare} fallbackFork={divergeTurn(lanes, laneA.attemptId, laneB.attemptId)} transcriptOpen={transcriptOpen} onToggleTranscript={() => setTranscriptOpen((o) => !o)} />
                <ScoreStairs a={laneA} b={laneB} state={compare} />
              </div>
              {transcriptOpen && <CompareTranscripts key={`${laneA.attemptId}-${laneB.attemptId}`} a={laneA} b={laneB} />}
              <div className="rounded-2xl border border-line bg-panel px-5 pb-5 shadow-sm [&>section]:mt-0 [&>section]:border-t-0">
                <CodeCompare aId={laneA.attemptId} bId={laneB.attemptId} />
              </div>
            </>
          ) : (
            <p className="rounded-2xl border border-dashed border-line-strong bg-panel/60 px-6 py-8 text-center text-[14px] text-text-muted">
              {laneA ? '비교하려면 채점이 끝난 풀이가 하나 더 필요해요. 같은 과제를 다시 풀거나 체크포인트에서 갈라 보세요.' : '채점이 끝난 풀이가 아직 없어요. 채점이 끝나면 여기서 두 갈래를 비교할 수 있어요.'}
            </p>
          ))}
      </div>
    )

  return (
    <SelfShell
      header={
        <PageHeader label="REVIEW" title="복기">
          <ButtonLink to="/tasks" variant="primary">
            <Play size={18} aria-hidden /> 새 과제 응시
          </ButtonLink>
        </PageHeader>
      }
    >
      {body}
      {removing &&
        // 화면 전환 영역(transform) 안에서는 fixed 가 어긋나므로 body 로 꺼내 그린다
        createPortal(
          <ConfirmModal
            title="이 풀이를 삭제할까요?"
            confirm={removing.busy ? '삭제하는 중' : '삭제'}
            danger
            disabled={removing.busy}
            onConfirm={() => remove(removing.lane)}
            onClose={() => !removing.busy && setRemoving(null)}
            body={
              <>
                <p>
                  {group?.title} · {removing.lane.name} ({startLabel(removing.lane.startedAt)} 시작)
                </p>
                <p className="mt-1 font-semibold text-text">
                  {group?.attempts.find((x) => x.id === removing.lane.attemptId)?.empty ? '아직 작업한 내용이 없는 풀이예요.' : '작업한 내용이 있는 풀이예요.'}
                </p>
                <p className="mt-2">삭제한 풀이는 되돌릴 수 없고, 사용한 크레딧은 돌려드리지 않아요.</p>
                {removing.error && (
                  <p role="alert" className="mt-3 text-alert">
                    {removing.error}
                  </p>
                )}
              </>
            }
          />,
          document.body,
        )}
      {openLane && <NodeDrawer lane={openLane} onClose={() => setOpenId(null)} />}
      {dot && <DotPopover laneName={dot.lane.name} cp={dot.cp} anchor={dot.anchor} onClose={() => setDot(null)} />}
    </SelfShell>
  )
}
