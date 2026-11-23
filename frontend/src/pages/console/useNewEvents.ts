// 감독관 콘솔: 폴링으로 새로 들어온 이벤트를 골라 둔다. 처음 불러온 목록은 기준선일 뿐이라 알리지 않고,
// 그 뒤에 새로 생긴 이벤트만 감독관이 확인(dismiss)할 때까지 쌓아 둔다.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProctorEventView } from '../../consoleApi'

interface Alerts {
  scope: string
  items: ProctorEventView[]
}

/** scope: 응시자 구분 키(회차·응시자). 바뀌면 기준선을 새로 잡는다 */
export function useNewEvents(scope: string, events: ProctorEventView[] | null) {
  const seen = useRef<{ scope: string; ids: Set<number> } | null>(null)
  const [alerts, setAlerts] = useState<Alerts>({ scope, items: [] })

  useEffect(() => {
    if (!events) return
    if (seen.current?.scope !== scope) {
      seen.current = { scope, ids: new Set(events.map((e) => e.id)) }
      setAlerts((a) => (a.items.length ? { scope, items: [] } : a))
      return
    }
    const ids = seen.current.ids
    const fresh = events.filter((e) => !ids.has(e.id))
    if (fresh.length === 0) return
    fresh.forEach((e) => ids.add(e.id))
    setAlerts((a) => ({ scope, items: [...(a.scope === scope ? a.items : []), ...fresh] }))
  }, [scope, events])

  const dismiss = useCallback(() => setAlerts({ scope, items: [] }), [scope])
  return { items: alerts.scope === scope ? alerts.items : [], dismiss }
}
