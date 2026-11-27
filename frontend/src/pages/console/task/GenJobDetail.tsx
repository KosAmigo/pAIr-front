// 만드는 중인 과제 상세 (오른쪽). 한 작업의 ① 폼 정보 ② 진행 단계 ③ 만들어진 내용(단계별로 접었다 펼침) ④ 관문 검사 ⑤ 끝나면 검수·미리보기 링크.
// 만들어진 내용은 content API(GET /task-gen/{id}/content)에서 오고, 아직 안 나온 단계는 '아직 만들지 않았어요'로 둔다.
// 결함·숨은 테스트는 관리자만 보는 정보라 '검수용' 배지를 붙인다.
import { ArrowLeft, ArrowRight, Check, CircleAlert, Eye, Lock } from 'lucide-react'
import { cx } from '../../../components/cx'
import { StageSection } from '../../../components/fx'
import { TRACK_ICON, USAGE_ICON } from '../../../components/domainIcons'
import { ButtonLink } from '../../../components/ui'
import { genDetail, jobView, reviewHref, toGenStep, type GenTrack, type JobRow, type TaskGenJob } from '../../../data/taskGen'
import { contentSections, modeLabel, type ContentSection } from '../../../data/taskGenJobs'
import { RequirementsView } from '../../../components/RequirementsView'
import { CheckTable } from './CheckTable'
import { TONE } from './formConsts'
import { GenStages } from './GenProgress'
import { useGenJobDetail } from './useGenJobDetail'

