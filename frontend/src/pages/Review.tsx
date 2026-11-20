import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { GitBranch, Loader2, Play } from 'lucide-react'
import { PageHeader, SelfShell } from '../components/SelfShell'
import { ButtonLink } from '../components/ui'
import { ErrorState } from '../components/ErrorState'
import { CodeCompare } from '../components/replay/CodeCompare'
import { BranchStage } from '../components/review/BranchStage'
import { NodeDrawer } from '../components/review/NodeDrawer'
import { ScoreStairs } from '../components/review/ScoreStairs'
import { TaskRail } from '../components/review/TaskRail'
import { Verdict } from '../components/review/Verdict'
import { useCompare } from '../components/review/shared'
import { api, type ApiError, type AttemptSummary, type TreeNode } from '../api'
import { loadTaskTrees } from '../data/review'
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
  const [list, setList] = useState<AttemptSummary[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [listTick, setListTick] = useState(0)
  const [trees, setTrees] = useState<{ key: string; nodes: TreeNode[] | null; error: string | null } | null>(null)
  const [treeTick, setTreeTick] = useState(0)
  const [slot, setSlot] = useState<Slot>('a')
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api
      .list()
      .then((d) => alive && (setList(d), setListError(null)))
      .catch((e: ApiError) => alive && setListError(e.message))
    return () => {
      alive = false
    }
  }, [listTick])

  const groups = useMemo(() => (list ? groupByTask(list) : []), [list])
  const qTask = params.get('task')
  const qa = params.get('a')
  const qb = params.get('b')
  const group = groups.find((g) => g.taskId === qTask) ?? groups.find((g) => g.attempts.some((x) => x.id === qb || x.id === qa)) ?? groups[0] ?? null
  const taskId = group?.taskId ?? null
  const treeKey = group ? `${group.taskId}|${group.count}|${treeTick}` : ''
  const newestFirst = useMemo(() => (group ? [...group.attempts].reverse().map((x) => x.id) : []), [group])

  useEffect(() => {
    if (!treeKey) return
    let alive = true
    loadTaskTrees(newestFirst)
      .then((nodes) => alive && setTrees({ key: treeKey, nodes, error: null }))
      .catch((e: ApiError) => alive && setTrees({ key: treeKey, nodes: null, error: e.message }))
    return () => {
      alive = false
    }
  }, [treeKey, newestFirst])

  const treeReady = trees != null && trees.key === treeKey ? trees : null
  const layout = useMemo(() => (treeReady?.nodes ? layoutLanes(treeReady.nodes) : null), [treeReady])
  const lanes = useMemo(() => layout?.lanes ?? [], [layout])
  const sel = useMemo(() => (layout ? resolveSelection(layout.lanes, qa, qb) : { a: null, b: null }), [layout, qa, qb])
  const byId = useMemo(() => new Map(lanes.map((l) => [l.attemptId, l])), [lanes])
  const laneA = sel.a ? (byId.get(sel.a) as Scored | undefined) : undefined
  const laneB = sel.b ? (byId.get(sel.b) as Scored | undefined) : undefined
  const compare = useCompare(laneA && laneB ? laneA.attemptId : null, laneA && laneB ? laneB.attemptId : null)
  const openLane = openId ? byId.get(openId) : undefined

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
    setSlot('a')
    setParams(new URLSearchParams({ task: id }), { replace: true })
  }

  let body
  if (listError) body = <ErrorState message={listError} onRetry={() => setListTick((t) => t + 1)} className="mt-16" />
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
              <ErrorState message={treeReady.error} onRetry={() => setTreeTick((t) => t + 1)} />
            ) : !layout ? (
              <div className="review-stage rounded-[20px] p-6">
                <p className="relative z-10 flex items-center gap-2 text-[14px] text-[#9b97c4]">
                  <Loader2 size={16} className="animate-spin" aria-hidden /> 갈래 트리를 불러오는 중
                </p>
              </div>
            ) : (
              <>
                <BranchStage title={group?.title ?? ''} lanes={lanes} lastFork={layout.lastFork} a={sel.a} b={sel.b} slot={slot} onSlot={setSlot} onPick={pick} onOpen={setOpenId} />
                {lanes.length === 1 && <p className="mt-2 text-[13px] text-text-muted">점을 두 번 눌러 대화를 열고, 체크포인트에서 &quot;여기서 다시 풀기&quot;를 하면 갈래가 생겨요.</p>}
              </>
            )}
          </div>
        </div>

        {layout &&
          (laneA && laneB ? (
            <>
              <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.05fr_1fr]">
                <Verdict a={laneA} b={laneB} state={compare} fallbackFork={divergeTurn(lanes, laneA.attemptId, laneB.attemptId)} />
                <ScoreStairs a={laneA} b={laneB} state={compare} />
              </div>
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
      {openLane && <NodeDrawer lane={openLane} onClose={() => setOpenId(null)} />}
    </SelfShell>
  )
}
