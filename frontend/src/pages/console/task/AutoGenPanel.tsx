// 자동 생성 탭: 폼(직군·시간·용도·개수·방식·마감) → 주제 미리보기(빼기·다시 받기) → 만들기.
// 만들기를 누르면 작업이 서버 대기열에 들어가고, 부모가 '만드는 중인 과제' 페이지로 보낸다(onStarted 에 만든 작업 번호들).
// 틀은 직접 만들기와 같다: 위 단계 표시, 왼쪽 유리 폼, 오른쪽 고른 값 요약(GenFrame).
import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowRight, CircleAlert, FilePlus2, RefreshCw, Sparkles, X, Zap } from 'lucide-react'
import { Button } from '../../../components/ui'
import { cx } from '../../../components/cx'
import {
  AUTO_COUNT_MAX,
  AUTO_COUNT_MIN,
  DEFAULT_AUTO,
  autoRequest,
  clampCount,
  previewRequest,
  removeTopic,
  rerollExclude,
  startErrorMessage,
  suggestErrorMessage,
  taskGenApi,
  type AutoForm,
  type AutoTopic,
  type GenTrack,
} from '../../../data/taskGen'
import { distance, springs, useShouldAnimate } from '../../../lib/motion'
import { GEN_CARD, TRACKS, inputCls } from './formConsts'
import { CostEstimateLine } from './CostEstimateLine'
import { FlowSteps } from './FlowSteps'
import { GenFrame, GenSummary, type SummaryRow } from './GenFrame'
import { Field, MinutesPicker, ModePicker, TrackPicker, UsagePicker } from './formParts'
import { CompetencyChips } from './SuggestPanel'

type Phase = 'form' | 'preview'

const AUTO_FLOW = ['설정', '주제 확인', '만들기'] as const

