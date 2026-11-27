import type { Task } from '../../api'
import { StatusDot } from '../../components/ui'

export function DocChecks({ task, doc }: { task: Task & { requiredHeadings?: string[] }; doc: string }) {
  const heads = task.requiredHeadings ?? []
  return (
    <ul className="space-y-1 font-sans text-[14px]">
      {heads.map((h) => {
        const at = doc.indexOf(h)
        const end = at < 0 ? -1 : doc.indexOf('\n', at)
        const next = end < 0 ? -1 : doc.indexOf('\n#', end)
        const body = end < 0 ? '' : doc.slice(end, next < 0 ? undefined : next).trim()
        const ok = at >= 0 && body.length > 0
        return (
          <li key={h}>
            <StatusDot status={ok ? 'ok' : 'check'} label={`${h.replace(/^#+\s*/, '')} ${ok ? '작성됨' : '비어 있음'}`} />
          </li>
        )
      })}
      <li className="tnum pt-2 font-mono text-[13px] text-text-faint">{doc.length} chars</li>
    </ul>
  )
}
