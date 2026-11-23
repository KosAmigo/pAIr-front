// AI 추천 받기 (과제 만들기 ③). 직군을 고르면 켜진다.
// 누르면 반짝이는 자리 3개 → 추천 카드 3개(함정 유형 칩 → 상황 → 함정 → 역량 칩 한 줄. why 는 마우스를 올리면 title). 카드를 누르면 onPick.
// 입력한 주제를 AI 가 다르게 이해했으면(topicCheck.ok=false) 카드 위에 확인 박스를 먼저 보여 준다.
// 받은 목록과 고른 카드는 부모(useSuggestions)가 직군별로 들고 있어서 직군을 바꿨다 돌아와도 그대로다.
import { AnimatePresence, motion } from 'motion/react'
import { Check, CircleAlert, Lightbulb, MessageCircleQuestion, RefreshCw } from 'lucide-react'
import { cx } from '../../../components/cx'
import { Button } from '../../../components/ui'
import { Spotlight } from '../../../components/fx'
import { STATS } from '../../../data/dashboard'
import { isAgain, needsTopicCheck, topicCheckText, visibleSuggestions, type GenTrack, type Suggestion, type TrackSuggest } from '../../../data/taskGen'
import { distance, duration, easing, stagger, useShouldAnimate } from '../../../lib/motion'

type Props = {
  track: GenTrack | null
  /** ②에 적은 주제 (없을 수 있다) */
  topic: string
  state: TrackSuggest | undefined
  loading: boolean
  error: string | null
  onAsk: () => void
  onPick: (s: Suggestion) => void
  onAcceptTopic: () => void
  onFixTopic: () => void
}

export function SuggestPanel({ track, topic, state, loading, error, onAsk, onPick, onAcceptTopic, onFixTopic }: Props) {
  const items = visibleSuggestions(state)
  const again = isAgain(state, topic)
  const animate = useShouldAnimate()
  const check = needsTopicCheck(state) ? state?.topicCheck : null
  return (
    <section aria-labelledby="suggest-title" className="relative overflow-hidden rounded-2xl border border-brand/20 bg-[linear-gradient(135deg,rgb(139_92_246/0.08),rgb(255_255_255/0.6)_45%,rgb(47_91_234/0.07))] p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="bg-brand-gradient inline-flex size-10 items-center justify-center rounded-xl text-on-accent shadow-[0_8px_20px_-8px_rgb(108_71_255/0.8)]" aria-hidden>
          <Lightbulb size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="suggest-title" className="text-[16px] font-bold text-text">
            아이디어가 없나요? AI에게 추천받아요
          </h2>
          <p className="text-[13px] font-medium break-keep text-text-muted">
            {track ? '위에 주제를 적어 두면 그 주제에 맞춰 추천해요. 카드를 누르면 아래 칸이 채워져요.' : '먼저 직군을 고르면 추천을 받을 수 있어요.'}
          </p>
        </div>
        <Button variant={again ? 'secondary' : 'primary'} disabled={!track || loading} onClick={onAsk}>
          {again && <RefreshCw size={15} aria-hidden className={loading ? 'animate-spin' : undefined} />}
          {loading ? '추천 만드는 중' : again ? '다시 추천' : '추천 받기'}
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-alert/30 bg-panel px-3 py-2 text-[14px] leading-6 break-keep text-text">
          <CircleAlert size={17} className="mt-0.5 shrink-0 text-alert" aria-hidden /> {error}
        </p>
      )}

      <div aria-live="polite" aria-busy={loading}>
        {loading ? (
          <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3" aria-label="추천을 만드는 중">
            {[0, 1, 2].map((i) => (
              <li key={i} className="shimmer flex min-h-[203px] flex-col gap-3 rounded-2xl border border-brand/20 bg-panel p-5">
                <span className="h-7 w-20 rounded-full bg-panel-raised" />
                <span className="h-5 w-4/5 rounded bg-panel-raised" />
                <span className="h-4 w-full rounded bg-panel-raised" />
                <span className="mt-auto h-6 w-28 rounded-full bg-panel-raised" />
              </li>
            ))}
          </ul>
        ) : (
          <>
            {check && state && (
              <div role="group" aria-label="주제 확인" className="mt-4 rounded-xl border border-caution/40 bg-caution/8 p-4">
                <p className="flex items-start gap-2 text-[15px] leading-6 font-semibold break-keep text-text">
                  <MessageCircleQuestion size={18} className="mt-0.5 shrink-0 text-caution" aria-hidden />
                  {topicCheckText(state.askedTopic, check)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="primary" onClick={onAcceptTopic}>
                    이대로 보기
                  </Button>
                  <Button variant="secondary" onClick={onFixTopic}>
                    주제 고치기
                  </Button>
                </div>
              </div>
            )}
            {items && (
              <>
                {items.length === 0 && <p className="mt-4 text-[14px] text-text-muted">추천이 비어 있어요. 다시 눌러 보세요.</p>}
                <AnimatePresence mode="popLayout">
                  <ul key={items.map((s) => s.situation).join('|')} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    {items.map((s, i) => (
                      <motion.li
                        key={s.situation}
                        initial={animate ? { opacity: 0, y: distance.app, scale: 0.97 } : false}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        whileHover={animate ? { y: -4 } : undefined}
                        transition={{ duration: duration.slow, ease: easing.expo, delay: i * stagger.normal * 2 }}
                        className="flex"
                      >
                        <SuggestCard s={s} on={state?.picked === s.situation} dim={!!state?.picked && state.picked !== s.situation} onPick={() => onPick(s)} />
                      </motion.li>
                    ))}
                  </ul>
                </AnimatePresence>
              </>
            )}
          </>
        )}
      </div>
    </section>
  )
}

