// DESIGN.md §7-9-3 과제 검수 (ADMIN). 2026-11-20 개편.
// 위: 스포트라이트 머리(상태 배지, 제목, 수치) → 상태 흐름(검수 전 → 자가진단/실전) + 용도 토글(검수 전만) + 주인공 버튼.
// 아래: 알약 탭(개요, 파일, 자료, 문항, 자동 확인 결과) + 오른쪽 검수 체크리스트(브라우저에만 저장).
// 내용 편집은 백엔드 API 가 없어 읽기 전용이다. 공개·숨기기·용도 바꾸기만 한다.
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, Loader2, Rocket } from 'lucide-react'
import { levelLabel } from '../../components/taskKind'
import { ErrorState } from '../../components/ErrorState'
import { useConsoleCrumbs } from '../../components/consoleCrumbs'
import { Glass, Magnetic } from '../../components/fx'
import { Button } from '../../components/ui'
import type { ConsoleTaskSummary } from '../../consoleApi'
import { setPublished, useTaskDetail } from '../../data/consoleTasks'
import { countChecks } from '../../data/taskGen'
import { useGenReport } from '../../data/taskReview'
import { checkBadge, isClosed, madeAt, REVIEW_CHECKS, tabOf, trackOf, TRACK_LABEL } from '../../data/taskBoard'
import { ConfirmModal, TaskStatusBadge } from './common'
import { ConsoleHero, HeroSep, PillTabs } from './ConsoleHero'
import { fmtTime, useToast } from './format'
import { AiBadge, CheckBadge } from './task/badges'
import { PdfViewer } from './task/PdfViewer'
import { ReviewChecklist } from './task/ReviewChecklist'
import { useChecklist } from './task/useChecklist'
import { FilesTab, GenReportTab, OverviewTab, QuestionsTab } from './task/ReviewTabs'
import { StatusFlow } from './task/StatusFlow'
import { UsageToggle } from './task/UsageToggle'

type Tab = 'overview' | 'files' | 'materials' | 'questions' | 'report'
const TAB_NAME: Record<Tab, string> = { overview: '개요', files: '파일', materials: '자료', questions: '문항', report: '자동 확인 결과' }

export default function ConsoleTaskEdit() {
  const { taskId } = useParams()
  const { detail, error, reload, setSummary } = useTaskDetail(taskId)
  useConsoleCrumbs(detail ? [detail.summary.title] : [])

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 px-8 py-24">
        <ErrorState message={error} onRetry={reload} />
        <Link to="/console/tasks" className="text-[14px] font-semibold text-brand hover:underline">
          과제 목록으로
        </Link>
      </div>
    )
  }
  if (!detail || !taskId) {
    return (
      <div className="flex flex-col gap-5 px-8 pt-6" aria-busy>
        <div className="h-[148px] animate-pulse rounded-xl border border-stage-line bg-panel" />
        <p className="flex items-center justify-center gap-2 py-16 text-[14px] text-text-muted">
          <Loader2 size={18} className="animate-spin text-brand" aria-hidden /> 과제를 불러오는 중
        </p>
      </div>
    )
  }
  return <Review key={taskId} code={taskId} detail={detail} setSummary={setSummary} />
}

