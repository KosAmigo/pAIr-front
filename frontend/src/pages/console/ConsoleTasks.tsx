// DESIGN.md §7-9-1 과제 목록 (ADMIN): 검수 대기(HIDDEN) / 공개(OPEN). 데이터는 백엔드 /api/console/tasks.
// 2026-11-19 개편: 상태 탭을 단계 카드(StatTabs)로. 검수 대기가 있으면 caution 으로 눈에 띄게.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, FileCheck2, FileClock, FileStack, Loader2, Search, Sparkles } from 'lucide-react'
import { cx } from '../../components/cx'
import { ErrorState } from '../../components/ErrorState'
import { PageHeader } from '../../components/SelfShell'
import { ButtonLink } from '../../components/ui'
import { StatTabs } from './StatTabs'
import { Reveal } from '../../components/fx'
import type { ConsoleTaskSummary } from '../../consoleApi'
import { loadTasks, setPublished, tabOf, trackName, useTaskList, type TaskTab } from '../../data/consoleTasks'
import { ConfirmModal, RowMenu } from './common'
import { fmtTime, useToast } from './format'
import { ReviewQueue } from './ReviewQueue'
import { KindTile } from '../../components/taskKind'

export default function ConsoleTasks() {
  const { list, error } = useTaskList()
  const all = useMemo(() => list ?? [], [list])
  const nav = useNavigate()
  const toast = useToast()
  const [tab, setTab] = useState<TaskTab>('draft')
  const [track, setTrack] = useState<'ALL' | 'dev' | 'biz'>('ALL')
  const [q, setQ] = useState('')
  const [closing, setClosing] = useState<ConsoleTaskSummary | null>(null)
  const [busy, setBusy] = useState(false)

  const counts = useMemo(() => {
    const c = { draft: 0, open: 0 }
    all.forEach((t) => c[tabOf(t.status)]++)
    return c
  }, [all])
  const rows = all.filter(
    (t) =>
      tabOf(t.status) === tab &&
      (track === 'ALL' || t.type === track) &&
      (!q.trim() || `${t.title} ${t.id}`.toLowerCase().includes(q.trim().toLowerCase())),
  )

  const change = async (t: ConsoleTaskSummary, open: boolean) => {
    setBusy(true)
    try {
      await setPublished(t.id, open)
      toast.show(open ? '공개했습니다. 자가진단과 회차 만들기에 나옵니다' : '공개를 취소했습니다. 검수 대기로 옮겼습니다')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '바꾸지 못했습니다')
    } finally {
      setBusy(false)
    }
  }

  const menuFor = (t: ConsoleTaskSummary) => [
    { text: '자세히 보기', onClick: () => nav(`/console/tasks/${t.id}`) },
    t.status === 'OPEN'
      ? { text: '공개 취소', danger: true, disabled: busy, onClick: () => setClosing(t) }
      : { text: '공개하기', disabled: busy, onClick: () => void change(t, true) },
  ]

  return (
    <>
      <PageHeader label="TASKS" title="과제">
        <ButtonLink to="/console/tasks/new" variant="primary">
          <Sparkles size={16} aria-hidden /> AI로 과제 만들기
        </ButtonLink>
      </PageHeader>

      <div className="flex flex-col gap-4 p-8">
        <StatTabs
          id="task-status"
          label="과제 상태"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'draft', label: '검수 대기', hint: '숨김 상태, 사람이 확인 전', icon: FileClock, n: counts.draft, tone: 'caution' },
            { value: 'open', label: '공개', hint: '회차에 쓸 수 있는 과제', icon: FileCheck2, n: counts.open },
          ]}
        />
        <div className="flex flex-wrap items-center gap-4">
          <div className="ml-auto flex items-center gap-2">
            <div role="radiogroup" aria-label="직군" className="flex rounded-md border border-line bg-panel p-0.5">
              {(
                [
                  ['ALL', '전체'],
                  ['dev', '개발'],
                  ['biz', '비개발'],
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
                placeholder="제목, 과제 ID"
                className="h-8 w-56 rounded-md border border-line-strong bg-panel pr-3 pl-9 text-[14px] outline-none focus:border-brand"
              />
            </label>
          </div>
        </div>

        {error && list == null ? (
          <ErrorState message={error} onRetry={() => void loadTasks()} />
        ) : list == null ? (
          <p className="flex items-center justify-center gap-2 py-20 text-[14px] text-text-muted">
            <Loader2 size={18} className="animate-spin text-brand" aria-hidden /> 과제 목록을 불러오는 중
          </p>
        ) : (
          <>
            {error && <ErrorState compact message={error} onRetry={() => void loadTasks()} />}
            {tab === 'draft' && rows.length > 0 ? (
              <ReviewQueue tasks={rows} menuFor={menuFor} />
            ) : (
              <Reveal className="overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
                {rows.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-20 text-center">
                    <FileStack size={28} strokeWidth={1.75} className="text-text-faint" aria-hidden />
                    <p className="text-[15px] text-text-muted">
                      {all.length === 0 ? '아직 등록된 과제가 없습니다.' : tab === 'draft' ? '검수할 과제가 없습니다.' : '조건에 맞는 과제가 없습니다.'}
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-[14px]">
                    <thead>
                      <tr className="h-10 border-b border-line text-left">
                        {['과제', '직군', '시간', '공개 시각', '수정 시각', ''].map((h, i) => (
                          <th key={i} className={cx('px-4 text-[13px] font-semibold text-text-muted', i === 2 && 'text-right')}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="fx-rows">
                      {rows.map((t) => (
                        <tr
                          key={t.id}
                          onClick={() => nav(`/console/tasks/${t.id}`)}
                          className="h-16 cursor-pointer border-b border-line last:border-0 hover:bg-panel-raised"
                        >
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-3">
                              <KindTile kind={t.type} vivid={t.status === 'OPEN'} />
                              <div className="min-w-0">
                                <span className="block text-[15px] font-semibold text-text">{t.title}</span>
                                <span className="font-mono text-[12px] text-text-muted">
                                  {t.id} · {t.usage === 'LIVE' ? '기업 실전' : '자가진단'}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 text-text-muted">{trackName(t.type)}</td>
                          <td className="tnum px-4 text-right font-mono text-text-muted">{t.minutes}분</td>
                          <td className="tnum px-4 font-mono text-[13px] text-text-muted">{t.publishedAt ? fmtTime(t.publishedAt) : '-'}</td>
                          <td className="tnum px-4 font-mono text-[13px] text-text-muted">{t.updatedAt ? fmtTime(t.updatedAt) : '-'}</td>
                          <td className="w-20 px-2">
                            <div className="flex items-center justify-end gap-1">
                              <RowMenu label={`${t.title} 메뉴`} items={menuFor(t)} />
                              <ChevronRight size={16} className="text-text-faint" aria-hidden />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Reveal>
            )}
          </>
        )}
      </div>

      {closing && (
        <ConfirmModal
          title="공개를 취소할까요?"
          danger
          confirm="공개 취소"
          disabled={busy}
          onClose={() => setClosing(null)}
          onConfirm={() => {
            const t = closing
            setClosing(null)
            void change(t, false)
          }}
          body={<>「{closing.title}」이 검수 대기로 돌아가 자가진단 과제 목록과 회차 만들기에서 사라집니다. 지난 응시 기록은 그대로 남습니다.</>}
        />
      )}
      {toast.node}
    </>
  )
}