export function AutoGenPanel({ onStarted }: { onStarted: (jobIds: string[]) => void }) {
  const [track, setTrack] = useState<GenTrack | null>(null)
  const [rest, setRest] = useState(DEFAULT_AUTO)
  const [countText, setCountText] = useState(String(DEFAULT_AUTO.count))
  const [tried, setTried] = useState(false)
  const [phase, setPhase] = useState<Phase>('form')
  const [topics, setTopics] = useState<AutoTopic[]>([])
  const [seen, setSeen] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const animate = useShouldAnimate({ essential: true })
  const seq = useRef(0)

  const count = clampCount(countText)
  const form: AutoForm | null = track ? { ...rest, track, count } : null
  const set = <K extends keyof typeof rest>(k: K, v: (typeof rest)[K]) => setRest((r) => ({ ...r, [k]: v }))

  /** 주제 받기: 처음 받기(exclude 없음)와 다시 받기(지금까지 본 상황을 exclude 로) 모두 이 함수 */
  const fetchTopics = async (exclude: string[]) => {
    if (!form || loading) return
    const my = ++seq.current
    setLoading(true)
    setError(null)
    try {
      const got = await taskGenApi.preview(previewRequest(form, exclude))
      if (my !== seq.current) return
      setTopics(got)
      setSeen(rerollExclude(exclude, got))
      setPhase('preview')
    } catch (e) {
      if (my === seq.current) setError(suggestErrorMessage(e))
    } finally {
      if (my === seq.current) setLoading(false)
    }
  }

  const preview = () => {
    setTried(true)
    if (!form) return
    setCountText(String(count))
    void fetchTopics([])
  }

  /** topics 를 보내 만들거나(이대로 만들기), 보내지 않고 서버가 고르게 한다(건너뛰고 바로 만들기) */
  const start = async (withTopics: boolean) => {
    setTried(true)
    if (!form || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await taskGenApi.startAuto(autoRequest(form, withTopics ? topics : null))
      setPhase('form')
      setTopics([])
      setSeen([])
      onStarted(res.jobIds)
    } catch (e) {
      setError(startErrorMessage(e))
    } finally {
      setSending(false)
    }
  }

  const backToForm = () => {
    seq.current++
    setLoading(false)
    setPhase('form')
    setSeen([])
  }

  const summary: SummaryRow[] = [
    { label: '직군', value: TRACKS.find((t) => t.value === track)?.title ?? null },
    { label: '제한 시간', value: `${rest.minutes}분` },
    { label: '용도', value: rest.usage === 'LIVE' ? '실전' : '자가진단' },
    { label: '개수', value: phase === 'preview' ? `${topics.length}개` : `${count}개` },
    { label: '방식', value: rest.mode === 'BATCH' ? `배치 · 마감 ${rest.batchDeadlineHours}시간` : '바로 만들기' },
  ]
  const flow = (
    <div className="mx-auto mb-5 w-full max-w-[1180px]">
      <FlowSteps at={phase === 'preview' ? 1 : 0} names={AUTO_FLOW} />
    </div>
  )
  const aside = (
    <GenSummary rows={summary}>
      {phase === 'preview' && topics.length > 0 && (
        <div className="mt-5 rounded-xl border border-stage-line bg-stage-raised/70 p-4">
          <p className="text-[13px] font-bold text-stage-muted">
            주제 미리보기 · <span className="tnum font-mono">{topics.length}</span>개
          </p>
          <p className="mt-1 text-[15px] leading-6 font-bold break-keep text-stage-text">{topics[0]?.situation}</p>
          {topics.length > 1 && <p className="mt-1 text-[13px] text-stage-muted">외 {topics.length - 1}개</p>}
        </div>
      )}
    </GenSummary>
  )

  const errBox = error && (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-alert/30 bg-alert/8 px-4 py-3 text-[14px] leading-6 break-keep text-text">
      <CircleAlert size={18} className="mt-0.5 shrink-0 text-alert" aria-hidden /> {error}
    </p>
  )

  if (phase === 'preview' && form) {
    return (
      <>
      {flow}
      <GenFrame aside={aside}>
      <section aria-labelledby="auto-preview-title" className={GEN_CARD}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="auto-preview-title" className="flex items-center gap-2 text-[20px] font-extrabold tracking-[-0.01em] text-text">
              <Sparkles size={20} className="text-brand" aria-hidden /> 주제 미리보기
            </h2>
            <p className="mt-1 text-[14px] break-keep text-text-muted">
              마음에 안 드는 주제는 빼세요. 남은 <span className="tnum font-mono font-bold text-text">{topics.length}</span>개로 만들어요.
            </p>
          </div>
          <Button variant="ghost" onClick={() => void fetchTopics(seen)} disabled={loading}>
            <RefreshCw size={16} aria-hidden className={loading ? 'animate-spin' : undefined} /> 다시 받기
          </Button>
        </div>

        {errBox}

        <div aria-busy={loading} className={cx('transition-opacity duration-150', loading && 'opacity-60')}>
          {topics.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong px-5 py-8 text-center text-[14px] text-text-muted">
              주제를 모두 뺐어요. 다시 받거나, 건너뛰고 서버가 고르게 하세요.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <AnimatePresence initial={false} mode="popLayout">
                {topics.map((t) => (
                  <motion.li
                    key={t.situation}
                    layout={animate ? 'position' : false}
                    initial={animate ? { opacity: 0, y: distance.app / 2 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    exit={animate ? { opacity: 0, scale: 0.97 } : undefined}
                    transition={springs.snappy}
                  >
                    <TopicCard t={t} onRemove={() => setTopics((cur) => removeTopic(cur, t.situation))} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>

        <CostEstimateLine query={{ track: form.track, minutes: form.minutes, mode: form.mode, count: Math.max(1, topics.length) }} />

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-6">
          <Button variant="ghost" onClick={backToForm} className="mr-auto">
            <ArrowLeft size={16} aria-hidden /> 설정 고치기
          </Button>
          <Button variant="ghost" onClick={() => void start(false)} disabled={sending}>
            건너뛰고 바로 만들기
          </Button>
          <Button variant="primary" size="lg" onClick={() => void start(true)} disabled={sending || topics.length === 0}>
            <FilePlus2 size={18} aria-hidden /> 이대로 만들기
          </Button>
        </div>
      </section>
      </GenFrame>
      </>
    )
  }

  return (
    <>
    {flow}
    <GenFrame aside={aside}>
    <form
      noValidate
      aria-label="자동 생성"
      onSubmit={(e) => {
        e.preventDefault()
        preview()
      }}
      className={GEN_CARD}
    >
      <p className="-mb-2 text-[14px] break-keep text-text-muted">직군과 시간만 정하면 AI가 서로 다른 주제로 과제를 여러 개 한 번에 만들어요.</p>

      {errBox}

      <Field n={1} title="직군" error={tried && !track ? '직군을 고르세요' : null}>
        <TrackPicker value={track} onChange={setTrack} />
      </Field>

      <Field n={2} title="시간과 용도">
        <div className="flex flex-wrap items-start gap-x-10 gap-y-5">
          <MinutesPicker value={rest.minutes} onChange={(m) => set('minutes', m)} />
          <UsagePicker value={rest.usage} onChange={(u) => set('usage', u)} />
        </div>
      </Field>

      <Field n={3} title="개수" hint={`${AUTO_COUNT_MIN}~${AUTO_COUNT_MAX}개. 동시에 도는 작업이 많으면 차례를 기다려요.`}>
        <input
          aria-label="개수"
          type="number"
          inputMode="numeric"
          min={AUTO_COUNT_MIN}
          max={AUTO_COUNT_MAX}
          value={countText}
          onChange={(e) => setCountText(e.target.value)}
          onBlur={() => setCountText(String(clampCount(countText)))}
          className={cx(inputCls, 'tnum h-11 w-28 font-mono')}
        />
      </Field>

      <Field n={4} title="방식">
        <ModePicker mode={rest.mode} hours={rest.batchDeadlineHours} onMode={(m) => set('mode', m)} onHours={(h) => set('batchDeadlineHours', h)} />
      </Field>

      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-line pt-6">
        {form && <div className="mr-auto"><CostEstimateLine query={{ track: form.track, minutes: form.minutes, mode: form.mode, count: form.count }} /></div>}
        <Button variant="ghost" onClick={() => void start(false)} disabled={sending || loading}>
          미리보기 없이 바로 만들기
        </Button>
        <Button type="submit" variant="primary" size="lg" disabled={loading}>
          {loading ? '주제를 받는 중…' : (
            <>
              주제 미리보기 <ArrowRight size={17} aria-hidden />
            </>
          )}
        </Button>
      </div>
    </form>
    </GenFrame>
    </>
  )
}

function TopicCard({ t, onRemove }: { t: AutoTopic; onRemove: () => void }) {
  return (
    <article className="flex h-full flex-col gap-3 rounded-2xl border border-line bg-panel p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-brand/30 bg-brand-dim px-2.5 text-[13px] font-bold">
          <Zap size={13} aria-hidden className="shrink-0 text-brand" fill="currentColor" />
          <span className="text-brand-gradient truncate">{t.trapType || '함정'}</span>
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${t.situation} 빼기`}
          className="inline-flex h-10 items-center gap-1 rounded-lg px-2.5 text-[13px] font-semibold text-text-muted transition-colors duration-150 outline-none hover:bg-alert/10 hover:text-alert focus-visible:ring-4 focus-visible:ring-brand/30"
        >
          <X size={14} aria-hidden /> 빼기
        </button>
      </div>
      <p className="text-[16px] leading-6 font-bold break-keep text-balance text-text">{t.situation}</p>
      <div className="mt-auto flex flex-col gap-1 rounded-xl bg-panel-raised p-3">
        <span className="text-[12px] font-bold text-text-muted">함정</span>
        <span className="text-[14px] leading-6 font-medium break-keep text-pretty text-text">{t.trap}</span>
      </div>
      <CompetencyChips keys={t.competencies} />
    </article>
  )
}