function Review({ code, detail, setSummary }: { code: string; detail: NonNullable<ReturnType<typeof useTaskDetail>['detail']>; setSummary: (s: ConsoleTaskSummary) => void }) {
  const { summary: s, definition: d } = detail
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<'publish' | 'hide' | null>(null)
  const checklist = useChecklist(code)
  const track = trackOf(s)
  const tab = tabOf(s)
  const draft = tab === 'draft'
  const check = checkBadge(s)
  // 백엔드 checksOk 는 경고도 false 로 센다. 기록을 읽어 실패가 없고 경고만 있으면 확인 모달에서 묻지 않는다(읽는 동안엔 실패로 본다)
  const report = useGenReport(code, check === 'fail')
  const counts = report.state === 'ready' ? countChecks(report.data.checks ?? []) : null
  const warnOnly = counts !== null && counts.fail === 0 && counts.warn > 0
  const checkFailed = check === 'fail' && !warnOnly

  const tabs: Tab[] = track === 'BIZ' ? ['overview', 'files', 'materials', 'questions', 'report'] : ['overview', 'files', 'report']
  const asked = params.get('tab') as Tab | null
  const cur: Tab = asked && tabs.includes(asked) ? asked : 'overview'

  const change = async (open: boolean) => {
    setBusy(true)
    try {
      setSummary(await setPublished(s.id, open))
      toast.show(!open ? '숨겼어요. 검수 전으로 돌아갔어요' : s.usage === 'LIVE' ? '실전으로 올렸어요. 회차에서 고를 수 있어요' : '자가진단으로 올렸어요. 자가진단에 나와요')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '바꾸지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  const publishLabel = s.usage === 'LIVE' ? '실전으로 올리기' : '자가진단으로 올리기'
  const nextText = draft
    ? checklist.done < REVIEW_CHECKS.length
      ? `내용을 읽고 체크리스트(${checklist.done}/${REVIEW_CHECKS.length})를 채운 뒤 올리세요.`
      : '체크리스트를 모두 확인했어요. 이제 올려도 좋아요.'
    : isClosed(s)
      ? '내린 과제예요. 목록에는 남지만 새 응시는 막혀 있어요.'
      : s.usage === 'LIVE'
        ? '회차를 만들 때 고를 수 있어요. 자가진단에는 보이지 않아요.'
        : '누구나 자가진단에서 풀 수 있어요.'

  return (
    <>
      <div className="flex flex-col gap-5 px-8 pt-6 pb-12">
        <Link to="/console/tasks" className="inline-flex w-fit items-center gap-1 text-[14px] font-semibold text-text-muted hover:text-text">
          <ArrowLeft size={15} aria-hidden /> 과제 목록
        </Link>
        <ConsoleHero
          label="과제 요약"
          badge={
            <>
              <TaskStatusBadge task={s} stage />
              {s.generated && <AiBadge />}
              {check && <CheckBadge result={check} />}
            </>
          }
          title={s.title}
          meta={
            <>
              <span>{s.id}</span>
              <HeroSep />
              <span>{TRACK_LABEL[track]}</span>
              {s.difficulty && (
                <>
                  <HeroSep />
                  <span>{levelLabel(s.difficulty)}</span>
                </>
              )}
              {madeAt(s) && (
                <>
                  <HeroSep />
                  <span>만든 날 {fmtTime(madeAt(s)!)}</span>
                </>
              )}
              {s.publishedAt && (
                <>
                  <HeroSep />
                  <span>공개 {fmtTime(s.publishedAt)}</span>
                </>
              )}
            </>
          }
          stats={[
            { label: 'MINUTES', value: s.minutes, unit: '분' },
            { label: 'REQUIREMENTS', value: d.requirements.length, unit: '개' },
            { label: 'CHECKLIST', value: checklist.done, unit: `/ ${REVIEW_CHECKS.length}`, tone: checklist.done === REVIEW_CHECKS.length ? 'signal' : undefined },
          ]}
        />

        <Glass className="stage-scope flex flex-wrap items-center gap-x-8 gap-y-5 rounded-2xl px-6 py-5">
          <StatusFlow tab={tab} usage={s.usage} />
          {draft && <UsageToggle task={s} onChanged={setSummary} />}
          <div className="ml-auto flex min-w-[260px] flex-col items-end gap-2">
            <p className="text-right text-[14px] font-semibold break-keep text-text-muted" aria-live="polite">
              {nextText}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <a
                href={`/console/tasks/${encodeURIComponent(s.id)}/preview`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-line-strong bg-panel px-5 text-[15px] font-semibold text-text transition-colors hover:border-text-muted hover:bg-panel-raised"
              >
                <Eye size={16} aria-hidden /> 응시자로 보기
              </a>
              {s.status === 'HIDDEN' ? (
                <Magnetic>
                  <Button
                    variant="primary"
                    size="lg"
                    disabled={busy}
                    onClick={() => (checklist.done < REVIEW_CHECKS.length || checkFailed ? setConfirm('publish') : void change(true))}
                    className="h-11 rounded-full px-6"
                  >
                    <Rocket size={17} aria-hidden /> {publishLabel}
                  </Button>
                </Magnetic>
              ) : (
                <Button variant="danger" size="lg" disabled={busy} onClick={() => setConfirm('hide')} className="h-11 rounded-full px-5">
                  <EyeOff size={16} aria-hidden /> 숨기기
                </Button>
              )}
            </div>
          </div>
        </Glass>

        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-4">
            <PillTabs
              id="task-review-tabs"
              label="검수 탭"
              value={cur}
              onChange={(t) => setParams((p) => (p.set('tab', t), p), { replace: true })}
              tabs={tabs.map((t) => ({ value: t, label: TAB_NAME[t] }))}
            />
            <div key={cur} className="step-in min-w-0">
              {cur === 'overview' && <OverviewTab definition={d} />}
              {cur === 'files' && <FilesTab code={code} definition={d} />}
              {cur === 'materials' && <PdfViewer code={code} />}
              {cur === 'questions' && <QuestionsTab code={code} />}
              {cur === 'report' && <GenReportTab code={code} />}
            </div>
          </div>
          <aside className="xl:sticky xl:top-6">
            <ReviewChecklist state={checklist} />
          </aside>
        </div>
      </div>

      {confirm === 'hide' && (
        <ConfirmModal
          title="이 과제를 숨길까요?"
          danger
          confirm="숨기기"
          disabled={busy}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null)
            void change(false)
          }}
          body={<>「{s.title}」이 검수 전으로 돌아가 {s.usage === 'LIVE' ? '회차 만들기' : '자가진단 과제 목록'}에서 사라집니다. 지난 응시 기록은 그대로 남아요.</>}
        />
      )}
      {confirm === 'publish' && (
        <ConfirmModal
          title="아직 확인하지 않은 것이 있어요"
          confirm={publishLabel}
          disabled={busy}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null)
            void change(true)
          }}
          body={
            <>
              {checkFailed && <>자동 확인에서 실패한 항목이 있어요. </>}
              {checklist.done < REVIEW_CHECKS.length && <>체크리스트를 {checklist.done}/{REVIEW_CHECKS.length}개만 확인했어요. </>}
              그래도 {s.usage === 'LIVE' ? '실전' : '자가진단'}으로 올릴까요?
            </>
          }
        />
      )}
      {toast.node}
    </>
  )
}
