import type { Violation } from '../shared/protocol'

const SOURCE_LABEL = { pc: '노트북 캠', phone: '휴대폰 캠' } as const

export function ViolationLog({ items }: { items: Violation[] }) {
  if (items.length === 0) return <p className="muted">아직 경고가 없습니다.</p>
  return (
    <ul className="log">
      {items.map((v) => (
        <li key={v.id} className={`log-item src-${v.source}`}>
          {v.snapshot ? <img src={v.snapshot} alt="" className="thumb" /> : <div className="thumb empty" />}
          <div>
            <div className="log-head">
              <span className={`badge src-${v.source}`}>{SOURCE_LABEL[v.source]}</span>
              <time>{new Date(v.ts).toLocaleTimeString('ko-KR')}</time>
            </div>
            <div>{v.message}</div>
            {v.durationMs > 0 && <div className="muted small">{(v.durationMs / 1000).toFixed(1)}초 지속</div>}
          </div>
        </li>
      ))}
    </ul>
  )
}
