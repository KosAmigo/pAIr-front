// DESIGN.md §7-9-4 회차 만들기: 공개 과제 고르기 → 이름 → 일시 → 감독 (입장은 대상자별 링크로만)
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Check, CircleAlert, Search } from 'lucide-react'
import { cx } from '../../components/cx'
import { useConsoleCrumbs } from '../../components/consoleCrumbs'
import { PageHeader } from '../../components/SelfShell'
import { Button } from '../../components/ui'
import { useAuth } from '../../auth/auth'
import { createSession, useCompanies } from '../../data/consoleSessions'
import { kindName, useConsoleTasks } from '../../data/consoleTasks'
import { useMyCompanyId } from './format'

const input = 'h-10 rounded-sm border border-line-strong bg-panel px-3 text-[15px] text-text outline-none focus:border-brand focus:shadow-[0_0_0_3px_rgb(108_71_255/0.15)]'
const p2 = (n: number) => String(n).padStart(2, '0')
const toDate = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
const toTime = (d: Date) => `${p2(d.getHours())}:${p2(d.getMinutes())}`

export default function ConsoleSessionNew() {
  useConsoleCrumbs(['회차 만들기'])
  const nav = useNavigate()
  const { user } = useAuth()
  const mine = useMyCompanyId()
  const open = useConsoleTasks().filter((t) => t.status === 'OPEN')
  const [q, setQ] = useState('')
  const [taskId, setTaskId] = useState<string | null>(null)
  const task = open.find((t) => t.id === taskId)
  const companies = useCompanies()
  const [company, setCompany] = useState<number>(mine ?? companies[0]?.id ?? 0)
  const [title, setTitle] = useState('')
  // 화면을 연 시각 기준: 기본 날짜는 내일 14:00
  const [openedAt] = useState(() => Date.now())
  const [date, setDate] = useState(() => toDate(new Date(openedAt + 24 * 3600_000)))
  const [start, setStart] = useState('14:00')
  const [end, setEnd] = useState<string | null>(null)
  const [proctoring, setProctoring] = useState(true)
  const [tried, setTried] = useState(false)

  const startAt = new Date(`${date}T${start}`)
  const autoEnd = task ? toTime(new Date(startAt.getTime() + task.minutes * 60_000)) : '15:00'
  const endStr = end ?? autoEnd
  const endAt = new Date(`${date}T${endStr}`)
  const spanMin = Math.round((endAt.getTime() - startAt.getTime()) / 60_000)
  const errors = {
    task: !task ? '과제를 고르세요' : null,
    title: !title.trim() ? '회차 이름을 입력하세요' : null,
    time: isNaN(startAt.getTime()) ? '시작 일시를 입력하세요' : startAt.getTime() < openedAt ? '시작 시각이 지났습니다' : spanMin <= 0 ? '종료가 시작보다 늦어야 합니다' : null,
  }
  const short = task && spanMin > 0 && spanMin < task.minutes
  const list = open.filter((t) => !q.trim() || t.title.includes(q.trim()))

  return (
    <>
      <PageHeader label="NEW SESSION" title="회차 만들기" />
      <div className="p-8">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            setTried(true)
            if (Object.values(errors).some(Boolean) || !task) return
            const s = createSession({
              companyId: company,
              taskId: task.id,
              taskTitle: task.title,
              taskMinutes: task.minutes,
              title: title.trim(),
              startsAt: startAt.toISOString(),
              endsAt: endAt.toISOString(),
              proctoring,
            })
            nav(`/console/sessions/${s.id}?tab=participants`)
          }}
          className="mx-auto flex max-w-[720px] flex-col gap-8 rounded-md border border-line bg-panel p-8 shadow-sm"
        >
          {user?.role === 'ADMIN' && (
            <Section n={0} title="회사">
              <select value={company} onChange={(e) => setCompany(Number(e.target.value))} className={cx(input, 'w-60')}>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Section>
          )}

          <Section n={1} title="과제" error={tried ? errors.task : null}>
            <p className="-mt-1 text-[13px] text-text-muted">공개된 과제만 고를 수 있습니다.</p>
            <label className="relative">
              <span className="sr-only">과제 검색</span>
              <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-faint" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="과제 제목" className={cx(input, 'w-full pl-9')} />
            </label>
            <ul role="radiogroup" aria-label="과제" className="flex max-h-[260px] flex-col gap-2 overflow-auto">
              {list.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={taskId === t.id}
                    onClick={() => {
                      setTaskId(t.id)
                      setEnd(null)
                    }}
                    className={cx(
                      'flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors',
                      taskId === t.id ? 'border-brand bg-brand-dim' : 'border-line hover:border-line-strong',
                    )}
                  >
                    <span className="flex-1">
                      <span className="block text-[15px] font-semibold text-text">{t.title}</span>
                      <span className="text-[13px] text-text-muted">
                        {t.track === 'DEV' ? '개발' : '비개발'} │ {kindName(t.category)} │ {t.difficulty}
                      </span>
                    </span>
                    <span className="tnum font-mono text-[13px] text-text-muted">{t.minutes}분</span>
                    {taskId === t.id && <Check size={18} className="text-brand" aria-hidden />}
                  </button>
                </li>
              ))}
              {list.length === 0 && <li className="py-6 text-center text-[14px] text-text-muted">공개된 과제가 없습니다.</li>}
            </ul>
          </Section>

          <Section n={2} title="회차 이름" error={tried ? errors.title : null}>
            <input aria-label="회차 이름" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="예: 2026 하반기 백엔드 신입 실전" className={cx(input, 'w-full')} />
          </Section>

          <Section n={3} title="일시" error={tried ? errors.time : null}>
            <div className="flex flex-wrap items-center gap-2">
              <input aria-label="날짜" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cx(input, 'tnum font-mono')} />
              <input aria-label="시작 시각" type="time" value={start} onChange={(e) => setStart(e.target.value)} className={cx(input, 'tnum font-mono')} />
              <span className="text-text-muted">–</span>
              <input aria-label="종료 시각" type="time" value={endStr} onChange={(e) => setEnd(e.target.value)} className={cx(input, 'tnum font-mono')} />
              {spanMin > 0 && <span className="tnum font-mono text-[13px] text-text-muted">{spanMin}분</span>}
            </div>
            <p className="text-[13px] text-text-muted">응시자는 모두 같은 시각에 시작하고, 종료 시각에 자동으로 제출됩니다. 종료 시각은 과제 제한 시간만큼 자동으로 채워집니다.</p>
            {short && (
              <p className="flex items-center gap-1.5 text-[13px] text-caution">
                <CircleAlert size={14} aria-hidden /> 과제 제한 시간({task!.minutes}분)보다 짧습니다.
              </p>
            )}
          </Section>

          <Section n={4} title="감독">
            <label className="flex cursor-pointer items-start gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={proctoring}
                aria-label="감독 사용"
                onClick={() => setProctoring((v) => !v)}
                className={cx('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors', proctoring ? 'bg-brand' : 'bg-line-strong')}
              >
                <span className={cx('absolute top-0.5 size-5 rounded-full bg-panel shadow-sm transition-transform', proctoring ? 'translate-x-[22px]' : 'translate-x-0.5')} />
              </button>
              <span>
                <span className="flex items-center gap-1.5 text-[15px] font-semibold text-text">
                  <Camera size={16} aria-hidden /> 카메라와 브라우저 이탈 감지
                </span>
                <span className="mt-1 block text-[13px] leading-5 text-text-muted">영상은 저장하지 않고, 의심되는 순간의 사진 1장만 남깁니다. 응시자는 시작 전에 동의합니다.</span>
              </span>
            </label>
          </Section>

          <p className="text-[14px] leading-6 text-text-muted">
            회차를 만든 뒤 대상자를 등록하면 사람마다 다른 입장 링크가 메일로 나갑니다. 실전 시험은 이 링크로만 입장할 수 있습니다.
          </p>

          <div className="flex justify-end gap-2 border-t border-line pt-6">
            <Button variant="ghost" onClick={() => nav('/console/sessions')}>
              취소
            </Button>
            <Button type="submit" variant="primary" size="lg">
              회차 만들기
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}

function Section({ n, title, error, children }: { n: number; title: string; error?: string | null; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-[16px] font-semibold text-text">
        {n > 0 && <span className="tnum font-mono text-[13px] text-brand">{p2(n)}</span>}
        {title}
      </h2>
      {children}
      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-[13px] text-alert">
          <CircleAlert size={14} aria-hidden /> {error}
        </p>
      )}
    </section>
  )
}
