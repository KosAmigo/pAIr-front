// 생성 기록 카드 줄 (검수 상세 '생성 기록' 탭): 단계별 모델 · 단계별 만든 횟수 · 걸린 시간 · 토큰.
// 칸 너비는 내용에 맞춘다(모델·횟수는 넓게, 시간·토큰은 좁게). 글은 가운데 정렬, 숫자는 CountUp, 들어올 때 차례로 나타난다.
// details.stages 가 없는 옛 기록은 요약 숫자(모델 이름 하나, 전체 횟수)만 보인다.
import type { ReactNode } from 'react'
import { Bot, Clock, Coins, Repeat, type LucideIcon } from 'lucide-react'
import { cx } from '../../../components/cx'
import { CountUp, RevealGroup, RevealItem } from '../../../components/fx'
import { countRows, shortModel, stageSummary, type StageGroupKey } from '../../../data/genReportView'
import type { GenReport } from '../../../data/taskGen'

// 단계 묶음별 색 (기존 토큰만)
const TONE: Record<StageGroupKey, string> = {
  blueprint: 'bg-brand-dim text-brand',
  writing: 'bg-info/12 text-info',
  code: 'bg-branch-2/12 text-branch-2',
  questions: 'bg-comp-6/12 text-comp-6',
  answer: 'bg-signal/12 text-signal',
  fillers: 'bg-caution/12 text-caution',
  judge: 'bg-text/8 text-text',
  other: 'bg-panel-raised text-text-muted',
}
const TILE = 'bg-brand-dim text-brand'

function Card({ icon: Icon, label, className, children }: { icon: LucideIcon; label: string; className?: string; children: ReactNode }) {
  return (
    <RevealItem as="li" className={cx('flex flex-col items-center gap-2 rounded-2xl border border-line bg-panel px-4 py-3.5 text-center shadow-sm', className)}>
      <span className="flex items-center gap-2 text-[13px] font-semibold text-text-muted">
        <span className={cx('inline-flex size-7 items-center justify-center rounded-lg', TILE)} aria-hidden>
          <Icon size={15} />
        </span>
        {label}
      </span>
      {children}
    </RevealItem>
  )
}

const chip = (cls: string) => cx('inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[12px] font-bold', cls)
const fmtNum = (n: number | undefined) => (n == null ? '-' : n.toLocaleString('ko-KR'))

export function GenStats({ r }: { r: GenReport }) {
  const s = stageSummary(r)
  return (
    <RevealGroup as="ul" className={cx('grid grid-cols-2 gap-3', s ? 'lg:grid-cols-[minmax(0,2.2fr)_minmax(0,2fr)_minmax(0,0.8fr)_minmax(0,1.2fr)]' : 'lg:grid-cols-4')}>
      <Card icon={Bot} label="생성 모델">
        {s ? (
          <span className="flex flex-wrap justify-center gap-1.5">
            {s.rows.map((row) => (
              <span key={row.key} className={chip(TONE[row.key])}>
                {row.label} <span className="font-mono">{row.models.join('/') || '-'}</span>
              </span>
            ))}
          </span>
        ) : (
          <span className="max-w-full truncate font-mono text-[15px] font-bold text-text" title={r.model}>
            {shortModel(r.model) === '-' ? r.model : r.model}
          </span>
        )}
      </Card>

      <Card icon={Repeat} label="만든 횟수">
        {s ? (
          <>
            <span className="flex flex-wrap justify-center gap-1.5">
              {countRows(s).map((row) => (
                <span key={row.label} className={chip(row.redo ? 'bg-caution/15 text-caution' : 'bg-panel-raised text-text-muted')}>
                  {row.label} <CountUp value={row.n} className="font-mono" />
                </span>
              ))}
            </span>
            {s.hasBatch && (
              <span className="text-[12px] font-semibold text-text-muted">
                배치 <span className="tnum font-mono">{s.batch}</span> · 바로 <span className="tnum font-mono">{s.now}</span>
              </span>
            )}
          </>
        ) : (
          <span className="text-[20px] font-bold text-text">
            <CountUp value={r.attempts ?? 0} className="font-mono" />번
          </span>
        )}
      </Card>

      <Card icon={Clock} label="걸린 시간">
        <span className="text-[20px] font-bold text-text">
          <CountUp value={r.seconds ?? 0} className="font-mono" />초
        </span>
      </Card>

      <Card icon={Coins} label="토큰 (입력 / 출력)">
        <span className="tnum font-mono text-[15px] font-bold text-text">
          {fmtNum(r.inputTokens)} / {fmtNum(r.outputTokens)}
        </span>
      </Card>
    </RevealGroup>
  )
}
