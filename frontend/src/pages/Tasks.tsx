import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BarChart3, Bug, ClipboardCheck, Clock, FileText, FlaskConical, Lock, MessageSquareText, Search, Sparkles, Wrench, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { PageHeader, SelfShell } from '../components/SelfShell'
import { cx } from '../components/cx'
import { GlowBorder, GradientText, Magnetic, RevealGroup, RevealItem, Spotlight, StageSection } from '../components/fx'
import { CATALOG, KINDS, type CatalogTask, type Track } from '../data/catalog'
import { distance, duration, easing, springs } from '../lib/motion'

// DESIGN.md §7-2a 과제 목록 — "퀘스트 보드" (2026-11-19 전면 개편)
// 위: 직군 스위치(미끄러지는 알약) + 난이도·시간 필터 칩(기획_결정사항 §2). 그 아래 다크 무대에 지금 바로 풀 수 있는 추천 과제를 크게.
// 아래: 과제 형태별 카드. 풀 수 있는 카드는 Spotlight + 떠오름, 준비 중은 자물쇠와 흐림.

const KIND_ICON: Record<string, LucideIcon> = {
  incident: Bug,
  feature: Wrench,
  refactor: FlaskConical,
  testing: ClipboardCheck,
  planning: FileText,
  data: BarChart3,
  research: Search,
  cs: MessageSquareText,
}
const LEVEL_PIPS = { 초급: 1, 중급: 2, 고급: 3 } as const
const TRACKS: { value: Track; label: string }[] = [
  { value: 'dev', label: '개발 직군' },
  { value: 'biz', label: '비개발 직군' },
]

function LevelPips({ level, stage }: { level: CatalogTask['level']; stage?: boolean }) {
  const n = LEVEL_PIPS[level]
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`난이도 ${level}`}>
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={cx('h-3 w-1.5 rounded-full', i <= n ? (stage ? 'bg-stage-brand' : 'bg-brand') : stage ? 'bg-stage-line' : 'bg-line-strong')} />
        ))}
      </span>
      <span className={cx('text-[13px]', stage ? 'text-stage-muted' : 'text-text-muted')}>{level}</span>
    </span>
  )
}

/** 추천 과제: 이 화면의 다크 무대 */
function Featured({ t }: { t: CatalogTask }) {
  const kind = KINDS.find((k) => k.key === t.kind)!
  const Icon = KIND_ICON[t.kind]
  return (
    <StageSection aria-label="추천 과제">
      <div className="grid grid-cols-[minmax(0,1fr)_320px] items-center gap-10 px-12 py-10">
        <div>
          <span className="inline-flex items-center gap-2 font-mono text-[12px] font-semibold tracking-[0.12em] text-stage-brand">
            <Sparkles size={14} aria-hidden /> RECOMMENDED │ {kind.name}
          </span>
          <h2 className="mt-3 text-[44px] leading-[52px] font-extrabold tracking-[-0.03em] text-stage-text">
            {t.title.split(' ').slice(0, -2).join(' ')} <GradientText>{t.title.split(' ').slice(-2).join(' ')}</GradientText>
          </h2>
          <p className="mt-3 max-w-[560px] text-[17px] leading-7 text-stage-muted">{t.summary}</p>
          <div className="mt-5 flex flex-wrap items-center gap-5">
            <span className="inline-flex items-center gap-1.5 font-mono text-[14px] text-stage-text">
              <Clock size={16} className="text-stage-muted" aria-hidden /> {t.minutes}분
            </span>
            <LevelPips level={t.level} stage />
          </div>
          <div className="mt-8">
            <Magnetic>
              <Link
                to={t.start!}
                className="btn-shimmer bg-brand-gradient inline-flex h-14 items-center gap-2 rounded-full px-8 text-[17px] font-semibold text-on-accent shadow-[0_12px_40px_-8px_rgb(108_71_255/0.7)]"
              >
                지금 도전하기 <ArrowRight size={18} aria-hidden />
              </Link>
            </Magnetic>
          </div>
        </div>

        {/* 오른쪽: 과제 형태 아이콘이 빛나는 고리 안에서 떠 있다 */}
        <div className="relative mx-auto size-[280px]" aria-hidden>
          <div className="quest-ring absolute inset-0 rounded-full border border-dashed border-stage-line-strong" />
          <div className="quest-ring-rev absolute inset-8 rounded-full border border-stage-line" />
          <div className="absolute inset-16 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--color-stage-brand)_45%,transparent),transparent_70%)] blur-xl" />
          <GlowBorder className="absolute inset-[88px] rounded-[28px]">
            <div className="flex size-full items-center justify-center rounded-[28px] bg-stage-panel">
              <Icon size={48} strokeWidth={1.5} className="text-stage-brand" />
            </div>
          </GlowBorder>
          {['var(--color-stage-brand)', 'var(--color-stage-blue)'].map((c, i) => (
            <span key={c} className="quest-orbit absolute top-1/2 left-1/2 size-3 rounded-full" style={{ background: c, boxShadow: `0 0 14px ${c}`, animationDelay: `${-i * 9}s` }} />
          ))}
        </div>
      </div>
    </StageSection>
  )
}

