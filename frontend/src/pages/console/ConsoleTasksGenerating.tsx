// DESIGN.md §7-9-2-1 만드는 중인 과제 (ADMIN). 왼쪽 목록(대기·진행 + 최근 24시간 끝난 것) + 오른쪽 상세.
// 고른 작업은 주소(?job=)에 남아 새로고침해도 유지된다. 1024px 미만에서는 목록과 상세 중 하나만 보인다.
import { useSearchParams } from 'react-router-dom'
import { MousePointerClick } from 'lucide-react'
import { useConsoleCrumbs } from '../../components/consoleCrumbs'
import { PageHeader } from '../../components/SelfShell'
import { cx } from '../../components/cx'
import { CreateTaskButton } from './task/GenActionButtons'
import { GenJobDetail } from './task/GenJobDetail'
import { GenJobList } from './task/GenJobList'
import { GenRefreshButton } from './task/GenRefreshButton'
import { useGenJobs } from './task/useGenJobs'

export default function ConsoleTasksGenerating() {
  useConsoleCrumbs(['만드는 중인 과제'])
  const [params, setParams] = useSearchParams()
  const jobs = useGenJobs()
  const selected = params.get('job')
  const select = (id: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        if (id) n.set('job', id)
        else n.delete('job')
        return n
      },
      { replace: false },
    )
  const row = jobs.rows?.find((j) => j.jobId === selected) ?? null

  return (
    <>
      <PageHeader label="GENERATING" title="만드는 중인 과제" aside={<GenRefreshButton fetchedAt={jobs.fetchedAt} refreshing={jobs.refreshing} onRefresh={() => void jobs.refreshNow()} />}>
        <CreateTaskButton size="md" />
      </PageHeader>
      <div className="grid w-full items-start gap-5 px-4 pt-4 pb-12 md:px-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className={cx('min-w-0', selected && 'hidden lg:block')}>
          <GenJobList rows={jobs.rows} error={jobs.error} selected={selected} onSelect={select} onChanged={jobs.refresh} />
        </div>
        <div className={cx('min-w-0', !selected && 'hidden lg:block')}>
          {selected ? (
            <GenJobDetail key={selected} jobId={selected} row={row} onBack={() => select(null)} />
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong px-6 py-16 text-center">
              <MousePointerClick size={28} className="text-text-faint" aria-hidden />
              <p className="text-[15px] font-semibold break-keep text-text-muted">왼쪽에서 작업을 고르면 진행 단계와 만들어진 내용을 볼 수 있어요.</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
