// 회차 AI 비용(관리자 전용): AI 채팅과 채점 모델 호출의 토큰과 추정 금액. 기업은 무료로 쓰므로 매니저·감독관에게는 보이지 않는다.
import { Coins } from 'lucide-react'
import { useAuth } from '../../auth/auth'
import { cx } from '../../components/cx'
import { ErrorState } from '../../components/ErrorState'
import { consoleApi, type AiCostPart } from '../../consoleApi'
import { useLoad } from '../../data/consoleSessions'
import { fmtTokens, fmtUsd } from './aiCostFormat'

function PartRow({ label, part }: { label: string; part: AiCostPart }) {
  return (
    <tr className="border-t border-line align-top">
      <th scope="row" className="py-2 pr-3 text-left font-semibold text-text">{label}</th>
      <td className="tnum py-2 pr-3 text-right">{part.calls.toLocaleString('ko-KR')}회</td>
      <td className="tnum py-2 pr-3 text-right">{fmtTokens(part.inputTokens)}</td>
      <td className="tnum py-2 pr-3 text-right">{fmtTokens(part.outputTokens)}</td>
      <td className="tnum py-2 text-right font-semibold">{fmtUsd(part.usd)}</td>
    </tr>
  )
}

export function AiCostCard({ sessionId, className }: { sessionId: number; className?: string }) {
  const admin = useAuth().user?.role === 'ADMIN'
  const r = useLoad(admin ? `ai-cost-${sessionId}` : null, () => consoleApi.aiCost(sessionId))
  if (!admin) return null
  if (r.error && !r.data) return <ErrorState compact className={className} message={`AI 비용: ${r.error}`} onRetry={r.reload} />
  if (!r.data) return null
  const d = r.data
  const models = [...d.chat.models.map((m) => ({ ...m, use: '채팅' })), ...d.scoring.models.map((m) => ({ ...m, use: '채점' }))]
  return (
    <section aria-label="AI 비용" className={cx('rounded-xl border border-line bg-panel px-4 py-3 text-[13px] shadow-sm', className)}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Coins size={15} className="self-center text-text-muted" aria-hidden />
        <span className="label">AI COST</span>
        <strong className="tnum text-[18px] font-semibold text-text">{fmtUsd(d.totalUsd)}</strong>
        <span className="text-text-muted">
          응시 {d.attempts}건{d.perAttemptUsd != null && ` · 1건당 ${fmtUsd(d.perAttemptUsd)}`}
        </span>
        <span className="ml-auto text-[12px] text-text-muted">관리자만 보임 · 설정 단가 기준 추정(캐시 할인 미반영)</span>
      </header>
      <table className="mt-2 w-full">
        <thead className="text-[12px] text-text-muted">
          <tr>
            <th scope="col" className="py-1 text-left font-normal">용도</th>
            <th scope="col" className="py-1 pr-3 text-right font-normal">호출</th>
            <th scope="col" className="py-1 pr-3 text-right font-normal">입력 토큰</th>
            <th scope="col" className="py-1 pr-3 text-right font-normal">출력 토큰</th>
            <th scope="col" className="py-1 text-right font-normal">금액</th>
          </tr>
        </thead>
        <tbody>
          <PartRow label="AI 채팅" part={d.chat} />
          <PartRow label="채점" part={d.scoring} />
        </tbody>
      </table>
      {models.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[12px] text-text-muted">모델별 보기</summary>
          <ul className="mt-1 flex flex-col gap-0.5 text-[12px]">
            {models.map((m) => (
              <li key={`${m.use}-${m.model}`} className="tnum flex flex-wrap gap-x-2 font-mono">
                <span className="text-text-muted">{m.use}</span>
                <span>{m.model}</span>
                <span className="text-text-muted">
                  {m.calls}회 · 입력 {fmtTokens(m.inputTokens)}{m.cachedTokens > 0 && `(캐시 ${fmtTokens(m.cachedTokens)})`} · 출력 {fmtTokens(m.outputTokens)}
                </span>
                <span className="ml-auto">{m.usd == null ? '단가 없음' : fmtUsd(m.usd)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {d.unpricedModels.length > 0 && (
        <p role="note" className="mt-2 text-[12px] text-text-muted">
          단가가 없어 합계에서 빠진 모델: {d.unpricedModels.join(', ')} (백엔드 pair.pricing 에 추가)
        </p>
      )}
    </section>
  )
}
