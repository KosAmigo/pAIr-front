// DESIGN.md §7-9-4 회차 만들기: 공개 과제 고르기 → 이름 → 일시 → 감독 (입장은 대상자별 링크로만)
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, Camera, Check, CircleAlert, Download, FileSpreadsheet, Search, Upload, Users, X } from 'lucide-react'
import { StageSection } from '../../components/fx'
import { cx } from '../../components/cx'
import { useConsoleCrumbs } from '../../components/consoleCrumbs'
import { PageHeader } from '../../components/SelfShell'
import { Button } from '../../components/ui'
import { useAuth } from '../../auth/auth'
import { CSV_TEMPLATE, createSession, parseParticipantsCsv, uploadParticipantsCsv, useCompanies, type CsvRow } from '../../data/consoleSessions'
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
  // 회차 과제는 여러 개 (기획_결정사항 §1). 고른 순서 = 응시 화면 순서(sort_order)
  const [taskIds, setTaskIds] = useState<string[]>([])
  const chosen = taskIds.map((id) => open.find((t) => t.id === id)!).filter(Boolean)
  const totalMin = chosen.reduce((n, t) => n + t.minutes, 0)
  const toggleTask = (id: string) => {
    setTaskIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
    setEnd(null)
  }
  // 대상자 CSV (기획_결정사항 §1): 양식(이름,이메일)에 맞춘 파일, 올리기 전에 오류를 미리 보여 준다
  // 미리 보기는 브라우저에서 바로 하고, 저장할 때는 원본 파일을 서버에 그대로 올린다 (서버가 원본을 보관하고 다시 검사)
  const [csv, setCsv] = useState<{ name: string; file: File; rows: CsvRow[] } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const csvBad = csv ? csv.rows.filter((r) => r.error).length : 0
  const csvOk = csv ? csv.rows.length - csvBad : 0
  const readCsv = (f: File | undefined) => {
    if (!f) return
    f.text().then((text) => setCsv({ name: f.name, file: f, rows: parseParticipantsCsv(text) }))
  }
  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent('\uFEFF' + CSV_TEMPLATE)}`
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
  // 시간은 과제별이 아니라 회차 전체 (기획_결정사항 §1). 기본 종료 = 시작 + 과제 시간 합
  const autoEnd = chosen.length ? toTime(new Date(startAt.getTime() + totalMin * 60_000)) : '15:00'
  const endStr = end ?? autoEnd
  const endAt = new Date(`${date}T${endStr}`)
  const spanMin = Math.round((endAt.getTime() - startAt.getTime()) / 60_000)
  const errors = {
    task: !chosen.length ? '과제를 하나 이상 고르세요' : null,
    csv: csvBad ? `CSV에 오류가 있는 행이 ${csvBad}개 있습니다. 고친 파일을 다시 올리세요` : null,
    title: !title.trim() ? '회차 이름을 입력하세요' : null,
    time: isNaN(startAt.getTime()) ? '시작 일시를 입력하세요' : startAt.getTime() < openedAt ? '시작 시각이 지났습니다' : spanMin <= 0 ? '종료가 시작보다 늦어야 합니다' : null,
  }
  const short = chosen.length > 0 && spanMin > 0 && spanMin < totalMin
  const list = open.filter((t) => !q.trim() || t.title.includes(q.trim()))

  return (
    <>
      <PageHeader label="NEW SESSION" title="회차 만들기" />
      {/* 2026-11-19 개편: 왼쪽 유리 폼, 오른쪽 다크 무대에 만들어질 회차 요약(고른 값이 바로 반영) */}
      <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-6 p-8">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            setTried(true)
            if (Object.values(errors).some(Boolean) || !chosen.length) return
            setSaving(true)
            setSaveError(null)
            void (async () => {
              try {
                const s = await createSession({
                  companyId: company,
                  tasks: chosen.map((t) => ({ id: t.id, title: t.title, minutes: t.minutes })),
                  title: title.trim(),
                  startsAt: startAt.toISOString(),
                  endsAt: endAt.toISOString(),
                  proctoring,
                })
                // CSV 로 올린 대상자를 바로 초대한다 (등록 즉시 입장 링크 메일 1번)
                if (csv && csvOk) await uploadParticipantsCsv(s.id, csv.file)
                nav(`/console/sessions/${s.id}?tab=participants`)
              } catch (er) {
                setSaveError(er instanceof Error ? er.message : String(er))
                setSaving(false)
              }
            })()
          }}
          className="glass flex flex-col gap-8 rounded-2xl bg-white/90! p-8 shadow-md!"
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
            <p className="-mt-1 text-[13px] text-text-muted">공개된 기업용 과제만 고를 수 있습니다. 여러 개를 고르면 응시자가 회차 시간 안에서 자유롭게 오가며 풀고, 과제마다 따로 제출합니다. 고른 순서가 응시 화면 순서입니다.</p>
            <label className="relative">
              <span className="sr-only">과제 검색</span>
              <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-faint" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="과제 제목" className={cx(input, 'w-full pl-9')} />
            </label>
            <ul aria-label="과제" className="flex max-h-[260px] flex-col gap-2 overflow-auto">
              {list.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={taskIds.includes(t.id)}
                    onClick={() => toggleTask(t.id)}
                    className={cx(
                      'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors',
                      taskIds.includes(t.id) ? 'border-brand bg-brand-dim' : 'border-line hover:border-line-strong',
                    )}
                  >
                    {taskIds.includes(t.id) ? (
                      <span className="bg-brand-gradient tnum flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-semibold text-on-accent">{taskIds.indexOf(t.id) + 1}</span>
                    ) : (
                      <span className="size-6 shrink-0 rounded-full border-2 border-line-strong" aria-hidden />
                    )}
                    <span className="flex-1">
                      <span className="block text-[15px] font-semibold text-text">{t.title}</span>
                      <span className="text-[13px] text-text-muted">
                        {t.track === 'DEV' ? '개발' : '비개발'} │ {kindName(t.category)} │ {t.difficulty}
                      </span>
                    </span>
                    <span className="tnum font-mono text-[13px] text-text-muted">{t.minutes}분</span>
                    {taskIds.includes(t.id) && <Check size={18} className="text-brand" aria-hidden />}
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
            <p className="text-[13px] text-text-muted">시간은 과제별이 아니라 회차 전체입니다. 응시자는 모두 같은 시각에 시작하고, 종료 시각에 남은 과제가 자동으로 제출됩니다. 종료 시각은 고른 과제 시간의 합만큼 자동으로 채워집니다.</p>
            {short && (
              <p className="flex items-center gap-1.5 text-[13px] text-caution">
                <CircleAlert size={14} aria-hidden /> 고른 과제 시간의 합({totalMin}분)보다 짧습니다.
              </p>
            )}
          </Section>

          <Section n={4} title="대상자 CSV" error={tried ? errors.csv : null}>
            <p className="-mt-1 text-[13px] leading-5 text-text-muted">사이트 양식(이름,이메일)에 맞춘 CSV를 올리면 사람마다 다른 입장 링크가 메일로 나갑니다. 지금 올리지 않으면 회차를 만든 뒤 대상자 탭에서 등록할 수 있습니다.</p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-brand/50 bg-brand-dim px-4 text-[14px] font-semibold text-brand hover:border-brand">
                <Upload size={16} aria-hidden /> CSV 올리기
                <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => readCsv(e.target.files?.[0])} />
              </label>
              <a href={templateHref} download="대상자_양식.csv" className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-[14px] font-medium text-text-muted hover:bg-panel-raised hover:text-text">
                <Download size={16} aria-hidden /> 양식 내려받기
              </a>
            </div>
            {csv && (
              <div className="overflow-hidden rounded-xl border border-line">
                <div className="flex items-center gap-2 border-b border-line bg-panel-raised px-4 py-2.5 text-[14px]">
                  <FileSpreadsheet size={16} className="text-brand" aria-hidden />
                  <span className="truncate font-mono text-[13px] text-text">{csv.name}</span>
                  <span className="tnum ml-auto font-mono text-[13px] text-signal">정상 {csvOk}</span>
                  <span className={cx('tnum font-mono text-[13px]', csvBad ? 'text-alert' : 'text-text-muted')}>오류 {csvBad}</span>
                  <button type="button" aria-label="CSV 빼기" title="빼기" onClick={() => setCsv(null)} className="inline-flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-panel hover:text-text">
                    <X size={14} aria-hidden />
                  </button>
                </div>
                <ul className="max-h-[200px] divide-y divide-line overflow-auto">
                  {csv.rows.map((r) => (
                    <li key={r.line} className={cx('grid grid-cols-[48px_120px_minmax(0,1fr)] items-center gap-3 px-4 py-2 text-[14px]', r.error && 'bg-alert/5')}>
                      <span className="tnum font-mono text-[12px] text-text-muted">{r.line}행</span>
                      <span className="truncate text-text">{r.name || '—'}</span>
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-mono text-[13px] text-text-muted">{r.email || '—'}</span>
                        {r.error && (
                          <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-alert">
                            <CircleAlert size={12} aria-hidden /> {r.error}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                  {csv.rows.length === 0 && <li className="px-4 py-6 text-center text-[14px] text-text-muted">대상자 행이 없습니다.</li>}
                </ul>
              </div>
            )}
          </Section>

          <Section n={5} title="감독">
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
            실전 시험은 메일로 받은 입장 링크로만 입장할 수 있습니다. 시작 전까지는 시간, 과제, 대상자를 고치거나 회차를 취소할 수 있습니다.
          </p>

          {saveError && (
            <p role="alert" className="flex items-center gap-2 rounded-md bg-alert/8 px-3 py-2 text-[14px] text-alert">
              <CircleAlert size={16} aria-hidden /> {saveError}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-line pt-6">
            <Button variant="ghost" onClick={() => nav('/console/sessions')}>
              취소
            </Button>
            <Button type="submit" variant="primary" size="lg" disabled={saving}>
              {saving ? '만드는 중…' : '회차 만들기'}
            </Button>
          </div>
        </form>
        <StageSection className="sticky top-6" aria-label="회차 요약">
          <div className="flex flex-col gap-5 px-6 py-6">
            <p className="flex items-center gap-2 font-mono text-[12px] font-semibold tracking-[0.12em] text-stage-brand">
              <CalendarClock size={14} aria-hidden /> SESSION PREVIEW
            </p>
            <div>
              <p className="text-[13px] text-stage-muted">{companies.find((c) => c.id === company)?.name ?? '회사'}</p>
              <p className={cx('text-[22px] leading-8 font-bold', title.trim() ? 'text-stage-text' : 'text-stage-faint')}>{title.trim() || '회차 이름'}</p>
            </div>
            <div className="glass-stage rounded-xl px-4 py-3">
              <p className="label text-stage-muted">TASKS {chosen.length > 0 && `│ ${chosen.length}`}</p>
              {chosen.length === 0 ? (
                <p className="mt-0.5 text-[15px] font-semibold text-stage-faint">과제를 고르세요</p>
              ) : (
                <ol className="mt-1 flex flex-col gap-1">
                  {chosen.map((t, i) => (
                    <li key={t.id} className="flex items-center gap-2 text-[14px] font-semibold text-stage-text">
                      <span className="tnum font-mono text-[12px] text-stage-brand">{i + 1}</span>
                      <span className="truncate">{t.title}</span>
                      <span className="tnum ml-auto font-mono text-[12px] font-normal text-stage-muted">{t.minutes}분</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="glass-stage flex items-center gap-3 rounded-xl px-4 py-3">
              <Users size={18} className="text-stage-brand" aria-hidden />
              <span className="text-[14px] text-stage-text">대상자</span>
              <span className="tnum ml-auto font-mono text-[20px] font-semibold text-stage-text">{csvOk}</span>
              <span className="text-[13px] text-stage-muted">명</span>
            </div>
            <div>
              <p className="label text-stage-muted">WHEN</p>
              <p className="tnum font-mono text-[30px] leading-9 font-semibold text-stage-text">
                {start} – {endStr}
              </p>
              <p className="tnum font-mono text-[13px] text-stage-muted">
                {date} │ {spanMin > 0 ? `${spanMin}분` : '시간을 확인하세요'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={cx('inline-flex h-8 items-center gap-2 rounded-full px-3 text-[13px] font-semibold', proctoring ? 'bg-stage-signal/15 text-stage-signal' : 'bg-stage-raised text-stage-muted')}>
                <Camera size={14} aria-hidden /> 감독 {proctoring ? '사용' : '안 함'}
              </span>
            </div>
            <p className="flex items-start gap-2 border-t border-stage-line pt-4 text-[13px] leading-5 text-stage-muted">
              <CalendarClock size={16} className="mt-0.5 shrink-0" aria-hidden /> 시작 24시간 전에 대상자에게 알림 메일이 한 번 더 나갑니다.
            </p>
          </div>
        </StageSection>
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
