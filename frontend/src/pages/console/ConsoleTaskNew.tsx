// DESIGN.md §7-9-2 AI로 과제 만들기 (ADMIN): 입력 → 만드는 중 → 검수 화면으로
// 연출: "만드는 중" 영역이 이 화면의 다크 무대. 단계마다 BranchLine 이 다음 단계로 이어지고,
// 끝난 단계에 체크가 튀어나오며, 다 만들어지면 무대 테두리에 GlowBorder 가 돈다.
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { BranchLine, GlowBorder, StageSection } from '../../components/fx'
import { springs } from '../../lib/motion'
import { CircleAlert, CircleCheck, Info, Loader2, Minus, Plus, Sparkles } from 'lucide-react'
import { cx } from '../../components/cx'
import { useConsoleCrumbs } from '../../components/consoleCrumbs'
import { PageHeader } from '../../components/SelfShell'
import { Button } from '../../components/ui'
import { KINDS } from '../../data/catalog'
import { createDraft, type Difficulty, type DraftInput, type Track } from '../../data/consoleTasks'

const STEPS = [
  { key: 'desc', name: '과제 설명', result: '설명과 요구사항' },
  { key: 'files', name: '작업 파일', result: '파일' },
  { key: 'questions', name: '문항', result: '문항' },
  { key: 'followups', name: '후속 질문', result: '후속 질문' },
  { key: 'sources', name: '근거 문서 연결', result: '근거' },
] as const

const STREAM: Record<(typeof STEPS)[number]['key'], string[]> = {
  desc: ['# 상황', '어제 21시부터 주문 생성 API의 응답이 느려졌습니다.', '## 요구사항', '- 원인을 찾아 코드로 고친다', '- 검증 테스트를 추가한다'],
  files: ['src/main/Service.java 만드는 중', 'test/ServiceTest.java 만드는 중', 'NOTES.md 만드는 중', '참고 자료 페이지 나누는 중'],
  questions: ['Q1 객관식: 자료에 따르면 맞는 설명은?', '  ② 두 번째 보기 (정답)', 'Q2 단답형: 자료에서 찾을 수 있는 수치', 'Q3 서술형: 채점 기준 작성 중'],
  followups: ['F1 (고정) AI 답변 중 직접 확인한 것과 확인 방법', 'F2 풀이 중 가장 어려웠던 판단은?'],
  sources: ['Q1 ← 자료 1쪽, 2쪽', 'Q2 ← 자료 2쪽', 'Q3 ← 자료 1-2쪽'],
}

const field = 'flex flex-col gap-2'
const fieldLabel = 'text-[14px] font-semibold text-text'