/** 역량 칩: STATS 의 이름과 색을 옅게. 한 줄에 두고 넘치면 말줄임 */
function CompetencyChips({ keys }: { keys: string[] }) {
  const list = keys.map((k) => STATS.find((s) => s.key === k)).filter((s): s is (typeof STATS)[number] => !!s).slice(0, 2)
  return (
    <span className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden">
      {list.map((st) => (
        <span
          key={st.key}
          style={{ backgroundColor: `color-mix(in srgb, ${st.color} 12%, transparent)` }}
          className="inline-flex h-6 min-w-0 shrink items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold text-text"
        >
          <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: st.color }} />
          <span className="truncate">{st.name}</span>
        </span>
      ))}
    </span>
  )
}

/** 카드 전체가 누르는 곳. 위에서부터 함정 유형 → 상황 → 함정 → 역량. why 는 마우스를 올리면 title 로만 */
function SuggestCard({ s, on, dim, onPick }: { s: Suggestion; on: boolean; dim: boolean; onPick: () => void }) {
  return (
    <div
      className={cx(
        'group w-full rounded-2xl p-[1.5px] transition-[opacity,box-shadow,background-color] duration-300 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand/30',
        on
          ? 'bg-brand-gradient shadow-[0_14px_32px_-14px_rgb(108_71_255/0.65)]'
          : 'bg-[linear-gradient(135deg,rgb(108_71_255/0.28),rgb(47_91_234/0.1)_55%,rgb(108_71_255/0.22))] hover:bg-[linear-gradient(135deg,rgb(108_71_255/0.7),rgb(47_91_234/0.5))] hover:shadow-[0_14px_30px_-16px_rgb(108_71_255/0.55)]',
        dim && 'opacity-60 hover:opacity-100',
      )}
    >
      <Spotlight
        as="button"
        type="button"
        onClick={onPick}
        aria-pressed={on}
        title={s.why || undefined}
        className="relative flex h-full min-h-[200px] w-full cursor-pointer flex-col gap-3 rounded-[14.5px] bg-panel p-5 text-left outline-none"
      >
        <span className="relative z-10 flex items-center justify-between gap-2">
          <span className="inline-flex h-7 max-w-full items-center rounded-full bg-brand-dim px-3 text-[13px] font-bold text-brand">
            <span className="truncate">{s.trapType || '함정'}</span>
          </span>
          {on && (
            <span className="bg-brand-gradient inline-flex size-6 shrink-0 items-center justify-center rounded-full text-on-accent" aria-hidden>
              <Check size={14} strokeWidth={3} />
            </span>
          )}
        </span>
        <span className="relative z-10 line-clamp-2 text-[16px] leading-6 font-bold break-keep text-text">{s.situation}</span>
        <span className="relative z-10 line-clamp-2 text-[13px] leading-5 font-medium break-keep text-text-muted">{s.trap}</span>
        <span className="relative z-10 mt-auto pt-1">
          <CompetencyChips keys={s.competencies} />
        </span>
      </Spotlight>
    </div>
  )
}
