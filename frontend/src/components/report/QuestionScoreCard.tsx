import { Check, X } from 'lucide-react'
import { cx } from '../cx'
import { Panel } from '../ui'
import { questionTypeLabel, type QuestionResults } from '../../data/questions'

/** 리포트의 "문항 n/m점" 카드와 문항별 표. 6개 역량 점수(100점)와 따로 센다. 문항이 없는 리포트는 그리지 않는다 */
export function QuestionScoreCard({ results }: { results: QuestionResults | null | undefined }) {
  if (!results || results.items.length === 0) return null
  const none = <span className="text-text-faint">답 없음</span>
  return (
    <Panel
      reveal
      label="QUESTIONS"
      title="문항 점수"
      className="col-span-12"
      actions={<span className="tnum font-mono text-[15px] font-semibold text-text">문항 {results.score}/{results.max}점</span>}
      flush
    >
      <p className="border-b border-line px-4 py-2.5 text-[14px] text-text-muted">객관식·단답형 문항 점수입니다. 위의 6개 항목 100점과는 따로 계산합니다.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr>
              {['번호', '문항', '내 답', '정답', '결과', '점수'].map((h, i) => (
                <th key={h} className={cx('h-9 px-4 text-left text-[13px] font-semibold text-text-muted', i === 0 && 'w-16', i === 4 && 'w-24', i === 5 && 'w-24 text-right')}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="fx-rows">
            {results.items.map((it) => (
              <tr key={it.seq} className="border-t border-line align-top">
                <td className="tnum px-4 py-2.5 font-mono text-[13px] text-text-faint">Q{String(it.seq).padStart(2, '0')}</td>
                <td className="px-4 py-2.5 text-[15px] leading-6 break-words whitespace-pre-wrap text-text">
                  <span className="mr-2 inline-flex h-[20px] items-center rounded-sm bg-info/12 px-1.5 align-middle text-[12px] font-semibold text-info">{questionTypeLabel[it.type]}</span>
                  {it.content}
                </td>
                <td className="px-4 py-2.5 text-[15px] leading-6 break-words whitespace-pre-wrap text-text">{it.yourAnswer?.trim() ? it.yourAnswer : none}</td>
                <td className="px-4 py-2.5 text-[15px] leading-6 break-words whitespace-pre-wrap text-text-muted">{it.correctAnswer ?? '-'}</td>
                <td className="px-4 py-2.5">
                  <span className={cx('inline-flex items-center gap-1 text-[14px] font-semibold', it.correct ? 'text-signal' : 'text-alert')}>
                    {it.correct ? <Check size={15} aria-hidden /> : <X size={15} aria-hidden />}
                    {it.correct ? '정답' : '오답'}
                  </span>
                </td>
                <td className="tnum px-4 py-2.5 text-right font-mono text-[14px] text-text">
                  {it.score}/{it.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