function TaskCard({ t }: { t: CatalogTask }) {
  const ready = !!t.start
  const kind = KINDS.find((k) => k.key === t.kind)!
  const Icon = KIND_ICON[t.kind]
  const body = (
    <>
      <div className="flex items-start gap-4">
        <span
          className={cx(
            'inline-flex size-14 shrink-0 items-center justify-center rounded-2xl',
            ready ? 'bg-brand-gradient text-on-accent shadow-[0_10px_24px_-8px_rgb(108_71_255/0.6)]' : 'bg-panel-raised text-text-faint',
          )}
        >
          <Icon size={26} strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="label">{kind.name}</p>
          <h3 className={cx('mt-0.5 text-[19px] leading-7 font-bold', ready ? 'text-text' : 'text-text-muted')}>{t.title}</h3>
        </div>
        {!ready && (
          <span className="inline-flex h-7 items-center gap-1 rounded-full bg-panel-raised px-2.5 text-[12px] font-semibold text-text-muted">
            <Lock size={12} aria-hidden /> 준비 중
          </span>
        )}
      </div>
      <p className="mt-3 text-[15px] leading-6 text-text-muted">{t.summary}</p>
      <div className="mt-auto flex items-center gap-4 border-t border-line pt-4 text-[14px] text-text-muted">
        <span className="inline-flex items-center gap-1 font-mono">
          <Clock size={14} aria-hidden /> {t.minutes}m
        </span>
        <LevelPips level={t.level} />
        {ready && (
          <span className="ml-auto inline-flex items-center gap-1 font-semibold text-brand">
            도전 <ArrowRight size={16} className="transition-transform duration-150 group-hover:translate-x-1" aria-hidden />
          </span>
        )}
      </div>
    </>
  )
  const cls = 'group flex h-full w-full flex-col rounded-xl border bg-panel p-6'
  return ready ? (
    <Spotlight
      as={Link}
      to={t.start!}
      className={cx(cls, 'border-line shadow-sm transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-1 hover:border-brand/50 hover:shadow-lg')}
    >
      {body}
    </Spotlight>
  ) : (
    <div className={cx(cls, 'border-dashed border-line-strong/70 bg-panel/60')} aria-disabled="true">
      {body}
    </div>
  )
}

const LEVELS = ['전체', '초급', '중급', '고급'] as const
const TIMES = [
  { value: 'ALL', label: '전체', ok: () => true },
  { value: 'SHORT', label: '40분 이하', ok: (m: number) => m <= 40 },
  { value: 'LONG', label: '41분 이상', ok: (m: number) => m > 40 },
] as const