export default function ConsoleTaskNew() {
  useConsoleCrumbs(['AI로 만들기'])
  const nav = useNavigate()
  const [track, setTrack] = useState<Track>('DEV')
  const [category, setCategory] = useState('incident')
  const [difficulty, setDifficulty] = useState<Difficulty>('중급')
  const [minutes, setMinutes] = useState(60)
  const [topic, setTopic] = useState('')
  const [trap, setTrap] = useState('')
  const [counts, setCounts] = useState({ SINGLE: 0, SHORT: 0, ESSAY: 1, FOLLOWUP: 3 })
  const [run, setRun] = useState<{ input: DraftInput; failAt?: number } | null>(null)

  const kinds = KINDS.filter((k) => k.track === (track === 'DEV' ? 'dev' : 'biz'))

  if (run) return <Generating input={run.input} onCancel={() => setRun(null)} onDone={(id) => nav(`/console/tasks/${id}`)} />

  return (
    <>
      <PageHeader label="NEW TASK" title="AI로 과제 만들기" />
      {/* 2026-11-19 개편: 왼쪽 유리 폼, 오른쪽 다크 무대에 만들어질 초안 미리보기(고른 값이 바로 반영) */}
      <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-6 p-8">
        <form
          className="glass flex flex-col gap-7 rounded-2xl bg-white/90! p-8 shadow-md!"
          onSubmit={(e) => {
            e.preventDefault()
            setRun({ input: { track, category, difficulty, minutes, topic, trap, counts } })
          }}
        >
          <div className={field}>
            <span className={fieldLabel}>직군</span>
            <div role="radiogroup" aria-label="직군" className="grid grid-cols-2 gap-3">
              {(
                [
                  ['DEV', '개발', 'Spring Boot와 React 코드로 푸는 과제'],
                  ['BIZ', '비개발', '문서와 데이터 자료로 푸는 과제'],
                ] as const
              ).map(([v, l, d]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={track === v}
                  onClick={() => {
                    setTrack(v)
                    setCategory(KINDS.find((k) => k.track === (v === 'DEV' ? 'dev' : 'biz'))!.key)
                    setCounts(v === 'DEV' ? { SINGLE: 0, SHORT: 0, ESSAY: 1, FOLLOWUP: 3 } : { SINGLE: 1, SHORT: 1, ESSAY: 1, FOLLOWUP: 3 })
                  }}
                  className={cx(
                    'rounded-md border p-4 text-left transition-colors',
                    track === v ? 'border-brand bg-brand-dim' : 'border-line-strong hover:border-text-muted',
                  )}
                >
                  <span className={cx('block text-[16px] font-semibold', track === v ? 'text-brand' : 'text-text')}>{l}</span>
                  <span className="mt-1 block text-[13px] text-text-muted">{d}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={field}>
            <span className={fieldLabel}>과제 형태</span>
            <ChipGroup label="과제 형태" value={category} onChange={setCategory} options={kinds.map((k) => [k.key, k.name])} />
            <p className="text-[13px] text-text-muted">{kinds.find((k) => k.key === category)?.desc}</p>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className={field}>
              <span className={fieldLabel}>난이도</span>
              <ChipGroup label="난이도" value={difficulty} onChange={(v) => setDifficulty(v as Difficulty)} options={['초급', '중급', '고급'].map((x) => [x, x])} />
            </div>
            <div className={field}>
              <label htmlFor="minutes" className={fieldLabel}>
                제한 시간
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="minutes"
                  type="number"
                  min={10}
                  max={180}
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                  className="tnum h-9 w-20 rounded-sm border border-line-strong bg-panel px-2 text-right font-mono text-[15px] outline-none focus:border-brand"
                />
                <span className="text-[14px] text-text-muted">분</span>
                {[30, 45, 60, 90].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMinutes(m)}
                    className={cx('tnum h-7 rounded-full px-2.5 font-mono text-[12px]', minutes === m ? 'bg-brand-dim text-brand' : 'bg-panel-raised text-text-muted hover:text-text')}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={field}>
            <label htmlFor="topic" className={fieldLabel}>
              주제
            </label>
            <input
              id="topic"
              required
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={track === 'DEV' ? '예: 주문 결제 API의 동시성 장애' : '예: 저가 요금제 출시 여부 판단'}
              className="h-11 rounded-lg border border-line-strong bg-panel px-3 text-[15px] outline-none placeholder:text-text-faint focus:border-brand focus:shadow-[0_0_0_3px_rgb(108_71_255/0.15)]"
            />
          </div>

          <div className={field}>
            <label htmlFor="trap" className={fieldLabel}>
              함정 (선택)
            </label>
            <textarea
              id="trap"
              rows={3}
              value={trap}
              onChange={(e) => setTrap(e.target.value)}
              placeholder="응시자가 AI 답을 그대로 믿으면 빠지는 지점. 예: AI가 락 순서를 반대로 제안하도록 로그를 꾸민다"
              className="resize-y rounded-lg border border-line-strong bg-panel p-3 text-[15px] leading-6 outline-none placeholder:text-text-faint focus:border-brand"
            />
            <p className="text-[13px] text-text-muted">참고 파일은 올리지 않습니다. 과제 자료와 근거 문서까지 AI가 글로 받은 정의로 만듭니다.</p>
          </div>

          <div className={field}>
            <span className={fieldLabel}>문항 구성</span>
            <div className="grid grid-cols-4 gap-3">
              {(
                [
                  ['SINGLE', '객관식'],
                  ['SHORT', '단답형'],
                  ['ESSAY', '서술형'],
                  ['FOLLOWUP', '후속 질문'],
                ] as const
              ).map(([k, l]) => (
                <Stepper key={k} label={l} value={counts[k]} min={k === 'FOLLOWUP' ? 1 : 0} onChange={(v) => setCounts((c) => ({ ...c, [k]: v }))} />
              ))}
            </div>
            {track === 'BIZ' && (
              <p className="flex items-start gap-2 rounded-md bg-info/8 px-3 py-2 text-[13px] leading-5 text-info">
                <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
                비개발 문항은 하나마다 근거 PDF를 2개 이상 참조하도록 만듭니다. 응시자는 과제 자료와 작업 파일만 AI에게 첨부할 수 있습니다.
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-line pt-6">
            <span className="text-[13px] text-text-muted">약 1~2분 걸립니다</span>
            <Button type="submit" variant="primary" size="lg">
              <Sparkles size={16} aria-hidden /> 초안 만들기
            </Button>
          </div>
        </form>
        <DraftPreview track={track} category={category} difficulty={difficulty} minutes={minutes} counts={counts} />
      </div>
    </>
  )
}

/** 만들어질 초안 미리보기 (다크 무대, 화면에 붙어 따라온다) */
function DraftPreview({ track, category, difficulty, minutes, counts }: { track: Track; category: string; difficulty: Difficulty; minutes: number; counts: Record<'SINGLE' | 'SHORT' | 'ESSAY' | 'FOLLOWUP', number> }) {
  const kind = KINDS.find((k) => k.key === category)
  const level = { 초급: 1, 중급: 2, 고급: 3 }[difficulty]
  const q = counts.SINGLE + counts.SHORT + counts.ESSAY
  return (
    <StageSection className="sticky top-6" aria-label="초안 미리보기">
      <div className="flex flex-col gap-5 px-6 py-6">
        <p className="flex items-center gap-2 font-mono text-[12px] font-semibold tracking-[0.12em] text-stage-brand">
          <Sparkles size={14} aria-hidden /> DRAFT PREVIEW
        </p>
        <div>
          <p className="text-[13px] text-stage-muted">{track === 'DEV' ? '개발 직군' : '비개발 직군'}</p>
          <p className="text-[24px] leading-8 font-bold text-stage-text">{kind?.name ?? '과제 형태'}</p>
          <p className="mt-1 text-[14px] leading-5 text-stage-muted">{kind?.desc}</p>
        </div>
        <div className="flex items-center gap-5">
          <span className="inline-flex items-center gap-1.5" aria-label={`난이도 ${difficulty}`}>
            <span className="flex gap-0.5" aria-hidden>
              {[1, 2, 3].map((i) => (
                <span key={i} className={cx('h-3 w-1.5 rounded-full', i <= level ? 'bg-stage-brand' : 'bg-stage-line')} />
              ))}
            </span>
            <span className="text-[14px] text-stage-text">{difficulty}</span>
          </span>
          <span className="tnum font-mono text-[14px] text-stage-text">{minutes}분</span>
        </div>
        <dl className="grid grid-cols-4 gap-2">
          {(
            [
              ['객관식', counts.SINGLE],
              ['단답형', counts.SHORT],
              ['서술형', counts.ESSAY],
              ['후속', counts.FOLLOWUP],
            ] as const
          ).map(([l, n]) => (
            <div key={l} className="glass-stage rounded-lg px-2 py-2.5 text-center">
              <dd className="tnum font-mono text-[24px] leading-7 font-semibold text-stage-text">{n}</dd>
              <dt className="text-[12px] text-stage-muted">{l}</dt>
            </div>
          ))}
        </dl>
        <div>
          <p className="label text-stage-muted">AI가 만들 것</p>
          <ol className="mt-2 flex flex-col gap-1.5">
            {['과제 설명과 요구사항', track === 'DEV' ? '작업 파일 (코드, 테스트)' : '작업 파일 (자료)', `문항 ${q}개`, `후속 질문 ${counts.FOLLOWUP}개`, '문항 근거 연결'].map((t, i) => (
              <li key={t} className="flex items-center gap-2.5 text-[14px] text-stage-text">
                <span className="tnum flex size-5 items-center justify-center rounded-full border border-stage-line font-mono text-[11px] text-stage-brand">{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>
        </div>
        <p className="border-t border-stage-line pt-4 text-[13px] leading-5 text-stage-muted">만든 초안은 검수 대기(HIDDEN)로 저장되고, 검수한 뒤 공개합니다.</p>
      </div>
    </StageSection>
  )
}

function ChipGroup({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: (readonly [string, string])[] }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cx(
            'h-9 rounded-full border px-4 text-[14px] font-medium transition-colors',
            value === v ? 'border-brand bg-brand-dim text-brand' : 'border-line-strong text-text-muted hover:text-text',
          )}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

function Stepper({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (v: number) => void }) {
  return (
    <div className="rounded-md border border-line px-3 py-2">
      <p className="text-[13px] text-text-muted">{label}</p>
      <div className="mt-1 flex items-center justify-between">
        <button type="button" aria-label={`${label} 줄이기`} disabled={value <= min} onClick={() => onChange(value - 1)} className="inline-flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-panel-raised disabled:opacity-30">
          <Minus size={14} aria-hidden />
        </button>
        <span className="tnum font-mono text-[18px] font-semibold text-text">{value}</span>
        <button type="button" aria-label={`${label} 늘리기`} disabled={value >= 10} onClick={() => onChange(value + 1)} className="inline-flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-panel-raised disabled:opacity-30">
          <Plus size={14} aria-hidden />
        </button>
      </div>
    </div>
  )
}

// ── 만드는 중 (목업: 단계마다 정해진 시간이 지나면 완료) ──
function Generating({ input, onCancel, onDone }: { input: DraftInput; onCancel: () => void; onDone: (id: string) => void }) {
  const [step, setStep] = useState(0)
  const [lines, setLines] = useState<string[]>([])
  const [doneId, setDoneId] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (doneId || failed) return
    if (step >= STEPS.length) {
      const t = createDraft(input)
      const id = window.setTimeout(() => setDoneId(t.id), 0)
      return () => window.clearTimeout(id)
    }
    const src = STREAM[STEPS[step].key]
    let i = 0
    const timer = window.setInterval(() => {
      i++
      setLines(src.slice(0, i))
      if (i >= src.length) {
        window.clearInterval(timer)
        window.setTimeout(() => setStep((s) => s + 1), 350)
      }
    }, 320)
    return () => window.clearInterval(timer)
  }, [step, doneId, failed, input, attempt])

  useEffect(() => {
    if (!doneId) return
    const t = window.setTimeout(() => onDone(doneId), 1500)
    return () => window.clearTimeout(t)
  }, [doneId, onDone])

  const qCount = input.counts.SINGLE + input.counts.SHORT + input.counts.ESSAY
  const resultOf = (k: string) =>
    k === 'files' ? `파일 ${input.track === 'DEV' ? 4 : 2}개` : k === 'questions' ? `문항 ${qCount}개` : k === 'followups' ? `${input.counts.FOLLOWUP}개` : k === 'sources' ? `${qCount}건` : '완료'
  const progress = doneId ? 1 : Math.min(step, STEPS.length) / STEPS.length

  return (
    <>
      <PageHeader label="NEW TASK" title="AI로 과제 만들기" />
      <div className="p-8">
        <GlowBorder active={!!doneId} className="mx-auto max-w-[720px] rounded-xl">
        <StageSection aria-label="과제 초안 만드는 중">
          <div className="px-8 pt-6">
            {/* 진행 막대: 갈라지는 선이 단계마다 가지를 내며 이어진다 */}
            <BranchLine progress={progress} branches={STEPS.slice(1).map((_, i) => (i + 1) / STEPS.length)} />
          </div>
          <div className="px-8 pb-8">
            <h2 className="text-h2 font-semibold text-stage-text">{doneId ? '초안이 만들어졌습니다' : '초안을 만들고 있습니다'}</h2>
            <p className="mt-1 text-[14px] text-stage-muted">
              {doneId ? '잠시 뒤 검수 화면으로 이동합니다.' : '화면을 떠나도 되지만, 끝날 때까지 이 화면에 있으면 바로 검수로 넘어갑니다.'}
            </p>
            <ol className="mt-6 flex flex-col gap-1" aria-live="polite">
              {STEPS.map((s, i) => {
                const state = doneId || i < step ? 'done' : i === step ? (failed ? 'fail' : 'run') : 'wait'
                return (
                  <li key={s.key}>
                    <div className="flex h-10 items-center gap-3">
                      {state === 'done' && (
                        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={springs.snappy} className="inline-flex">
                          <CircleCheck size={20} className="text-stage-signal" aria-label="완료" />
                        </motion.span>
                      )}
                      {state === 'run' && <Loader2 size={20} className="animate-spin text-stage-brand" aria-label="진행 중" />}
                      {state === 'fail' && <CircleAlert size={20} className="text-stage-alert" aria-label="실패" />}
                      {state === 'wait' && <span className="size-5 rounded-full border-2 border-stage-line-strong" aria-label="대기" />}
                      <span className={cx('text-[15px] font-medium', state === 'wait' ? 'text-stage-faint' : 'text-stage-text')}>{s.name}</span>
                      {state === 'done' && <span className="tnum ml-auto font-mono text-[13px] text-stage-muted">{resultOf(s.key)}</span>}
                    </div>
                    {state === 'run' && <StreamBox lines={lines} />}
                    {state === 'fail' && (
                      <div className="ml-8 flex items-center gap-3 text-[13px] text-stage-alert">
                        모델 응답이 형식에 맞지 않았습니다.
                        <Button
                          size="sm"
                          onClick={() => {
                            setFailed(false)
                            setLines([])
                            setAttempt((a) => a + 1)
                          }}
                        >
                          다시 시도
                        </Button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
            <div className="mt-6 flex justify-end gap-2 border-t border-stage-line pt-6">
              {doneId ? (
                <Button variant="primary" onClick={() => onDone(doneId)}>
                  검수하러 가기
                </Button>
              ) : (
                <Button variant="ghost" className="text-stage-muted hover:bg-stage-raised hover:text-stage-text" onClick={onCancel}>
                  취소
                </Button>
              )}
            </div>
          </div>
        </StageSection>
        </GlowBorder>
      </div>
    </>
  )
}

function StreamBox({ lines }: { lines: string[] }): ReactNode {
  return (
    <pre className="mb-2 ml-8 max-h-[150px] overflow-hidden rounded-md border border-stage-line bg-stage-raised px-3 py-2 font-mono text-[13px] leading-[22px] whitespace-pre-wrap text-stage-muted">
      {lines.slice(-6).join('\n')}
      <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-stage-brand align-middle" aria-hidden />
    </pre>
  )
}
