// AI 추천 받기 (과제 만들기 ① 아이디어). 직군을 고르면 켜진다.
// 누르면 반짝이는 자리 3개 → 추천 카드 3개(함정 종류 칩, 주제, 함정, 왜 좋은지). 카드를 누르면 onPick.
// "다시 추천"은 앞서 받은 주제를 exclude 로 보내 겹치지 않게 한다.
import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, CircleAlert, Lightbulb, RefreshCw, Sparkles, Wand2 } from 'lucide-react'
import { cx } from '../../../components/cx'
import { Button, Sep } from '../../../components/ui'
import { distance, duration, easing, stagger } from '../../../lib/motion'
import { nextExclude, suggestErrorMessage, suggestRequest, taskGenApi, type GenDifficulty, type GenTrack, type Suggestion } from '../../../data/taskGen'

type Props = {
  track: GenTrack | null
  jobRole: string
  difficulty: GenDifficulty
  onPick: (s: Suggestion) => void
}

export function SuggestPanel({ track, jobRole, difficulty, onPick }: Props) {
  const [items, setItems] = useState<Suggestion[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const exclude = useRef<string[]>([])
  const seq = useRef(0)

  const ask = async (again: boolean) => {
    if (!track || loading) return
    if (!again) exclude.current = []
    const my = ++seq.current
    setLoading(true)
    setError(null)
    try {
      const res = await taskGenApi.suggest(suggestRequest({ track, jobRole, difficulty }, exclude.current))
      if (my !== seq.current) return
      const got = res.suggestions ?? []
      exclude.current = nextExclude(exclude.current, got)
      setItems(got)
      setPicked(null)
    } catch (e) {
      if (my === seq.current) setError(suggestErrorMessage(e))
    } finally {
      if (my === seq.current) setLoading(false)
    }
  }

  return (
    <section aria-labelledby="suggest-title" className="relative overflow-hidden rounded-2xl border border-brand/20 bg-[linear-gradient(135deg,rgb(139_92_246/0.08),rgb(255_255_255/0.6)_45%,rgb(47_91_234/0.07))] p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="bg-brand-gradient inline-flex size-10 items-center justify-center rounded-xl text-on-accent shadow-[0_8px_20px_-8px_rgb(108_71_255/0.8)]" aria-hidden>
          <Wand2 size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="suggest-title" className="text-[16px] font-bold text-text">
            아이디어가 없나요? AI에게 추천받아요
          </h2>
          <p className="text-[13px] font-medium break-keep text-text-muted">
            {track ? '직무를 적어 두면 그 직무에 맞춰 추천해요. 카드를 누르면 아래 칸이 채워져요.' : '먼저 직군을 고르면 추천을 받을 수 있어요.'}
          </p>
        </div>
        {items && items.length > 0 ? (
          <Button variant="secondary" disabled={!track || loading} onClick={() => void ask(true)}>
            <RefreshCw size={15} aria-hidden className={loading ? 'animate-spin' : undefined} /> 다시 추천
          </Button>
        ) : (
          <Button variant="primary" disabled={!track || loading} onClick={() => void ask(false)}>
            <Sparkles size={16} aria-hidden /> {loading ? '추천 만드는 중' : 'AI 추천 받기'}
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-alert/30 bg-panel px-3 py-2 text-[14px] leading-6 break-keep text-text">
          <CircleAlert size={17} className="mt-0.5 shrink-0 text-alert" aria-hidden /> {error}
        </p>
      )}

      <div aria-live="polite" aria-busy={loading}>
        {loading ? (
          <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3" aria-label="추천을 만드는 중">
            {[0, 1, 2].map((i) => (
              <li key={i} className="shimmer flex h-[188px] flex-col gap-3 rounded-xl border border-line bg-panel p-4">
                <span className="h-5 w-16 rounded-full bg-panel-raised" />
                <span className="h-5 w-4/5 rounded bg-panel-raised" />
                <span className="h-4 w-full rounded bg-panel-raised" />
                <span className="h-4 w-2/3 rounded bg-panel-raised" />
              </li>
            ))}
          </ul>
        ) : (
          items && (
            <>
              {items.length === 0 && <p className="mt-4 text-[14px] text-text-muted">추천이 비어 있어요. 다시 눌러 보세요.</p>}
              <AnimatePresence mode="popLayout">
                <ul key={items.map((s) => s.topic).join('|')} className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                  {items.map((s, i) => (
                    <motion.li
                      key={s.topic}
                      initial={{ opacity: 0, y: distance.app, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: duration.slow, ease: easing.expo, delay: i * stagger.normal * 2 }}
                      className="flex"
                    >
                      <SuggestCard s={s} on={picked === s.topic} onPick={() => (setPicked(s.topic), onPick(s))} />
                    </motion.li>
                  ))}
                </ul>
              </AnimatePresence>
            </>
          )
        )}
      </div>
    </section>
  )
}

function SuggestCard({ s, on, onPick }: { s: Suggestion; on: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      className={cx(
        'group flex w-full flex-col gap-2 rounded-xl border bg-panel p-4 text-left shadow-sm transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-1 hover:shadow-md',
        on ? 'border-brand ring-2 ring-brand/25' : 'border-line hover:border-brand/40',
      )}
    >
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex h-[22px] items-center rounded-full bg-alert/8 px-2 text-[12px] font-semibold text-alert">{s.trapType || '함정'}</span>
        <span className="inline-flex items-center gap-2 text-[12px] font-semibold text-text-muted">
          {s.jobRole}
          <Sep />
          {s.difficulty}
        </span>
      </span>
      <span className="text-[16px] leading-6 font-bold break-keep text-text group-hover:text-brand">{s.topic}</span>
      <span className="line-clamp-3 text-[13px] leading-5 break-keep text-text-muted">
        <b className="font-semibold text-text">함정 </b>
        {s.trap}
      </span>
      {s.why && (
        <span className="mt-auto flex gap-1.5 rounded-lg bg-panel-raised/70 px-2.5 py-2 text-[12px] leading-[18px] break-keep text-text-muted">
          <Lightbulb size={14} className="mt-0.5 shrink-0 text-caution" aria-hidden />
          {s.why}
        </span>
      )}
      <span className={cx('flex items-center gap-1 text-[13px] font-semibold', on ? 'text-brand' : 'text-text-faint group-hover:text-brand')}>
        {on ? '채웠어요' : '이걸로 채우기'} <ArrowRight size={14} aria-hidden />
      </span>
    </button>
  )
}
