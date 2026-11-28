// 관리자 통계 (ADMIN): 기간을 고르면 회원·자가진단·실전 응시와 평균 점수·AI 비용·결제를 보여 준다 (GET /api/admin/stats).
// 점수 구간은 순서 있는 네 칸의 크기라 한 가지 색 가로 막대로, 나머지는 숫자 타일로 보여 준다.
import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, ChevronDown, Loader2 } from 'lucide-react'
import { cx } from '../../components/cx'
import { ErrorState } from '../../components/ErrorState'
import { PageHeader } from '../../components/SelfShell'
import { Panel } from '../../components/ui'
import type { AdminStats, AiCostPart, StatsBand, StatsTaskScore } from '../../consoleApi'
import { adminStatsQuery, lastDays } from '../../data/adminStats'
import { errorMessage } from '../../data/queryKeys'
import { fmtTokens, fmtUsd } from './aiCostFormat'
import { ConsoleHero } from './ConsoleHero'

const PRESETS = [7, 30, 90] as const
const num = (n: number) => n.toLocaleString('ko-KR')
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`
const score = (s: number | null) => (s == null ? '—' : `${s.toFixed(1)}점`)

export default function ConsoleStats() {
  const [range, setRange] = useState(() => lastDays(30))
  const valid = range.from !== '' && range.to !== '' && range.from <= range.to
  const q = useQuery({ ...adminStatsQuery(range.from, range.to), enabled: valid })
  const preset = PRESETS.find((d) => {
    const r = lastDays(d)
    return r.from === range.from && r.to === range.to
  })

  return (
    <>
      <PageHeader label="STATS" title="통계" />
      <div className="flex flex-col gap-6 p-4 md:p-8">
        {/* 기간: 빠른 선택과 날짜 직접 입력 (한국 시간 날짜, 종료일 포함) */}
        <div role="group" aria-label="기간" className="flex flex-wrap items-center gap-2">
          {PRESETS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={preset === d}
              onClick={() => setRange(lastDays(d))}
              className={cx(
                'h-9 rounded-full border px-4 text-[14px] font-semibold transition-colors',
                preset === d ? 'border-brand bg-brand-dim text-brand' : 'border-line text-text-muted hover:text-text',
              )}
            >
              최근 {d}일
            </button>
          ))}
          <span className="mx-2 h-5 w-px bg-line" aria-hidden />
          <label className="flex items-center gap-2 text-[14px] text-text-muted">
            시작일
            <input type="date" value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              className="h-9 rounded-md border border-line-strong bg-panel px-2 text-text" />
          </label>
          <label className="flex items-center gap-2 text-[14px] text-text-muted">
            종료일
            <input type="date" value={range.to} min={range.from} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              className="h-9 rounded-md border border-line-strong bg-panel px-2 text-text" />
          </label>
          {q.isFetching && <Loader2 size={16} className="animate-spin text-brand" aria-label="불러오는 중" />}
        </div>
        {!valid && <p role="alert" className="text-[14px] text-alert">시작일과 종료일을 고르고, 시작일이 종료일보다 늦지 않게 해 주세요.</p>}

        {q.error ? (
          <ErrorState message={errorMessage(q.error) ?? '통계를 불러오지 못했습니다.'} onRetry={() => void q.refetch()} />
        ) : !q.data ? (
          valid && <p className="flex items-center gap-2 py-10 text-text-muted"><Loader2 size={18} className="animate-spin" aria-hidden /> 불러오는 중</p>
        ) : (
          <StatsBody s={q.data} />
        )}
      </div>
    </>
  )
}

function StatsBody({ s }: { s: AdminStats }) {
  return (
    <>
      <ConsoleHero
        label="통계 요약"
        badge={
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-stage-raised px-2.5 text-[13px] font-semibold text-stage-muted">
            <BarChart3 size={14} aria-hidden /> STATS
          </span>
        }
        title="서비스 이용 통계"
        meta={<span>{s.from} ~ {s.to} (한국 시간, 종료일 포함)</span>}
        stats={[
          { label: '신규 가입', value: s.members.newUsers, unit: '명' },
          { label: '자가진단 채점', value: s.selfDiagnosis.scored, unit: '건' },
          { label: '실전 회차', value: s.live.sessions, unit: '회' },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel label="MEMBERS" title="회원">
          <p className="mb-2 text-[13px] text-text-muted">지금</p>
          <Tiles items={[['일반 회원', `${num(s.members.users)}명`], ['기업 계정', `${num(s.members.companyMembers)}명`], ['회사', `${num(s.members.companies)}곳`]]} />
          <p className="mt-4 mb-2 text-[13px] text-text-muted">기간 안</p>
          <Tiles items={[['신규 가입', `${num(s.members.newUsers)}명`], ['탈퇴', `${num(s.members.withdrawn)}명`]]} />
        </Panel>

        <Panel label="CREDITS" title="결제">
          <Tiles items={[
            ['결제', `${num(s.credits.paidCount)}건`, won(s.credits.paidKrw)],
            ['환불', `${num(s.credits.refundedCount)}건`, won(s.credits.refundedKrw)],
            ['결제 − 환불', won(s.credits.paidKrw - s.credits.refundedKrw)],
          ]} />
          <p className="mt-3 text-[12px] text-text-muted">결제는 결제 완료 시각, 환불은 환불 완료 시각 기준입니다.</p>
        </Panel>

        <ExamPanel label="SELF" title="자가진단" counts={[['시작', s.selfDiagnosis.started], ['제출', s.selfDiagnosis.submitted], ['채점', s.selfDiagnosis.scored]]}
          average={s.selfDiagnosis.averageScore} bands={s.selfDiagnosis.bands} />
        <ExamPanel label="LIVE" title="실전" counts={[['회차', s.live.sessions], ['대상자', s.live.participants], ['응시', s.live.started], ['제출', s.live.submitted], ['채점', s.live.scored]]}
          average={s.live.averageScore} bands={s.live.bands} note="응시 수는 대상자 × 과제 단위입니다." />
      </div>

      <TaskScoresPanel tasks={s.selfDiagnosis.tasks} />
      <AiPanel ai={s.ai} />
    </>
  )
}

function Tiles({ items }: { items: [string, string, string?][] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map(([label, value, sub]) => (
        <div key={label} className="rounded-lg border border-line bg-panel-raised px-3 py-2">
          <dt className="text-[13px] text-text-muted">{label}</dt>
          <dd className="tnum mt-0.5 text-[20px] font-semibold text-text">{value}</dd>
          {sub && <dd className="tnum text-[13px] text-text-muted">{sub}</dd>}
        </div>
      ))}
    </dl>
  )
}

function ExamPanel({ label, title, counts, average, bands, note }: {
  label: string; title: string; counts: [string, number][]; average: number | null; bands: StatsBand[]; note?: string
}) {
  return (
    <Panel label={label} title={title}>
      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        {counts.map(([l, v]) => (
          <div key={l}>
            <dt className="text-[13px] text-text-muted">{l}</dt>
            <dd className="tnum text-[18px] font-semibold text-text">{num(v)}</dd>
          </div>
        ))}
        <div className="ml-auto text-right">
          <dt className="text-[13px] text-text-muted">평균 점수</dt>
          <dd className="tnum text-[24px] font-bold text-text">{score(average)}</dd>
        </div>
      </dl>
      <ScoreBands bands={bands} name={title} />
      {note && <p className="mt-3 text-[12px] text-text-muted">{note}</p>}
    </Panel>
  )
}

/** 점수 구간 분포: 한 가지 색 가로 막대(가장 많은 구간이 가득), 숫자는 글자로 같이 보인다 */
function ScoreBands({ bands, name }: { bands: StatsBand[]; name: string }) {
  const max = Math.max(1, ...bands.map((b) => b.count))
  const total = bands.reduce((a, b) => a + b.count, 0)
  return (
    <div className="mt-4">
      <p className="mb-2 text-[13px] text-text-muted">점수 구간별 채점 건수</p>
      <ul aria-label={`${name} 점수 구간별 채점 건수`} className="flex flex-col gap-2">
        {[...bands].reverse().map((b) => {
          const pct = total === 0 ? 0 : Math.round((b.count / total) * 100)
          return (
            <li key={b.range} className="grid grid-cols-[72px_minmax(0,1fr)_88px] items-center gap-3 text-[13px]"
              title={`${b.range}점: ${num(b.count)}건 (${pct}%)`}>
              <span className="tnum text-text-muted">{b.range}점</span>
              <span className="h-3 rounded-full bg-panel-raised" aria-hidden>
                <span className="block h-full rounded-full bg-brand" style={{ width: `${(b.count / max) * 100}%`, minWidth: b.count > 0 ? 4 : 0 }} />
              </span>
              <span className="tnum text-right text-text">{num(b.count)}건 <span className="text-text-muted">{pct}%</span></span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** 패널 머리 오른쪽의 펼치기/접기 버튼. controls 는 펼쳤을 때 나오는 본문의 id */
function FoldButton({ open, onToggle, controls }: { open: boolean; onToggle: () => void; controls: string }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] font-semibold text-brand hover:bg-panel-raised"
    >
      {open ? '접기' : '펼치기'}
      <ChevronDown size={16} aria-hidden className={cx('transition-transform', open && 'rotate-180')} />
    </button>
  )
}

/**
 * 자가진단 과제별 평균 점수: 채점이 많은 순. 평균 점수는 막대(0~100점 눈금)와 숫자로.
 * 과제가 늘어나면 길어지므로 처음엔 접어 두고, 접힌 상태에서는 과제 수만 보여 준다.
 */
function TaskScoresPanel({ tasks }: { tasks: StatsTaskScore[] }) {
  const [open, setOpen] = useState(false)
  return (
    <Panel label="SELF BY TASK" title={<>자가진단 과제별 평균 점수 <span className="ml-1 text-[13px] font-normal text-text-muted">과제 {num(tasks.length)}개</span></>}
      actions={tasks.length > 0 ? <FoldButton open={open} onToggle={() => setOpen((o) => !o)} controls="task-scores" /> : undefined}>
      {tasks.length === 0 ? (
        <p className="py-6 text-center text-[14px] text-text-muted">이 기간에 채점된 자가진단이 없습니다.</p>
      ) : !open ? (
        <p className="text-[13px] text-text-muted">펼치면 과제마다 채점 수와 평균 점수를 볼 수 있습니다.</p>
      ) : (
        <div id="task-scores" className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[14px]">
            <thead className="text-[13px] text-text-muted">
              <tr>
                <th scope="col" className="py-1 text-left font-normal">과제</th>
                <th scope="col" className="py-1 pr-3 text-right font-normal">채점</th>
                <th scope="col" className="w-[40%] py-1 pl-3 text-left font-normal">평균 점수</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.taskId} className="border-t border-line">
                  <th scope="row" className="py-2 pr-3 text-left font-semibold text-text">
                    {t.title} <span className="ml-1 font-mono text-[12px] font-normal text-text-muted">{t.taskId}</span>
                  </th>
                  <td className="tnum py-2 pr-3 text-right">{num(t.scored)}건</td>
                  <td className="py-2 pl-3">
                    <div className="flex items-center gap-3" title={`${t.title}: 평균 ${score(t.averageScore)} (${num(t.scored)}건)`}>
                      <span className="h-3 flex-1 rounded-full bg-panel-raised" aria-hidden>
                        <span className="block h-full rounded-full bg-brand" style={{ width: `${t.averageScore ?? 0}%` }} />
                      </span>
                      <span className="tnum w-16 text-right font-semibold text-text">{score(t.averageScore)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

/** AI 사용량: 머리에 총 예상 비용만 두고 용도별 표·설명·모델별은 접어 둔다. 단가 없는 모델 경고는 접혀도 보인다 */
function AiPanel({ ai }: { ai: AdminStats['ai'] }) {
  const [open, setOpen] = useState(false)
  const rows: [string, AiCostPart | null, ReactNode][] = [
    ['자가진단 AI 채팅', ai.selfChat, null],
    ['실전 AI 채팅', ai.liveChat, null],
    ['채점', ai.scoring, null],
  ]
  const models = [
    ...ai.selfChat.models.map((m) => ({ ...m, use: '자가진단 채팅' })),
    ...ai.liveChat.models.map((m) => ({ ...m, use: '실전 채팅' })),
    ...ai.scoring.models.map((m) => ({ ...m, use: '채점' })),
  ]
  return (
    <Panel label="AI COST" title={<>AI 사용량 <span className="tnum ml-2 font-bold">{fmtUsd(ai.totalUsd)}</span></>}
      actions={<FoldButton open={open} onToggle={() => setOpen((o) => !o)} controls="ai-usage" />}>
      {ai.unpricedModels.length > 0 && (
        <p role="note" className="mb-2 text-[13px] text-caution">
          단가가 없어 비용 합계에서 빠진 모델: {ai.unpricedModels.join(', ')}
        </p>
      )}
      {!open ? (
        <p className="text-[13px] text-text-muted">펼치면 용도별(채팅·채점·과제 생성) 호출 수, 토큰, 예상 비용을 볼 수 있습니다.</p>
      ) : (
        <div id="ai-usage">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[14px]">
              <thead className="text-[13px] text-text-muted">
                <tr>
                  <th scope="col" className="py-1 text-left font-normal">용도</th>
                  <th scope="col" className="py-1 pr-3 text-right font-normal">호출</th>
                  <th scope="col" className="py-1 pr-3 text-right font-normal">입력 토큰</th>
                  <th scope="col" className="py-1 pr-3 text-right font-normal">출력 토큰</th>
                  <th scope="col" className="py-1 text-right font-normal">예상 비용</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, p]) => p && (
                  <tr key={label} className="border-t border-line">
                    <th scope="row" className="py-2 pr-3 text-left font-semibold text-text">{label}</th>
                    <td className="tnum py-2 pr-3 text-right">{num(p.calls)}회</td>
                    <td className="tnum py-2 pr-3 text-right">{fmtTokens(p.inputTokens)}</td>
                    <td className="tnum py-2 pr-3 text-right">{fmtTokens(p.outputTokens)}</td>
                    <td className="tnum py-2 text-right font-semibold">{fmtUsd(p.usd)}</td>
                  </tr>
                ))}
                <tr className="border-t border-line">
                  <th scope="row" className="py-2 pr-3 text-left font-semibold text-text">
                    AI 과제 생성 <span className="font-normal text-text-muted">({num(ai.taskGen.jobs)}개 작업)</span>
                  </th>
                  <td className="tnum py-2 pr-3 text-right">{num(ai.taskGen.calls)}회</td>
                  <td className="tnum py-2 pr-3 text-right">{fmtTokens(ai.taskGen.inputTokens)}</td>
                  <td className="tnum py-2 pr-3 text-right">{fmtTokens(ai.taskGen.outputTokens)}</td>
                  <td className="tnum py-2 text-right font-semibold">{fmtUsd(ai.taskGen.usd)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[12px] text-text-muted">채팅·채점은 설정 단가로 계산한 추정치(캐시 할인 미반영), 과제 생성은 작업에 기록된 비용입니다.</p>
          {models.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[13px] text-text-muted">모델별 보기</summary>
              <ul className="mt-1 flex flex-col gap-0.5 text-[13px]">
                {models.map((m) => (
                  <li key={`${m.use}-${m.model}`} className="tnum flex gap-3">
                    <span className="w-24 text-text-muted">{m.use}</span>
                    <span className="min-w-0 flex-1 truncate font-mono">{m.model}</span>
                    <span>{num(m.calls)}회</span>
                    <span className="w-20 text-right">{m.usd == null ? '단가 없음' : fmtUsd(m.usd)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Panel>
  )
}
