import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Clock } from 'lucide-react'
import { PageHeader, SelfShell } from '../components/SelfShell'
import { cx, Sep, Tabs } from '../components/ui'
import { CATALOG, KINDS, type CatalogTask, type Track } from '../data/catalog'

// DESIGN.md §7-2a 과제 목록: 직군 필터(전체 / 개발 직군 / 비개발 직군) + 과제 형태별 묶음

type Filter = 'all' | Track

function TaskCard({ t }: { t: CatalogTask }) {
  const ready = !!t.start
  const body = (
    <>
      <div className="flex items-center gap-2">
        <span className={cx('label', ready ? 'text-signal' : 'text-text-faint')}>{ready ? 'AVAILABLE' : 'COMING SOON'}</span>
        <span className="ml-auto rounded-sm bg-panel-raised px-1.5 font-mono text-[12px] text-text-muted">{t.level}</span>
      </div>
      <h3 className={cx('mt-3 text-[17px] leading-6 font-semibold', ready ? 'text-text' : 'text-text-muted')}>{t.title}</h3>
      <p className="mt-1 text-[14px] leading-6 text-text-muted">{t.summary}</p>
      <div className="mt-auto flex items-center gap-3 border-t border-line pt-3 text-[13px] text-text-muted">
        <span className="flex items-center gap-1 font-mono">
          <Clock size={14} aria-hidden />
          {t.minutes}m
        </span>
        <Sep />
        <span>재현성, AI 결과 도출력 채점</span>
        {ready ? (
          <ArrowRight size={18} className="ml-auto text-text-muted transition-transform duration-[120ms] group-hover:translate-x-0.5 group-hover:text-text" aria-hidden />
        ) : (
          <span className="ml-auto text-text-faint">준비 중</span>
        )}
      </div>
    </>
  )
  const cls = 'group flex min-h-[184px] flex-col rounded-md border bg-panel p-4'
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
  const [filter, setFilter] = useState<Filter>('all')
  const kinds = KINDS.filter((k) => filter === 'all' || k.track === filter)
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
            value={filter}
            onChange={setFilter}
            tabs={[
              { value: 'all', label: '전체' },
              { value: 'dev', label: '개발 직군' },
              { value: 'biz', label: '비개발 직군' },
            ]}
          />
        </div>
        <div key={filter} className="fade-in mt-6 space-y-8">
          {(['dev', 'biz'] as Track[])
            .filter((tr) => filter === 'all' || filter === tr)
            .map((tr) => (
              <section key={tr} aria-labelledby={`track-${tr}`}>
                {filter === 'all' && (
                  <h2 id={`track-${tr}`} className="label mb-3">
                    {tr === 'dev' ? 'DEVELOPMENT' : 'NON-DEVELOPMENT'}
                  </h2>
                )}
                <div className="grid grid-cols-4 gap-2">
                  {kinds
                    .filter((k) => k.track === tr)
                    .map((k) => (
                      <div key={k.key} className="flex flex-col gap-2">
                        <div className="px-1">
                          <h3 className="text-[15px] font-semibold text-text">{k.name}</h3>
                          <p className="text-[13px] text-text-muted">{k.desc}</p>
                        </div>
                        {CATALOG.filter((t) => t.kind === k.key).map((t) => (
                          <TaskCard key={t.id} t={t} />
                        ))}
                      </div>
                    ))}
                </div>
              </section>
            ))}
        </div>
      </div>
    </SelfShell>
  )
}