/** 필터 칩 한 줄: 고른 칩 뒤로 브랜드 배경이 미끄러진다 */
function ChipFilter<T extends string>({ id, label, options, value, onChange }: { id: string; label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1">
      <span className="mr-2 text-[13px] font-semibold text-text-muted">{label}</span>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx('relative inline-flex h-8 items-center rounded-full px-3.5 text-[14px] font-medium transition-colors', on ? 'text-brand' : 'text-text-muted hover:text-text')}
          >
            {on && <motion.span layoutId={`${id}-chip`} transition={springs.snappy} className="absolute inset-0 -z-10 rounded-full bg-brand-dim ring-1 ring-brand/30" />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export default function Tasks() {
  const [track, setTrack] = useState<Track>('dev')
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('전체')
  const [time, setTime] = useState<(typeof TIMES)[number]['value']>('ALL')
  const timeOk = TIMES.find((t) => t.value === time)!.ok
  const tasks = CATALOG.filter(
    (t) => KINDS.find((k) => k.key === t.kind)?.track === track && (level === '전체' || t.level === level) && timeOk(t.minutes),
  )
  const featured = tasks.find((t) => t.start)
  const available = CATALOG.filter((t) => t.start).length
  return (
    <SelfShell
      header={
        <PageHeader label="TASKS" title="과제">
          <span className="font-mono text-[13px] text-text-muted">
            응시 가능 {available}개 / 전체 {CATALOG.length}개
          </span>
        </PageHeader>
      }
    >
      <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-8 py-6">
        {/* 직군 스위치: 활성 칸 뒤로 그라데이션 알약이 미끄러진다. 오른쪽에 난이도·시간 필터 */}
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div role="tablist" aria-label="직군" className="glass flex w-fit gap-1 rounded-full p-1.5">
          {TRACKS.map((tr) => {
            const on = tr.value === track
            const n = CATALOG.filter((t) => KINDS.find((k) => k.key === t.kind)?.track === tr.value).length
            return (
              <button
                key={tr.value}
                role="tab"
                type="button"
                aria-selected={on}
                onClick={() => setTrack(tr.value)}
                className={cx('relative inline-flex h-11 items-center gap-2 rounded-full px-6 text-[16px] font-semibold transition-colors', on ? 'text-on-accent' : 'text-text-muted hover:text-text')}
              >
                {on && <motion.span layoutId="track-pill" transition={springs.snappy} className="bg-brand-gradient absolute inset-0 -z-10 rounded-full shadow-[0_8px_24px_-8px_rgb(108_71_255/0.6)]" />}
                {tr.label}
                <span className={cx('tnum font-mono text-[13px]', on ? 'text-on-accent/80' : 'text-text-faint')}>{n}</span>
              </button>
            )
          })}
        </div>
          <ChipFilter id="level" label="난이도" options={LEVELS.map((l) => ({ value: l, label: l }))} value={level} onChange={setLevel} />
          <ChipFilter id="time" label="시간" options={TIMES} value={time} onChange={setTime} />
        </div>

        <div key={`${track}-${level}-${time}`} className="flex flex-col gap-8">
          {featured && (
            <motion.div initial={{ opacity: 0, y: distance.app }} animate={{ opacity: 1, y: 0 }} transition={{ duration: duration.slow, ease: easing.expo }}>
              <Featured t={featured} />
            </motion.div>
          )}
          <section aria-labelledby="all-h">
            <h2 id="all-h" className="mb-4 text-h2 font-semibold text-text">
              과제 형태별
            </h2>
            {tasks.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line-strong px-6 py-10 text-center text-[15px] text-text-muted">조건에 맞는 과제가 없습니다. 난이도나 시간 필터를 바꿔 보세요.</p>
            ) : (
              <RevealGroup className="grid grid-cols-2 gap-4">
                {tasks.map((t) => (
                  <RevealItem key={t.id} className="flex">
                    <TaskCard t={t} />
                  </RevealItem>
                ))}
              </RevealGroup>
            )}
          </section>
        </div>
      </div>
    </SelfShell>
  )
}
