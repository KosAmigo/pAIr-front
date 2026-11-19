// DESIGN.md §7-9-3 과제 검수 (ADMIN): 백엔드 과제 정의(/api/console/tasks/{id})를 읽기 전용으로 보여 주고 공개·공개 취소만 한다.
// 과제 내용(설명·파일·문항) 편집은 백엔드 API 가 아직 없어 준비 중으로 둔다.
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CircleAlert, Eye, FileText, Info, Loader2 } from 'lucide-react'
import type { ConsoleTaskDetail } from '../../consoleApi'
import { ErrorState } from '../../components/ErrorState'
import { useConsoleCrumbs } from '../../components/consoleCrumbs'
import { Button } from '../../components/ui'
import { ConsoleHero, HeroSep } from './ConsoleHero'
import { setPublished, trackName, useTaskDetail } from '../../data/consoleTasks'
import { ConfirmModal, TaskStatusBadge } from './common'
import { fmtTime, useToast } from './format'

export default function ConsoleTaskEdit() {
  const { taskId } = useParams()
  const { detail, error, reload, setSummary } = useTaskDetail(taskId)
  const toast = useToast()
  const [closing, setClosing] = useState(false)
  const [busy, setBusy] = useState(false)
  useConsoleCrumbs(detail ? [detail.summary.title] : [])

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 px-8 py-24">
        <ErrorState message={error} onRetry={reload} />
        <Link to="/console/tasks" className="text-[14px] font-semibold text-brand hover:underline">
          과제 목록으로
        </Link>
      </div>
    )
  }
  if (!detail) {
    return (
      <p className="flex items-center justify-center gap-2 py-32 text-[14px] text-text-muted">
        <Loader2 size={18} className="animate-spin text-brand" aria-hidden /> 과제를 불러오는 중
      </p>
    )
  }

  const { summary: s, definition: d } = detail
  const change = async (open: boolean) => {
    setBusy(true)
    try {
      setSummary(await setPublished(s.id, open))
      toast.show(open ? '공개했습니다. 자가진단과 회차 만들기에 나옵니다' : '공개를 취소했습니다. 검수 대기로 옮겼습니다')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '바꾸지 못했습니다')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-5 px-8 pt-6 pb-10">
        <ConsoleHero
          label="과제 요약"
          badge={<TaskStatusBadge status={s.status} stage />}
          title={s.title}
          meta={
            <>
              <span>{s.id}</span>
              <HeroSep />
              <span>{trackName(s.type)}</span>
              {s.publishedAt && (
                <>
                  <HeroSep />
                  <span>공개 {fmtTime(s.publishedAt)}</span>
                </>
              )}
              {s.updatedAt && (
                <>
                  <HeroSep />
                  <span>수정 {fmtTime(s.updatedAt)}</span>
                </>
              )}
            </>
          }
          stats={[
            { label: 'MINUTES', value: s.minutes, unit: '분' },
            { label: 'REQUIREMENTS', value: d.requirements.length, unit: '개' },
            { label: 'FOLLOW-UPS', value: d.followUps.length, unit: '개' },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <p className="inline-flex items-center gap-2 rounded-md bg-info/8 px-3 py-2 text-[14px] text-text-muted">
            <Info size={16} className="text-info" aria-hidden /> 과제 내용 편집(설명·파일·문항)은 준비 중인 기능입니다. 지금은 보기와 공개 상태만 바꿀 수 있습니다.
          </p>
          <div className="ml-auto flex items-center gap-2">
            <a
              href={`/console/tasks/${s.id}/preview`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-line-strong bg-panel px-3.5 text-[15px] font-semibold text-text hover:border-text-muted hover:bg-panel-raised"
            >
              <Eye size={16} aria-hidden /> 응시자로 보기
            </a>
            {s.status === 'OPEN' ? (
              <Button variant="danger" disabled={busy} onClick={() => setClosing(true)}>
                공개 취소
              </Button>
            ) : (
              <Button variant="primary" disabled={busy} onClick={() => void change(true)}>
                공개하기
              </Button>
            )}
          </div>
        </div>

        <TaskDefinitionView definition={d} />
      </div>

      {closing && (
        <ConfirmModal
          title="공개를 취소할까요?"
          danger
          confirm="공개 취소"
          disabled={busy}
          onClose={() => setClosing(false)}
          onConfirm={() => {
            setClosing(false)
            void change(false)
          }}
          body={<>「{s.title}」이 검수 대기로 돌아가 자가진단 과제 목록과 회차 만들기에서 사라집니다. 지난 응시 기록은 그대로 남습니다.</>}
        />
      )}
      {toast.node}
    </>
  )
}

type Definition = ConsoleTaskDetail['definition']

/** 과제 정의 읽기 전용 보기. 응시자로 보기(TaskPreview)도 같이 쓴다 */
export function TaskDefinitionView({ definition: d, grading = true }: { definition: Definition; grading?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-5">
        <Section title="과제 설명">
          {d.description.length === 0 ? (
            <Empty />
          ) : (
            d.description.map((p, i) => (
              <p key={i} className="text-[15px] leading-7 break-keep text-text">
                {p}
              </p>
            ))
          )}
        </Section>
        <Section title="요구사항">
          <List items={d.requirements} ordered />
        </Section>
        <Section title="참고 사항">
          <List items={d.notes} />
        </Section>
        <Section title="후속 질문">
          <List items={d.followUps} ordered />
        </Section>
      </div>
      <div className="flex flex-col gap-5">
        <Section title="작업 파일">
          <ul className="flex flex-col gap-2 text-[14px]">
            <FileRow label="처음 여는 파일" path={d.openFile} />
            <FileRow label="고칠 수 있는 파일" path={d.editableFile} />
          </ul>
        </Section>
        {grading && (
          <Section title="채점 설정">
            <dl className="flex flex-col gap-3 text-[14px]">
              <div>
                <dt className="font-semibold text-text-muted">시간 기준 (분)</dt>
                <dd className="mt-1 font-mono text-text">{d.d4Minutes?.length ? d.d4Minutes.join(' / ') : '-'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-text-muted">꼭 있어야 할 제목</dt>
                <dd className="mt-1 text-text">{d.requiredHeadings?.length ? d.requiredHeadings.join(', ') : '-'}</dd>
              </div>
            </dl>
          </Section>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-6 shadow-sm">
      <h2 className="mb-3 text-[17px] font-bold text-text">{title}</h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  )
}

function List({ items, ordered }: { items: string[]; ordered?: boolean }) {
  if (items.length === 0) return <Empty />
  const Tag = ordered ? 'ol' : 'ul'
  return (
    <Tag className={ordered ? 'flex list-decimal flex-col gap-1.5 pl-5' : 'flex list-disc flex-col gap-1.5 pl-5'}>
      {items.map((t, i) => (
        <li key={i} className="text-[15px] leading-6 break-keep text-text">
          {t}
        </li>
      ))}
    </Tag>
  )
}

function FileRow({ label, path }: { label: string; path: string | null }) {
  return (
    <li className="flex flex-col gap-0.5">
      <span className="font-semibold text-text-muted">{label}</span>
      {path ? (
        <span className="inline-flex items-center gap-1.5 font-mono text-[13px] text-text">
          <FileText size={14} className="text-text-faint" aria-hidden /> {path}
        </span>
      ) : (
        <span className="text-text-faint">없음</span>
      )}
    </li>
  )
}

function Empty() {
  return (
    <p className="inline-flex items-center gap-1.5 text-[14px] text-text-faint">
      <CircleAlert size={14} aria-hidden /> 아직 데이터가 없습니다.
    </p>
  )
}
