// 과제 만들기 두 탭(자동 생성 / 직접 만들기)이 같이 쓰는 폼 부품: 칸 틀, 직군·시간·용도 선택, 바로/배치 선택.
import type { ReactNode } from 'react'
import { Check, CircleAlert } from 'lucide-react'
import { cx } from '../../../components/cx'
import { TRACK_ICON } from '../../../components/domainIcons'
import { BATCH_HOURS, GEN_MINUTES, type BatchHours, type GenMinutes, type GenMode, type GenTrack, type GenUsage } from '../../../data/taskGen'
import { choiceClass } from './choice'
import { TRACKS, USAGES } from './formConsts'
import { TRACK_TONE } from './trackTone'

export function Field({ n, title, hint, error, children }: { n: number; title: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="flex items-center gap-2 text-[16px] font-bold text-text">
        <span className="tnum inline-flex size-6 items-center justify-center rounded-full bg-panel-raised font-mono text-[12px] text-text-muted" aria-hidden>
          {n}
        </span>
        {title}
      </h2>
      {hint && <p className="-mt-1 text-[13px] text-text-muted">{hint}</p>}
      {children}
      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-[13px] font-medium text-alert">
          <CircleAlert size={14} aria-hidden /> {error}
        </p>
      )}
    </section>
  )
}

export function TrackPicker({ value, onChange }: { value: GenTrack | null; onChange: (v: GenTrack) => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {TRACKS.map((t) => {
        const on = value === t.value
        const Icon = TRACK_ICON[t.value]
        return (
          <button
            key={t.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(t.value)}
            className={cx('flex min-h-11 items-center gap-3 rounded-xl p-4 text-left', choiceClass(on))}
          >
            <span className={cx('inline-flex size-11 shrink-0 items-center justify-center rounded-xl', TRACK_TONE[t.value].tile)} aria-hidden>
              <Icon size={22} />
            </span>
            <span className="min-w-0">
              <span className={cx('block text-[16px] font-bold', on ? 'text-brand' : 'text-text')}>{t.title}</span>
              <span className="block text-[13px] break-keep text-text-muted">{t.desc}</span>
            </span>
            {on && <Check size={18} strokeWidth={3} className="ml-auto shrink-0 text-brand" aria-hidden />}
          </button>
        )
      })}
    </div>
  )
}

export function MinutesPicker({ value, onChange }: { value: GenMinutes; onChange: (v: GenMinutes) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[14px] font-bold text-text">제한 시간</span>
      <div role="radiogroup" aria-label="제한 시간" className="flex gap-2">
        {GEN_MINUTES.map((m) => {
          const on = value === m
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(m)}
              className={cx('inline-flex h-14 w-24 items-center justify-center gap-1.5 rounded-xl px-4 text-[16px] font-bold', choiceClass(on))}
            >
              {on && <Check size={16} strokeWidth={3} aria-hidden />}
              <span>
                <span className="tnum font-mono">{m}</span>분
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** 용도: 가로로 놓인 큰 선택 칸 두 개(아이콘 + 이름 + 한 줄 설명) */
export function UsagePicker({ value, onChange }: { value: GenUsage; onChange: (v: GenUsage) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[14px] font-bold text-text">용도</span>
      <div role="radiogroup" aria-label="용도" className="flex flex-wrap gap-2">
        {USAGES.map((u) => {
          const on = value === u.value
          return (
            <button
              key={u.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(u.value)}
              className={cx('flex h-14 w-[240px] items-center gap-3 rounded-xl px-4 text-left', choiceClass(on))}
            >
              <u.icon size={20} aria-hidden className="shrink-0" />
              <span className="min-w-0">
                <span className="block text-[16px] leading-5 font-bold">{u.title}</span>
                <span className={cx('block text-[12px] leading-4 font-semibold break-keep', on ? 'text-brand' : 'text-text-muted')}>{u.desc}</span>
              </span>
              {on && <Check size={16} strokeWidth={3} className="ml-auto shrink-0" aria-hidden />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** 바로 / 배치. 배치를 고르면 마감(1/3/6시간) 칸이 나온다 */
export function ModePicker({
  mode,
  hours,
  onMode,
  onHours,
}: {
  mode: GenMode
  hours: BatchHours
  onMode: (m: GenMode) => void
  onHours: (h: BatchHours) => void
}) {
  const opts: { value: GenMode; title: string }[] = [
    { value: 'NOW', title: '바로 만들기' },
    { value: 'BATCH', title: '배치' },
  ]
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
        <div className="flex flex-col gap-2">
          <span className="text-[14px] font-bold text-text">방식</span>
          <div role="radiogroup" aria-label="방식" className="flex gap-2">
            {opts.map((o) => {
              const on = mode === o.value
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onMode(o.value)}
                  className={cx('inline-flex h-14 min-w-32 items-center justify-center gap-1.5 rounded-xl px-5 text-[16px] font-bold', choiceClass(on))}
                >
                  {on && <Check size={16} strokeWidth={3} aria-hidden />}
                  {o.title}
                </button>
              )
            })}
          </div>
        </div>
        {mode === 'BATCH' && (
          <div className="step-in flex flex-col gap-2">
            <span className="text-[14px] font-bold text-text">마감</span>
            <div role="radiogroup" aria-label="마감" className="flex gap-2">
              {BATCH_HOURS.map((h) => {
                const on = hours === h
                return (
                  <button
                    key={h}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => onHours(h)}
                    className={cx('inline-flex h-14 w-24 items-center justify-center gap-1.5 rounded-xl px-4 text-[16px] font-bold', choiceClass(on))}
                  >
                    {on && <Check size={16} strokeWidth={3} aria-hidden />}
                    <span>
                      <span className="tnum font-mono">{h}</span>시간
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
      <p className="text-[13px] break-keep text-text-muted">
        {mode === 'BATCH' ? '배치: 비용 약 절반, 마감 안에 끝나요' : '바로 만들기는 보통 1분 안팎에 끝나요. 배치는 비용 약 절반, 마감 안에 끝나요.'}
      </p>
    </div>
  )
}
