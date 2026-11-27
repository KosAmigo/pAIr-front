import type { Turn } from '../../api'
import { Button } from '../../components/ui'

/** 후속 질문 단계: 응시자가 AI에게 보낸 질문만 모아 보여 준다. [답변에 넣기]로 턴 번호를 지금 답변에 붙인다. */
export function PromptList({ turns, onInsert }: { turns: Turn[]; onInsert: (ref: string) => void }) {
  const prompts = turns.filter((t) => t.role === 'user')
  if (prompts.length === 0) return <p className="p-4 text-[14px] text-text-muted">AI에게 보낸 질문이 없습니다.</p>
  return (
    <ol className="h-full divide-y divide-line overflow-auto bg-panel-sunken">
      {prompts.map((t) => {
        const ref = `#T${String(t.turn).padStart(2, '0')}`
        return (
          <li key={t.turn} className="px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="rounded-sm bg-info/12 px-1.5 font-mono text-[12px] text-info">{ref}</span>
              <span className="tnum font-mono text-[12px] text-text-faint">{t.time}</span>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => onInsert(ref)}>
                답변에 넣기
              </Button>
            </div>
            <p className="mt-1.5 text-[14px] leading-6 whitespace-pre-wrap text-text">{t.text}</p>
          </li>
        )
      })}
    </ol>
  )
}
