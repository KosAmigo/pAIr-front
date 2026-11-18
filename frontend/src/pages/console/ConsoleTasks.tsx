// DESIGN.md §7-9-1 과제 목록 (ADMIN): 검수 대기(HIDDEN) / 공개(OPEN) / 응시 마감(CLOSED)
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, FileStack, Search, Sparkles } from 'lucide-react'
import { cx } from '../../components/cx'
import { PageHeader } from '../../components/SelfShell'
import { ButtonLink, Tabs } from '../../components/ui'
import {
  activeSessionCount,
  duplicateTask,
  kindName,
  setTaskStatus,
  tabOf,
  useConsoleTasks,
  type CTask,
  type TaskTab,
} from '../../data/consoleTasks'
import { ConfirmModal, RowMenu } from './common'
import { LEVEL_CLS, fmtTime, useToast } from './format'

export default function ConsoleTasks() {
  const all = useConsoleTasks()
  const nav = useNavigate()
  const toast = useToast()
  const [tab, setTab] = useState<TaskTab>('draft')
  const [track, setTrack] = useState<'ALL' | 'DEV' | 'BIZ'>('ALL')
  const [q, setQ] = useState('')
  const [closing, setClosing] = useState<CTask | null>(null)

  const counts = useMemo(() => {
    const c = { draft: 0, open: 0, closed: 0 }
    all.forEach((t) => c[tabOf(t)]++)
    return c
  }, [all])
  const rows = all.filter(
    (t) =>
      tabOf(t) === tab &&
      (track === 'ALL' || t.track === track) &&
      (!q.trim() || `${t.title} ${t.code}`.toLowerCase().includes(q.trim().toLowerCase())),
  )
  const visibleQuestions = (t: CTask) => t.questions.filter((x) => x.stage === 'TASK').length

  return (
    <>
      <PageHeader label="TASKS" title="과제">
        <ButtonLink to="/console/tasks/new" variant="primary">
          <Sparkles size={16} aria-hidden /> AI로 과제 만들기
        </ButtonLink>
      </PageHeader>

      <div className="p-8">
        <div className="flex flex-wrap items-end gap-4 border-b border-line">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'draft', label: <>검수 대기 <Count n={counts.draft} warn /></> },
              { value: 'open', label: <>공개 <Count n={counts.open} /></> },
              { value: 'closed', label: <>응시 마감 <Count n={counts.closed} /></> },
            ]}
          />
          <div className="ml-auto flex items-center gap-2 pb-2">
            <div role="radiogroup" aria-label="직군" className="flex rounded-md border border-line bg-panel p-0.5">
              {(
                [
                  ['ALL', '전체'],
                  ['DEV', '개발'],
                  ['BIZ', '비개발'],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={track === v}
                  onClick={() => setTrack(v)}
                  className={cx('h-7 rounded-sm px-3 text-[14px] font-medium', track === v ? 'bg-brand-dim text-brand' : 'text-text-muted hover:text-text')}
                >
                  {l}
                </button>
              ))}
            </div>
            <label className="relative">
              <span className="sr-only">과제 검색</span>
              <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-faint" aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="제목, 과제 코드"
                className="h-8 w-56 rounded-md border border-line-strong bg-panel pr-3 pl-9 text-[14px] outline-none focus:border-brand"
              />
            </label>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-md border border-line bg-panel shadow-sm">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <FileStack size={28} strokeWidth={1.75} className="text-text-faint" aria-hidden />
              <p className="text-[15px] text-text-muted">
                {tab === 'draft' ? '검수할 초안이 없습니다. AI로 새 과제를 만들어 보세요.' : '조건에 맞는 과제가 없습니다.'}
              </p>
              {tab === 'draft' && (
                <ButtonLink to="/console/tasks/new" variant="primary" size="sm">
                  <Sparkles size={14} aria-hidden /> AI로 과제 만들기
                </ButtonLink>
              )}
            </div>
          ) : (
            <table className="w-full text-[14px]">
              <thead>
                <tr className="h-10 border-b border-line text-left">
                  {['과제', '직군', '형태', '난이도', '시간', '파일', '문항', '수정 시각', ''].map((h, i) => (
                    <th key={i} className={cx('px-4 text-[13px] font-semibold text-text-muted', i >= 4 && i <= 6 && 'text-right')}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => nav(`/console/tasks/${t.id}`)}
                    className="h-14 cursor-pointer border-b border-line last:border-0 hover:bg-panel-raised"
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {tabOf(t) === 'draft' && (
                          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-caution">
                            <i className="size-1.5 rounded-full bg-caution" aria-hidden />
                            검수 대기
                          </span>
                        )}
                        <span className="text-[15px] font-semibold text-text">{t.title}</span>
                      </div>
                      <span className="font-mono text-[12px] text-text-muted">{t.code}</span>
                    </td>
                    <td className="px-4 text-text-muted">{t.track === 'DEV' ? '개발' : '비개발'}</td>
                    <td className="px-4 text-text-muted">{kindName(t.category)}</td>
                    <td className="px-4">
                      <span className={cx('rounded-sm px-1.5 py-0.5 text-[12px] font-semibold', LEVEL_CLS[t.difficulty])}>{t.difficulty}</span>
                    </td>
                    <td className="tnum px-4 text-right font-mono text-text-muted">{t.minutes}분</td>
                    <td className="tnum px-4 text-right font-mono text-text-muted">{t.files.length}</td>
                    <td className="tnum px-4 text-right font-mono text-text-muted">{visibleQuestions(t)}</td>
                    <td className="tnum px-4 font-mono text-[13px] text-text-muted">{fmtTime(t.updatedAt)}</td>
                    <td className="w-20 px-2">
                      <div className="flex items-center justify-end gap-1">
                        <RowMenu
                          label={`${t.title} 메뉴`}
                          items={[
                            { text: '편집', onClick: () => nav(`/console/tasks/${t.id}`) },
                            {
                              text: '복제',
                              onClick: () => {
                                const id = duplicateTask(t.id)
                                nav(`/console/tasks/${id}`)
                              },
                            },
                            ...(t.status === 'OPEN'
                              ? [
                                  { text: '응시 마감', onClick: () => (setTaskStatus(t.id, 'CLOSED'), toast.show('응시를 마감했습니다. 목록에는 남고 새 응시만 막힙니다')) },
                                  { text: '공개 취소', danger: true, onClick: () => setClosing(t) },
                                ]
                              : t.status === 'CLOSED'
                                ? [
                                    { text: '다시 공개', onClick: () => (setTaskStatus(t.id, 'OPEN'), toast.show('다시 공개했습니다')) },
                                    { text: '공개 취소', danger: true, onClick: () => setClosing(t) },
                                  ]
                                : [{ text: '공개하기', onClick: () => nav(`/console/tasks/${t.id}?publish=1`) }]),
                          ]}
                        />
                        <ChevronRight size={16} className="text-text-faint" aria-hidden />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {closing && (
        <ConfirmModal
          title="공개를 취소할까요?"
          danger
          confirm="공개 취소"
          disabled={activeSessionCount(closing.id) > 0}
          onClose={() => setClosing(null)}
          onConfirm={() => {
            setTaskStatus(closing.id, 'HIDDEN')
            setClosing(null)
            toast.show('공개를 취소했습니다. 검수 대기로 옮겼습니다')
          }}
          body={
            activeSessionCount(closing.id) > 0 ? (
              <span className="text-alert">
                진행 중이거나 예정된 회차 {activeSessionCount(closing.id)}개가 이 과제를 씁니다. 회차가 끝난 뒤에 공개를 취소할 수 있습니다.
              </span>
            ) : (
              <>「{closing.title}」이 검수 대기로 돌아가 자가진단 과제 목록과 회차 만들기에서 사라집니다. 지난 응시 기록은 그대로 남습니다.</>
            )
          }
        />
      )}
      {toast.node}
    </>
  )
}

function Count({ n, warn }: { n: number; warn?: boolean }) {
  return (
    <span className={cx('tnum ml-1 rounded-sm px-1.5 font-mono text-[12px]', warn && n > 0 ? 'bg-caution/12 text-caution' : 'bg-panel-raised text-text-muted')}>{n}</span>
  )
}
