import type { CheckItem } from './envChecks'

const ICON: Record<CheckItem['status'], string> = {
  pending: '○',
  running: '◌',
  pass: '✓',
  warn: '!',
  fail: '✕',
}

export function CheckList({ items }: { items: CheckItem[] }) {
  return (
    <ul className="checklist">
      {items.map((i) => (
        <li key={i.id} className={`check st-${i.status}`}>
          <span className="check-icon">{ICON[i.status]}</span>
          <div>
            <div>{i.label}</div>
            {i.detail && <div className="muted small">{i.detail}</div>}
          </div>
        </li>
      ))}
    </ul>
  )
}

export function updateItem(items: CheckItem[], id: string, patch: Partial<CheckItem>): CheckItem[] {
  return items.map((i) => (i.id === id ? { ...i, ...patch } : i))
}
