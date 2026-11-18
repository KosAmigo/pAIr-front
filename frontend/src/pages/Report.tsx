import { useState, type CSSProperties } from 'react'
import { motion } from 'motion/react'
import { useNavigate, useParams } from 'react-router-dom'
import { isRealAttempt } from '../api'
import RealReport from './RealReport'
import { Bot, ChevronDown, CircleAlert, CircleCheck, GitBranch, RotateCcw, User } from 'lucide-react'
import { PageHeader, SelfShell } from '../components/SelfShell'
import { cx } from '../components/cx'
import { Button, ButtonLink, Panel, ScoreBar } from '../components/ui'
import { ScoreHero, StageSep } from '../components/report/ScoreHero'
import { duration, easing } from '../lib/motion'
import { COMPETENCIES, density, moments, report, timelineEvents, type ChatMsg } from '../data/mock'

// DESIGN.md §7-4 결과 리포트, §6.11 Timeline, §6.12 Quote Block

const TOTAL_MIN = 53
const toneColor = { good: 'var(--color-signal)', weak: 'var(--color-caution)' }

function Timeline({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  const pct = (t: number) => `${(t / TOTAL_MIN) * 100}%`
  return (
    <div className="px-2">
      {/* 결정적 순간 마커 */}
      <div className="relative h-14">
        {moments.map((m) => {
          const active = m.id === selected
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect(m.id)}
              aria-pressed={active}
              aria-label={`${m.time} ${m.title}`}
              className="group absolute bottom-0 flex -translate-x-1/2 flex-col items-center"
              style={{ left: pct(m.t) }}
            >
              <span
                className={cx(
                  'mb-1 rounded-sm px-1.5 font-mono text-[12px] whitespace-nowrap transition-colors duration-[120ms]',
                  active ? 'bg-panel-raised text-text' : 'text-text-muted group-hover:text-text',
                )}
              >
                {m.time}
              </span>
              <span
                className={cx('glow size-3.5 rotate-45 rounded-[2px] transition-transform duration-[180ms]', active ? 'scale-125' : 'opacity-80')}
                style={{ background: toneColor[m.tone], '--glow': toneColor[m.tone] } as CSSProperties}
              />
              <span className="h-3 w-px" style={{ background: toneColor[m.tone] }} aria-hidden />
            </button>
          )
        })}
      </div>

      {/* AI 상호작용 밀도 */}
      <div className="relative flex h-[120px] items-end gap-px border-y border-line" aria-label="분당 AI 상호작용 밀도" role="img">
        {/* 화면에 들어오면 막대가 왼쪽부터 차례로 솟는다 */}
        {density.map((d, i) => (
          <motion.span
            key={i}
            className="flex-1 origin-bottom rounded-t-[1px] bg-text-faint/50"
            style={{ height: `${d * 100}%` }}
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true }}
            transition={{ duration: duration.slow, ease: easing.expo, delay: i * 0.012 }}
          />
        ))}
        {moments.map((m) => (
          <span
            key={m.id}
            className={cx('absolute inset-y-0 w-px', m.id === selected ? 'opacity-100' : 'opacity-30')}
            style={{ left: pct(m.t), background: toneColor[m.tone] }}
            aria-hidden
          />
        ))}
      </div>

      {/* 이벤트 트랙 */}
      <div className="relative mt-2 h-6" aria-hidden>
        {timelineEvents.map((e, i) => (
          <span key={i} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: pct(e.t) }}>
            {e.kind === 'ai' && <span className="block size-2 rounded-full bg-info" />}
            {e.kind === 'run' && <span className="block size-2 rounded-[1px] bg-text-muted" />}
            {e.kind === 'save' && <span className="block h-3 w-px bg-line-strong" />}
          </span>
        ))}
      </div>

      {/* 시간 축 */}
      <div className="tnum relative h-4 font-mono text-[12px] text-text-faint" aria-hidden>
        {[0, 15, 30, 45, TOTAL_MIN].map((t, i, arr) => (
          <span
            key={t}
            className={cx('absolute', i === 0 ? '' : i === arr.length - 1 ? '-translate-x-full' : '-translate-x-1/2')}
            style={{ left: pct(t) }}
          >
            00:{String(t).padStart(2, '0')}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center">
        <div className="flex gap-4 text-[13px] text-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-info" aria-hidden /> AI 질문
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[1px] bg-text-muted" aria-hidden /> 실행
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-px bg-line-strong" aria-hidden /> 파일 저장
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rotate-45 bg-signal" aria-hidden /> 좋은 판단
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rotate-45 bg-caution" aria-hidden /> 아쉬운 판단
          </span>
        </div>
      </div>
    </div>
  )
}

function Quote({ m }: { m: ChatMsg }) {
  const ai = m.role === 'ai'
  return (
    <blockquote className={cx('rounded-sm border-l-2 bg-panel-raised px-4 py-3', ai ? 'border-info' : 'border-text-muted')}>
      <div className="flex items-center gap-2 font-mono text-[12px] text-text-muted">
        {ai ? <Bot size={14} className="text-info" aria-hidden /> : <User size={14} aria-hidden />}
        <span>#T{String(m.turn).padStart(2, '0')}</span>
        <span className={ai ? 'text-info' : 'text-text'}>{ai ? 'AI' : '응시자'}</span>
        <span>{m.time}</span>
      </div>
      <p className="mt-1 text-[15px] leading-6 text-text">{m.text}</p>
    </blockquote>
  )
}

// 실제 응시(att-...)는 백엔드 리포트, 그 밖의 ID는 목업 리포트
export default function Report() {
  const { attemptId } = useParams()
  return isRealAttempt(attemptId) ? <RealReport /> : <MockReport />
}

function MockReport() {
  const [sel, setSel] = useState(moments[0].id)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const navigate = useNavigate()
  const m = moments.find((x) => x.id === sel)!
  const comp = COMPETENCIES.find((c) => c.key === m.competency)!

  return (
    <SelfShell
      header={
        <PageHeader label="SELF-CHECK REPORT" title="결과 리포트">
          <ButtonLink to="/replay/t-order-api" variant="primary">
            <GitBranch size={18} aria-hidden /> 복기 트리 보기
          </ButtonLink>
        </PageHeader>
      }
    >
      <div className="mx-auto grid max-w-[1440px] grid-cols-12 gap-2 p-8">
        {/* 헤더 요약 */}
        <ScoreHero
          kind="DEV TASK"
          title={report.task}
          meta={
            <>
              <span>{report.date}</span>
              <StageSep />
              <span>소요 {report.duration}</span>
              <StageSep />
              <span>AI 대화 18턴</span>
            </>
          }
          total={report.total}
          max={100}
          items={report.scores.map((s) => {
            const c = COMPETENCIES.find((x) => x.key === s.key)!
            return { key: s.key, name: c.name, score: s.score, max: 100, color: c.color }
          })}
          aside={
            <span>
              <b className="tnum font-mono font-semibold text-stage-signal">
                {report.delta >= 0 ? '+' : ''}
                {report.delta}
              </b>{' '}
              지난 응시 대비
            </span>
          }
          seenKey={`mock-${report.task}-${report.date}`}
        />

        {/* 1행: 항목별 점수 */}
        <Panel reveal label="BREAKDOWN" title="항목별 점수" className="col-span-12" flush>
          <ul className="divide-y divide-line">
            {report.scores.map((s) => {
              const c = COMPETENCIES.find((x) => x.key === s.key)!
              const isOpen = open.has(s.key)
              return (
                <li key={s.key}>
                  <div className="grid grid-cols-[168px_280px_48px_1fr_128px] items-center gap-6 px-4 py-3">
                    <span className="text-[15px] font-medium">{c.name}</span>
                    <ScoreBar value={s.score / 100} color={c.color} />
                    <span className="tnum text-right font-mono text-[16px] font-semibold">{s.score}</span>
                    <span className="text-[14px] text-text-muted">{s.note}</span>
                    {s.sub ? (
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={`sub-${s.key}`}
                        onClick={() => {
                          const n = new Set(open)
                          if (isOpen) n.delete(s.key)
                          else n.add(s.key)
                          setOpen(n)
                        }}
                        className="inline-flex h-7 items-center justify-end gap-1 justify-self-end rounded-md px-2 text-[14px] text-text-muted transition-colors duration-[120ms] hover:bg-panel-raised hover:text-text"
                      >
                        하위 기준 {s.sub.length}개
                        <ChevronDown size={16} className={cx('transition-transform duration-[180ms]', isOpen && 'rotate-180')} aria-hidden />
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                  {s.sub && isOpen && (
                    <ul id={`sub-${s.key}`} className="fade-in border-t border-line bg-panel-sunken py-1">
                      {s.sub.map((d) => (
                        <li key={d.code} className="grid grid-cols-[168px_280px_48px_1fr_128px] items-center gap-6 px-4 py-2">
                          <span className="flex items-baseline gap-2 pl-3 text-[14px]">
                            <span className="font-mono text-[12px] text-text-muted">{d.code}</span>
                            {d.name}
                          </span>
                          <div className="flex items-center gap-3">
                            <div className="h-1 flex-1 rounded-full bg-panel-raised">
                              <div className="h-full rounded-full opacity-70" style={{ width: `${d.score}%`, background: c.color }} />
                            </div>
                            <span className="tnum w-16 font-mono text-[12px] text-text-muted">가중 {d.weight}%</span>
                          </div>
                          <span className="tnum text-right font-mono text-[14px] font-semibold">{d.score}</span>
                          <span className="col-span-2 text-[14px] text-text-muted">{d.note}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </Panel>

        {/* 2행: 타임라인 */}
        <Panel
          reveal
          label="TIMELINE"
          title="풀이 타임라인"
          className="col-span-12"
          actions={<span className="text-[14px] text-text-muted">마커를 선택해 결정적 순간 {moments.length}개를 살펴보세요</span>}
        >
          <Timeline selected={sel} onSelect={setSel} />
        </Panel>

        {/* 3행: 선택된 결정적 순간 */}
        <Panel
          key={m.id}
          label={`MOMENT AT ${m.time}`}
          title={m.title}
          className="fade-in col-span-7"
          actions={
            <span className={cx('flex items-center gap-1.5 text-[14px] font-medium', m.tone === 'good' ? 'text-signal' : 'text-caution')}>
              {m.tone === 'good' ? <CircleCheck size={16} aria-hidden /> : <CircleAlert size={16} aria-hidden />}
              {m.tone === 'good' ? '좋은 판단' : '아쉬운 판단'}
            </span>
          }
        >
          <div className="flex items-center gap-2">
            <span className="label">COMPETENCY</span>
            <span className="flex items-center gap-1.5 text-[14px]">
              <span className="size-2 rounded-full" style={{ background: comp.color }} aria-hidden />
              {comp.name}
            </span>
          </div>
          <p className="mt-3 text-body text-text">{m.explain}</p>
          <h3 className="label mt-6">EVIDENCE</h3>
          <div className="mt-2 space-y-2">
            {m.quotes.map((q) => (
              <Quote key={q.turn} m={q} />
            ))}
          </div>
        </Panel>

        <Panel key={`${m.id}-snap`} label="SNAPSHOT" title="이 시점의 상태" className="fade-in col-span-5">
          <ul className="space-y-2">
            {m.snapshot.map((s) => (
              <li key={s} className="flex items-center gap-3 rounded-sm bg-panel-sunken px-3 py-2 font-mono text-[14px] text-text-muted">
                <span className="size-1.5 rounded-full bg-text-faint" aria-hidden />
                {s}
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-md border border-line p-4">
            <p className="text-[15px] leading-6 text-text">
              <span className="tnum font-mono">{m.time}</span> 시점의 코드와 AI 대화로 돌아가, 이 순간부터 다르게 풀어볼 수 있습니다.
            </p>
            <p className="mt-1 text-[14px] text-text-muted">새 분기가 만들어지고, 기존 풀이는 그대로 남습니다.</p>
            <Button variant="secondary" className="mt-4" onClick={() => navigate(`/exam/t-order-api?mode=self&from=${m.id}`)}>
              <RotateCcw size={18} aria-hidden /> 여기서 다시 풀기
            </Button>
          </div>
        </Panel>
      </div>
    </SelfShell>
  )
}
