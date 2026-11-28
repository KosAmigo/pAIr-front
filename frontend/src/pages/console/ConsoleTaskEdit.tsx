// DESIGN.md §7-9-3 과제 검수 (ADMIN). 2026-11-20 개편.
// 위: 스포트라이트 머리(상태 배지, 제목, 수치) → 상태 흐름(검수 전 → 자가진단/실전) + 용도 토글(검수 전만) + 주인공 버튼.
// 아래: 알약 탭(개요, 파일, 자료, 문항, 자동 확인 결과) (오른쪽 체크리스트 없음).
// 내용 편집은 백엔드 API 가 없어 읽기 전용이다. 공개·숨기기·용도 바꾸기만 한다.
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, Loader2, Rocket } from 'lucide-react'
import { levelLabel } from '../../components/taskKind'
import { ErrorState } from '../../components/ErrorState'
import { useConsoleCrumbs } from '../../components/consoleCrumbs'
import { Magnetic } from '../../components/fx'
import { Button } from '../../components/ui'
import type { ConsoleTaskSummary } from '../../consoleApi'
import { setPublished, useTaskDetail } from '../../data/consoleTasks'
import { countChecks } from '../../data/taskGen'
import { useGenReport } from '../../data/taskReview'
import { checkBadge, madeAt, tabOf, trackOf, TRACK_LABEL } from '../../data/taskBoard'
import { ConfirmModal } from './common'
import { ConsoleHero, HeroSep, PillTabs } from './ConsoleHero'
import { fmtTime, useToast } from './format'
import { AiBadge, CheckBadge } from './task/badges'
import { PdfViewer } from './task/PdfViewer'
import { FilesTab, GenReportTab, OverviewTab, QuestionsTab } from './task/ReviewTabs'
import { HeroStatus } from './task/HeroStatus'
import { parseRequirements } from '../../data/requirements'

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

  return (
    <>
      <div className="flex flex-col gap-5 px-8 pt-8 pb-12">
        <ConsoleHero
          label="과제 요약"
          badge={
            (s.generated || check) && (
              <>
                {s.generated && <AiBadge />}
                {check && <CheckBadge result={check} />}
              </>
            )
          }
          centerStats
          title={s.title}
          meta={
            <>
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
            // 만들 기능·매개변수 줄까지 세면 부풀어서, 기능 수 + 예시 수(옛 형식이면 예시·글 줄)로 센다
            { label: 'REQUIREMENTS', value: ((r) => r.features.length + r.examples.length + r.tables.reduce((n, t) => n + t.rows.length, 0) + r.other.length)(parseRequirements(d.requirements)), unit: '개' },
          ]}
          actions={
            <div className="flex flex-col items-end gap-4">
              <HeroStatus task={s} draft={draft} onChanged={setSummary} />
              <div className="flex items-center justify-end gap-2">
                <a
                  href={`/console/tasks/${encodeURIComponent(s.id)}/preview`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-stage-line-strong px-5 text-[15px] font-semibold text-stage-text transition-colors hover:bg-white/10"
                >
                  <Eye size={16} aria-hidden /> 응시자로 보기
                </a>
                {s.status === 'HIDDEN' ? (
                  <Magnetic>
                    <Button variant="primary" size="lg" disabled={busy} onClick={() => (checkFailed ? setConfirm('publish') : void change(true))} className="!h-10 w-[204px] justify-center rounded-full px-6">
                      <Rocket size={17} aria-hidden /> {publishLabel}
                    </Button>
                  </Magnetic>
                ) : (
                  <Button variant="danger" size="lg" disabled={busy} onClick={() => setConfirm('hide')} className="!h-10 rounded-full px-5">
                    <EyeOff size={16} aria-hidden /> 숨기기
                  </Button>
                )}
              </div>
            </div>
          }
        />

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
          title="자동 확인에서 실패한 항목이 있어요"
          confirm={publishLabel}
          disabled={busy}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null)
            void change(true)
          }}
          body={
            <>
              자동 확인 결과를 확인했나요? 그래도 {s.usage === 'LIVE' ? '실전' : '자가진단'}으로 올릴까요?
            </>
          }
        />
      )}
      {toast.node}
    </>
  )
}