export function GenJobDetail({ jobId, row, onBack }: { jobId: string; row: JobRow | null; onBack: () => void }) {
  const detail = useGenJobDetail(jobId)
  const job: (TaskGenJob & Partial<JobRow>) | null = detail?.job ? { ...row, ...detail.job } : row
  const content = detail?.content ?? null
  const form = content?.form
  const track: GenTrack | null = form?.track ?? job?.track ?? null
  const topic = form?.topic?.trim() || job?.topic?.trim() || '주제를 정하는 중'
  const trap = form?.trap?.trim() || job?.trap?.trim() || null
  const minutes = form?.minutes ?? job?.minutes ?? null
  const usage = form?.usage ?? job?.usage ?? null
  const mode = form?.mode ?? job?.mode ?? null
  const v = job ? jobView({ ...job, jobId, checks: job.checks ?? [] } as JobRow) : null
  const sections = contentSections(content, track)
  const TrackIcon = track ? TRACK_ICON[track] : null

  return (
    <section aria-label="작업 상세" className="flex min-w-0 flex-col gap-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex h-10 w-fit items-center gap-1.5 rounded-lg px-2 text-[14px] font-semibold text-text-muted outline-none hover:text-text focus-visible:ring-4 focus-visible:ring-brand/30 lg:hidden"
      >
        <ArrowLeft size={16} aria-hidden /> 목록으로
      </button>

      <header className="flex flex-wrap items-start gap-3">
        {TrackIcon && (
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-panel-raised text-text-muted" aria-hidden>
            <TrackIcon size={22} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="label text-brand">JOB</p>
          <h2 className="mt-0.5 text-[22px] leading-8 font-extrabold tracking-[-0.02em] break-keep text-text">{topic}</h2>
        </div>
        {v && (
          <span key={v.label} className={cx('fade-in inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-bold', TONE[v.tone])}>
            {v.tone === 'run' && <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-current" />}
            {v.label}
          </span>
        )}
      </header>

      {detail?.error && !detail.job && !row && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-alert/30 bg-alert/8 px-4 py-3 text-[14px] leading-6 break-keep text-text">
          <CircleAlert size={18} className="mt-0.5 shrink-0 text-alert" aria-hidden /> 작업을 불러오지 못했어요. {detail.error}
        </p>
      )}

      {/* ① 폼 정보 */}
      <dl aria-label="만들 때 정한 내용" className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-2xl border border-line bg-panel p-5 sm:grid-cols-2">
        <Info label="주제" wide>
          {topic}
        </Info>
        {trap && (
          <Info label="함정" wide>
            {trap}
          </Info>
        )}
        <Info label="직군">{track === 'DEV' ? '개발' : track === 'BIZ' ? '비개발' : null}</Info>
        <Info label="제한 시간">{minutes ? <><span className="tnum font-mono">{minutes}</span>분</> : null}</Info>
        <Info label="용도">
          {usage ? (
            <span className="inline-flex items-center gap-1.5">
              {usage === 'LIVE' ? <USAGE_ICON.LIVE size={14} aria-hidden /> : <USAGE_ICON.SELF size={14} aria-hidden />}
              {usage === 'LIVE' ? '실전' : '자가진단'}
            </span>
          ) : null}
        </Info>
        <Info label="방식">{mode ? modeLabel(mode, job?.deadlineAt) : null}</Info>
      </dl>

      {/* ② 진행 단계 */}
      {job && (
        <StageSection aria-label="진행 단계" className="px-5 py-5">
          <div className="flex flex-col gap-6" aria-live="polite">
            {job.status === 'QUEUED' || job.status === 'CANCELED' ? (
              <p className="text-[15px] font-semibold break-keep text-stage-text">
                {job.status === 'CANCELED' ? '취소한 작업이에요. 만들어진 것은 없어요.' : `${v?.label ?? '대기 중'} · 앞 작업이 끝나면 시작해요.`}
              </p>
            ) : (
              <GenStages
                step={toGenStep(job.step, job.step === '다시 생성 중')}
                detail={job.waitingBatch ? '배치 결과를 기다리고 있어요' : genDetail(job.step, track ?? 'DEV')}
                retried={job.step === '다시 생성 중'}
                track={track ?? 'DEV'}
                finished={job.status === 'DONE'}
              />
            )}
          </div>
        </StageSection>
      )}

      {job?.status === 'FAILED' && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-alert/30 bg-alert/8 px-4 py-3 text-[14px] leading-6 break-words text-text">
          <CircleAlert size={18} className="mt-0.5 shrink-0 text-alert" aria-hidden /> {job.error ?? '과제를 만들지 못했어요. 이유를 알 수 없어요.'}
        </p>
      )}

      {/* ③ 만들어진 내용 */}
      <section aria-labelledby="gen-content-title" className="flex flex-col gap-3">
        <h3 id="gen-content-title" className="text-[16px] font-extrabold text-text">
          만들어진 내용
        </h3>
        {detail?.contentError && !content && <p className="text-[13px] break-keep text-text-muted">만들어진 내용을 아직 불러오지 못했어요.</p>}
        <ul className="flex flex-col gap-2">
          {sections.map((s) => (
            <li key={s.key}>
              <Section s={s} />
            </li>
          ))}
        </ul>
      </section>

      {/* ④ 관문 검사 */}
      {job && (job.checks?.length ?? 0) > 0 && <CheckTable checks={job.checks} />}

      {/* ⑤ 끝나면 */}
      {job?.status === 'DONE' && job.taskCode && (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-5">
          <ButtonLink to={`/console/tasks/${encodeURIComponent(job.taskCode)}/preview`} variant="secondary">
            <Eye size={16} aria-hidden /> 미리보기
          </ButtonLink>
          <ButtonLink to={reviewHref(job.taskCode)} variant="primary" size="lg">
            검수하기 <ArrowRight size={16} aria-hidden />
          </ButtonLink>
        </div>
      )}
    </section>
  )
}

function Info({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={cx('flex items-start gap-3 border-b border-line pb-2.5 text-[15px] last:border-b-0', wide && 'sm:col-span-2')}>
      <dt className="w-16 shrink-0 pt-0.5 text-[13px] font-semibold text-text-muted">{label}</dt>
      <dd className={cx('min-w-0 leading-6 break-keep', children ? 'font-semibold text-text' : 'text-text-faint')}>{children || '-'}</dd>
    </div>
  )
}

const ReviewBadge = () => (
  <span className="inline-flex h-5 items-center gap-1 rounded-full bg-caution/15 px-2 text-[12px] font-bold text-caution">
    <Lock size={11} aria-hidden /> 검수용
  </span>
)

/** 단계 하나: 나왔으면 접었다 펼치는 목록, 아직이면 자리 표시 */
function Section({ s }: { s: ContentSection }) {
  if (!s.ready) {
    return (
      <div className="flex min-h-12 items-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-3 text-[14px] text-text-muted">
        <span className="font-bold">{s.title}</span>
        {s.adminOnly && <ReviewBadge />}
        <span className="ml-auto">아직 만들지 않았어요</span>
      </div>
    )
  }
  return (
    <details open={s.key === 'blueprint'} className="group rounded-xl border border-line bg-panel">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-[15px] outline-none focus-visible:ring-4 focus-visible:ring-brand/30 [&::-webkit-details-marker]:hidden">
        <Check size={16} strokeWidth={3} className="text-signal" aria-hidden />
        <span className="font-bold text-text">{s.title}</span>
        {s.adminOnly && <ReviewBadge />}
        <span className="ml-auto text-[13px] text-text-muted group-open:hidden">펼치기</span>
        <span className="ml-auto hidden text-[13px] text-text-muted group-open:inline">접기</span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-line px-4 py-4">
        {s.blocks.length === 0 && <p className="text-[14px] text-text-muted">나온 내용이 아직 없어요.</p>}
        {s.blocks.map((b) => (
          <div key={b.label}>
            <p className="flex items-center gap-2 text-[13px] font-bold text-text-muted">
              {b.label}
              {b.adminOnly && <ReviewBadge />}
            </p>
            {b.label === '요구사항' ? (
              <RequirementsView lines={b.lines} className="mt-1.5" />
            ) : b.lines.length === 1 ? (
              <p className="mt-1 text-[14px] leading-6 break-keep text-text">{b.lines[0]}</p>
            ) : (
              <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-[14px] leading-6 break-keep text-text">
                {b.lines.map((l, i) => (
                  <li key={`${i}-${l}`}>{l}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </details>
  )
}
