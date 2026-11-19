// DESIGN.md §7-9-1 과제 목록 (ADMIN): 검수 대기(HIDDEN) / 공개(OPEN) / 응시 마감(CLOSED)
// 2026-11-19 개편: 상태 탭을 단계 카드(StatTabs)로. 검수 대기가 있으면 caution 으로 눈에 띄게.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, FileCheck2, FileClock, FileStack, FileX2, Search, Sparkles } from 'lucide-react'
import { cx } from '../../components/cx'
import { PageHeader } from '../../components/SelfShell'
import { ButtonLink } from '../../components/ui'
import { StatTabs } from './StatTabs'
import { Reveal } from '../../components/fx'
import {
  activeSessionCount,
  duplicateTask,
  kindName,
  setTaskStatus,
  tabOf,
  useConsoleTasks,
  type CTask,
  type TaskStatus,
  type TaskTab,
} from '../../data/consoleTasks'
import { CONSOLE_USES_API } from '../../data/consoleApi'
import { ConfirmModal, RowMenu } from './common'
import { fmtTime, useToast } from './format'
import { ReviewQueue } from './ReviewQueue'
import { KindTile, LevelPips } from '../../components/taskKind'

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
  // 상태 바꾸기는 서버 저장이라 실패할 수 있다 (관리자만). 실패하면 이유를 알려 준다
  const change = (t: CTask, status: TaskStatus, done: string) =>
    void setTaskStatus(t.id, status)
      .then(() => toast.show(done))
      .catch((er: Error) => toast.show(`바꾸지 못했습니다: ${er.message}`))
  // api 모드: 과제 내용은 아직 파일이라 복제·응시 마감(CLOSED)이 없고, 공개는 바로 서버에 저장한다
  const menuFor = (t: CTask) =>
    [
      { text: CONSOLE_USES_API ? '응시자로 보기' : '편집', onClick: () => nav(`/console/tasks/${t.id}`) },
      ...(CONSOLE_USES_API
        ? []
        : [
            {
              text: '복제',
              onClick: () => {
                const id = duplicateTask(t.id)
                nav(`/console/tasks/${id}`)
              },
            },
          ]),
      ...(t.status === 'OPEN'
        ? [
            ...(CONSOLE_USES_API ? [] : [{ text: '응시 마감', onClick: () => change(t, 'CLOSED', '응시를 마감했습니다. 목록에는 남고 새 응시만 막힙니다') }]),
            { text: '공개 취소', danger: true, onClick: () => setClosing(t) },
          ]
        : t.status === 'CLOSED'
          ? [
              { text: '다시 공개', onClick: () => change(t, 'OPEN', '다시 공개했습니다') },
              { text: '공개 취소', danger: true, onClick: () => setClosing(t) },
            ]
          : [
              CONSOLE_USES_API
                ? { text: '공개하기', onClick: () => change(t, 'OPEN', '공개했습니다. 이제 회차에 넣을 수 있습니다') }
                : { text: '공개하기', onClick: () => nav(`/console/tasks/${t.id}?publish=1`) },
            ]),
    ]
  const visibleQuestions = (t: CTask) => t.questions.filter((x) => x.stage === 'TASK').length

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
            { value: 'draft', label: '검수 대기', hint: 'AI가 만든 초안, 사람이 확인 전', icon: FileClock, n: counts.draft, tone: 'caution' },
            { value: 'open', label: '공개', hint: '회차에 쓸 수 있는 과제', icon: FileCheck2, n: counts.open },
            { value: 'closed', label: '응시 마감', hint: '더 이상 새 회차에 못 쓰는 과제', icon: FileX2, n: counts.closed },
          ]}
        />
        <div className="flex flex-wrap items-center gap-4">
          <div className="ml-auto flex items-center gap-2">
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

        {tab === 'draft' && rows.length > 0 ? (
          <ReviewQueue tasks={rows} menuFor={menuFor} />
        ) : (
          <Reveal className="overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
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
              <tbody className="fx-rows">
                {rows.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => nav(`/console/tasks/${t.id}`)}
                    className="h-16 cursor-pointer border-b border-line last:border-0 hover:bg-panel-raised"
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                      <KindTile kind={t.category} vivid={t.status === 'OPEN'} />
                      <div className="min-w-0">
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
                      </div>
                      </div>
                    </td>
                    <td className="px-4 text-text-muted">{t.track === 'DEV' ? '개발' : '비개발'}</td>
                    <td className="px-4 text-text-muted">{kindName(t.category)}</td>
                    <td className="px-4">
                      <LevelPips level={t.difficulty} />
                    </td>
                    <td className="tnum px-4 text-right font-mono text-text-muted">{t.minutes}분</td>
                    <td className="tnum px-4 text-right font-mono text-text-muted">{t.files.length}</td>
                    <td className="tnum px-4 text-right font-mono text-text-muted">{visibleQuestions(t)}</td>
                    <td className="tnum px-4 font-mono text-[13px] text-text-muted">{fmtTime(t.updatedAt)}</td>
                    <td className="w-20 px-2">
                      <div className="flex items-center justify-end gap-1">
                        <RowMenu
                          label={`${t.title} 메뉴`}
                          items={menuFor(t)}
                        />
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
      </div>

      {closing && (
        <ConfirmModal
          title="공개를 취소할까요?"
          danger
          confirm="공개 취소"
          disabled={activeSessionCount(closing.id) > 0}
          onClose={() => setClosing(null)}
          onConfirm={() => {
            change(closing, 'HIDDEN', '공개를 취소했습니다. 검수 대기로 옮겼습니다')
            setClosing(null)
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
