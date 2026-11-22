// 환경 점검 결과를 콘솔이 보기 좋게 요약하고, 응시자 화면의 안내 메시지에서 안 읽은 것을 고르는 순수 함수.
// 서버는 점검 JSON 을 그대로 돌려준다 ({ pc: { items }, phone: { items } | null }). 모양이 달라도 화면이 깨지지 않게 방어한다.

export type SummaryStatus = 'fail' | 'warn' | 'pass' | 'pending'

export type SummaryItem = {
  id: string
  label: string
  status: SummaryStatus
  /** 점검이 남긴 사유 (예: "너무 어둡습니다") */
  detail: string
}

export type EnvCheckSummary = {
  /** 실패 → 주의 → 통과 → 미완료 순 */
  items: SummaryItem[]
  /** 실패·주의 항목만 */
  issues: SummaryItem[]
  counts: Record<SummaryStatus, number>
}

const ORDER: SummaryStatus[] = ['fail', 'warn', 'pass', 'pending']

function toStatus(raw: unknown): SummaryStatus | null {
  if (raw === 'fail' || raw === 'warn' || raw === 'pass') return raw
  if (raw === 'pending' || raw === 'running') return 'pending' // 아직 끝나지 않은 항목은 미완료로 묶는다
  return null
}

function itemsOf(report: unknown): SummaryItem[] {
  const raw = (report as { items?: unknown } | null | undefined)?.items
  if (!Array.isArray(raw)) return []
  const out: SummaryItem[] = []
  for (const r of raw) {
    const o = r as { id?: unknown; label?: unknown; status?: unknown; detail?: unknown } | null
    const status = toStatus(o?.status)
    if (!o || typeof o.id !== 'string' || !status) continue
    out.push({
      id: o.id,
      label: typeof o.label === 'string' && o.label ? o.label : o.id,
      status,
      detail: typeof o.detail === 'string' ? o.detail : '',
    })
  }
  return out
}

export function summarizeEnvCheck(result: unknown): EnvCheckSummary {
  const r = result as { pc?: unknown; phone?: unknown } | null | undefined
  const all = [...itemsOf(r?.pc), ...itemsOf(r?.phone)]
  const items = ORDER.flatMap((s) => all.filter((i) => i.status === s)) // 같은 상태 안에서는 점검 순서를 지킨다
  const counts: Record<SummaryStatus, number> = { fail: 0, warn: 0, pass: 0, pending: 0 }
  for (const i of items) counts[i.status]++
  return { items, issues: items.filter((i) => i.status === 'fail' || i.status === 'warn'), counts }
}

export type NoticeLike = { id: number; message: string; sentAt: string; readAt: string | null }

/** 아직 확인하지 않은 안내 (보낸 순서 그대로) */
export function unreadNotices<T extends NoticeLike>(list: readonly T[]): T[] {
  return list.filter((n) => n.readAt === null)
}
