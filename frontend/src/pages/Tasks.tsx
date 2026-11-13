import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Clock } from 'lucide-react'
import { PageHeader, SelfShell } from '../components/SelfShell'
import { cx, Sep, Tabs } from '../components/ui'
import { CATALOG, KINDS, type CatalogTask, type Track } from '../data/catalog'

// DESIGN.md §7-2a 과제 목록: 직군 탭(개발 직군 / 비개발 직군) 안에서 과제 형태별 섹션을 세로로 쌓는다

function TaskCard({ t }: { t: CatalogTask }) {
  const ready = !!t.start
  const body = (
    <>
      <div className="flex items-start gap-3">
        <h3 className={cx('text-[17px] leading-6 font-semibold', ready ? 'text-text' : 'text-text-muted')}>{t.title}</h3>
        <span className="ml-auto shrink-0 rounded-sm bg-panel-raised px-1.5 font-mono text-[12px] text-text-muted">{t.level}</span>
      </div>
      <p className="mt-1 text-[14px] leading-6 text-text-muted">{t.summary}</p>
      <div className="mt-auto flex items-center gap-3 pt-3 text-[13px] text-text-muted">
        <span className="flex items-center gap-1 font-mono">
          <Clock size={14} aria-hidden />
          {t.minutes}m
        </span>
        <Sep />
        <span>6개 역량 채점</span>
        {ready ? (
          <ArrowRight size={18} className="ml-auto text-text-muted transition-transform duration-[120ms] group-hover:translate-x-0.5 group-hover:text-text" aria-hidden />
        ) : (
          <span className="ml-auto text-text-faint">준비 중</span>
        )}
      </div>
    </>
  )
  const cls = 'group flex min-h-[144px] flex-col rounded-md border bg-panel p-4'
  return ready ? (
    <Link to={t.start!} className={cx(cls, 'border-line transition-colors duration-[120ms] hover:border-signal focus-visible:border-signal')}>
      {body}
    </Link>
  ) : (
    <div className={cx(cls, 'border-dashed border-line opacity-70')} aria-disabled="true">
      {body}
    </div>
  )
}

export default function Tasks() {
  const [track, setTrack] = useState<Track>('dev')
  const kinds = KINDS.filter((k) => k.track === track)
  const available = CATALOG.filter((t) => t.start).length
  return (
    <SelfShell
      header={
        <PageHeader label="TASKS" title="과제">
          <span className="font-mono text-[13px] text-text-muted">
            응시 가능 {available}개 / 전체 {CATALOG.length}개
          </span>
        </PageHeader>
      }
    >
      <div className="mx-auto max-w-[1440px] px-8 py-6">
        <div className="border-b border-line">
          <Tabs
            value={track}
            onChange={setTrack}
            tabs={[
              { value: 'dev', label: '개발 직군' },
              { value: 'biz', label: '비개발 직군' },
            ]}
          />
        </div>
        <div key={track} className="fade-in mt-6 space-y-8">
          {kinds.map((k) => (
            <section key={k.key} aria-labelledby={`kind-${k.key}`}>
              <div className="mb-3 flex items-baseline gap-3">
                <h2 id={`kind-${k.key}`} className="text-h2 font-semibold text-text">
                  {k.name}
                </h2>
                <p className="text-[14px] text-text-muted">{k.desc}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {CATALOG.filter((t) => t.kind === k.key).map((t) => (
                  <TaskCard key={t.id} t={t} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </SelfShell>
  )
}
