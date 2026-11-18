// DESIGN.md §7-9-3 과제 검수·편집 (ADMIN): 기본 정보 / 파일 / 문항 / 후속 질문 탭, 응시자로 보기, 공개 전 점검
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  Check,
  CircleAlert,
  Copy,
  Eye,
  EyeOff,
  FilePlus,
  FileText,
  Folder,
  Lock,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { cx } from '../../components/cx'
import { CodeEditor } from '../../components/CodeEditor'
import { useConsoleCrumbs } from '../../components/consoleCrumbs'
import { Button } from '../../components/ui'
import { ConsoleHero, HeroSep, PillTabs } from './ConsoleHero'
import { KINDS } from '../../data/catalog'
import {
  QTYPE_LABEL,
  activeSessionCount,
  checkPublish,
  newId,
  saveTask,
  setTaskStatus,
  useConsoleTask,
  type CFile,
  type CQuestion,
  type CTask,
  type Difficulty,
  type QType,
} from '../../data/consoleTasks'
import { ConfirmModal, Modal, TaskStatusBadge } from './common'
import { fmtTime, useToast } from './format'

type Tab = 'info' | 'files' | 'questions' | 'followups'
const input =
  'w-full rounded-sm border border-line-strong bg-panel px-3 text-[15px] text-text outline-none placeholder:text-text-faint focus:border-brand focus:shadow-[0_0_0_3px_rgb(108_71_255/0.15)]'

export default function ConsoleTaskEdit() {
  const { taskId } = useParams()
  const stored = useConsoleTask(taskId)
  if (!stored) {
    return (
      <div className="flex flex-col items-center gap-3 py-32 text-center">
        <CircleAlert size={28} className="text-text-faint" aria-hidden />
        <p className="text-[15px] text-text-muted">찾을 수 없는 과제입니다.</p>
        <Link to="/console/tasks" className="text-[14px] font-semibold text-brand hover:underline">
          과제 목록으로
        </Link>
      </div>
    )
  }
  // 과제가 바뀌면 편집 상태를 새로 만든다
  return <Editor key={stored.id} stored={stored} />
}

function Editor({ stored }: { stored: CTask }) {
  useConsoleCrumbs([stored.title])
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'info'
  const setTab = (t: Tab) => setParams((p) => {
    p.set('tab', t)
    p.delete('publish')
    return p
  }, { replace: true })
  const [draft, setDraft] = useState<CTask>(() => structuredClone(stored))
  const dirty = useMemo(() => JSON.stringify({ ...draft, updatedAt: '' }) !== JSON.stringify({ ...stored, updatedAt: '' }), [draft, stored])
  const [problems, setProblems] = useState<ReturnType<typeof checkPublish> | null>(null)
  const [closing, setClosing] = useState(false)
  const toast = useToast()
  const update = (patch: Partial<CTask>) => setDraft((d) => ({ ...d, ...patch }))

  // 저장 안 한 채 창을 닫으려 하면 확인
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const save = () => {
    saveTask(draft)
    toast.show('저장했습니다')
  }
  const publish = () => {
    const list = checkPublish(draft)
    if (list.length) return setProblems(list)
    saveTask(draft)
    setTaskStatus(draft.id, 'OPEN')
    setDraft((d) => ({ ...d, status: 'OPEN' }))
    toast.show('공개했습니다. 자가진단 과제 목록과 회차 만들기에 나타납니다.')
  }

  // 목록의 "공개하기"로 들어오면 바로 점검한다
  const wantPublish = params.get('publish') === '1'
  const [autoChecked, setAutoChecked] = useState(false)
  if (wantPublish && !autoChecked) {
    setAutoChecked(true)
    const list = checkPublish(draft)
    if (list.length) setProblems(list)
  }

  const taskQs = draft.questions.filter((q) => q.stage === 'TASK')
  const followQs = draft.questions.filter((q) => q.stage === 'FOLLOWUP')
  const setStageQs = (stage: CQuestion['stage'], qs: CQuestion[]) =>
    update({ questions: stage === 'TASK' ? [...qs, ...followQs] : [...taskQs, ...qs] })
  const parent = stored.parentId

  return (
    <>
      {/* 2026-11-19 개편: 머리는 다크 무대 카드(ConsoleHero), 탭은 알약 탭 */}
      <div className="flex flex-col gap-5 px-8 pt-6">
        <ConsoleHero
          label="과제 요약"
          badge={
            <>
              <TaskStatusBadge task={{ ...stored, status: draft.status }} stage />
              {dirty && (
                <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-stage-caution/15 px-2.5 text-[13px] font-semibold text-stage-caution">
                  <i className="size-1.5 rounded-full bg-stage-caution" aria-hidden /> 저장 안 됨
                </span>
              )}
            </>
          }
          title={draft.title || '제목 없음'}
          meta={
            <>
              <span>{draft.code}</span>
              <HeroSep />
              <span>수정 {fmtTime(stored.updatedAt)}</span>
              {parent && (
                <>
                  <HeroSep />
                  <Link to={`/console/tasks/${parent}`} className="hover:text-stage-brand hover:underline">
                    복제 원본
                  </Link>
                </>
              )}
            </>
          }
          stats={[
            { label: 'FILES', value: draft.files.length, unit: '개' },
            { label: 'QUESTIONS', value: taskQs.length, unit: '개' },
            { label: 'FOLLOW-UPS', value: followQs.length, unit: '개' },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <PillTabs
            id="task-tab"
            label="과제 편집 화면"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'info', label: '기본 정보' },
              { value: 'files', label: '파일' },
              { value: 'questions', label: '문항' },
              { value: 'followups', label: '후속 질문' },
            ]}
          />
          <div className="ml-auto flex items-center gap-2">
            <a
              href={`/console/tasks/${draft.id}/preview?track=${draft.track === 'BIZ' ? 'biz' : 'dev'}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-line-strong bg-panel px-3.5 text-[15px] font-semibold text-text hover:border-text-muted hover:bg-panel-raised"
            >
              <Eye size={16} aria-hidden /> 응시자로 보기
            </a>
            <Button onClick={save} disabled={!dirty}>
              저장
            </Button>
            {draft.status === 'OPEN' || draft.status === 'CLOSED' ? (
              <>
                <Button
                  onClick={() => {
                    const next = draft.status === 'OPEN' ? 'CLOSED' : 'OPEN'
                    setTaskStatus(draft.id, next)
                    setDraft((d) => ({ ...d, status: next }))
                    toast.show(next === 'CLOSED' ? '응시를 마감했습니다. 목록에는 남고 새 응시만 막힙니다' : '다시 공개했습니다')
                  }}
                >
                  {draft.status === 'OPEN' ? '응시 마감' : '다시 공개'}
                </Button>
                <Button variant="danger" onClick={() => setClosing(true)}>
                  공개 취소
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={publish}>
                공개하기
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="p-8">
        {tab === 'info' && <InfoTab t={draft} update={update} />}
        {tab === 'files' && <FilesTab files={draft.files} onChange={(files) => update({ files })} />}
        {tab === 'questions' && <QuestionsTab stage="TASK" track={draft.track} qs={taskQs} files={draft.files} onChange={(qs) => setStageQs('TASK', qs)} />}
        {tab === 'followups' && <QuestionsTab stage="FOLLOWUP" track={draft.track} qs={followQs} files={draft.files} onChange={(qs) => setStageQs('FOLLOWUP', qs)} />}
      </div>

      {problems && (
        <Modal
          title="공개하기 전에 채울 것이 있습니다"
          onClose={() => setProblems(null)}
          actions={
            <Button variant="primary" onClick={() => setProblems(null)}>
              확인
            </Button>
          }
        >
          <ul className="flex flex-col gap-2">
            {problems.map((p, i) => (
              <li key={i} className="flex items-center gap-2 text-text">
                <CircleAlert size={16} className="shrink-0 text-caution" aria-hidden />
                <span>{p.text}</span>
                <button
                  type="button"
                  onClick={() => {
                    setProblems(null)
                    setTab(p.tab)
                  }}
                  className="ml-auto shrink-0 text-[13px] font-semibold text-brand hover:underline"
                >
                  고치러 가기
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
      {closing && (
        <ConfirmModal
          title="공개를 취소할까요?"
          danger
          confirm="공개 취소"
          disabled={activeSessionCount(draft.id) > 0}
          onClose={() => setClosing(false)}
          onConfirm={() => {
            setTaskStatus(draft.id, 'HIDDEN')
            setDraft((d) => ({ ...d, status: 'HIDDEN' }))
            setClosing(false)
            toast.show('공개를 취소했습니다. 검수 대기로 옮겼습니다')
          }}
          body={
            activeSessionCount(draft.id) > 0 ? (
              <span className="text-alert">진행 중이거나 예정된 회차 {activeSessionCount(draft.id)}개가 이 과제를 씁니다. 회차가 끝난 뒤에 공개를 취소할 수 있습니다.</span>
            ) : (
              '검수 대기로 돌아가 자가진단 과제 목록과 회차 만들기에서 사라집니다. 지난 응시 기록은 그대로 남습니다.'
            )
          }
        />
      )}
      {toast.node}
    </>
  )
}

function Field({ id, label, hint, children }: { id?: string; label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-[14px] font-semibold text-text">
          {label}
        </label>
        {hint && <span className="text-[12px] text-text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

// ── 기본 정보 ──
function InfoTab({ t, update }: { t: CTask; update: (p: Partial<CTask>) => void }) {
  const [preview, setPreview] = useState(false)
  const kinds = KINDS.filter((k) => k.track === (t.track === 'DEV' ? 'dev' : 'biz'))
  const reqs = t.requirements
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
      <div className="flex flex-col gap-6 rounded-xl border border-line bg-panel p-6 shadow-sm">
        <Field id="title" label="제목">
          <input id="title" value={t.title} onChange={(e) => update({ title: e.target.value })} maxLength={200} className={cx(input, 'h-10')} />
        </Field>
        <Field id="summary" label="한 줄 소개" hint={<span className="tnum font-mono">{t.summary.length} / 200</span>}>
          <input id="summary" value={t.summary} onChange={(e) => update({ summary: e.target.value })} maxLength={200} className={cx(input, 'h-10')} />
        </Field>
        <Field
          id="desc"
          label="상세 설명"
          hint={
            <span role="radiogroup" aria-label="상세 설명 보기" className="inline-flex rounded-sm border border-line p-0.5">
              {(['편집', '미리보기'] as const).map((l, i) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={preview === (i === 1)}
                  onClick={() => setPreview(i === 1)}
                  className={cx('rounded-sm px-2 py-0.5 text-[12px] font-medium', preview === (i === 1) ? 'bg-panel-raised text-text' : 'text-text-muted')}
                >
                  {l}
                </button>
              ))}
            </span>
          }
        >
          {preview ? (
            <div className="min-h-[200px] rounded-sm border border-line bg-panel-sunken p-4 text-[15px] leading-7 whitespace-pre-wrap text-text">
              {t.description.split('\n').map((line, i) =>
                line.startsWith('#') ? (
                  <p key={i} className="mt-2 text-[17px] font-bold">
                    {line.replace(/^#+\s*/, '')}
                  </p>
                ) : (
                  <p key={i}>{line || ' '}</p>
                ),
              )}
            </div>
          ) : (
            <textarea
              id="desc"
              rows={9}
              value={t.description}
              onChange={(e) => update({ description: e.target.value })}
              className={cx(input, 'resize-y py-3 leading-7')}
            />
          )}
        </Field>
        <Field label="요구사항" hint="줄마다 하나, 응시 화면에 번호로 보입니다">
          <ol className="flex flex-col gap-2">
            {reqs.map((r, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="tnum w-5 text-right font-mono text-[13px] text-text-muted">{i + 1}</span>
                <input
                  aria-label={`요구사항 ${i + 1}`}
                  value={r}
                  onChange={(e) => update({ requirements: reqs.map((x, j) => (j === i ? e.target.value : x)) })}
                  className={cx(input, 'h-9')}
                />
                <MoveButtons i={i} n={reqs.length} label={`요구사항 ${i + 1}`} onMove={(to) => update({ requirements: move(reqs, i, to) })} />
                <IconBtn label={`요구사항 ${i + 1} 삭제`} onClick={() => update({ requirements: reqs.filter((_, j) => j !== i) })}>
                  <X size={16} aria-hidden />
                </IconBtn>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => update({ requirements: [...reqs, ''] })} className="mt-1 inline-flex items-center gap-1 self-start text-[14px] font-semibold text-brand hover:underline">
            <Plus size={14} aria-hidden /> 요구사항 추가
          </button>
        </Field>
      </div>

      <aside className="flex h-fit flex-col gap-5 rounded-xl border border-line bg-panel p-6 shadow-sm">
        <p className="label">PROPERTIES</p>
        <Field id="code" label="과제 코드">
          <input id="code" value={t.code} onChange={(e) => update({ code: e.target.value.replace(/[^a-z0-9-]/g, '') })} className={cx(input, 'h-9 font-mono text-[14px]')} />
        </Field>
        <Field label="직군">
          <p className="text-[15px] text-text">{t.track === 'DEV' ? '개발' : '비개발'}</p>
          <p className="text-[12px] text-text-muted">직군은 만든 뒤에 바꿀 수 없습니다. 바꾸려면 새로 만드세요.</p>
        </Field>
        <Field id="cat" label="과제 형태">
          <select id="cat" value={t.category} onChange={(e) => update({ category: e.target.value })} className={cx(input, 'h-9')}>
            {kinds.map((k) => (
              <option key={k.key} value={k.key}>
                {k.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="diff" label="난이도">
          <select id="diff" value={t.difficulty} onChange={(e) => update({ difficulty: e.target.value as Difficulty })} className={cx(input, 'h-9')}>
            {['초급', '중급', '고급'].map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </Field>
        <Field id="min" label="제한 시간 (분)">
          <input id="min" type="number" min={10} max={180} value={t.minutes} onChange={(e) => update({ minutes: Number(e.target.value) })} className={cx(input, 'tnum h-9 font-mono')} />
        </Field>
      </aside>
    </div>
  )
}

// ── 파일 ──
function FilesTab({ files, onChange }: { files: CFile[]; onChange: (f: CFile[]) => void }) {
  const [sel, setSel] = useState<string | null>(files[0]?.id ?? null)
  const [adding, setAdding] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [pdfText, setPdfText] = useState(false)
  const cur = files.find((f) => f.id === sel)
  const set = (id: string, patch: Partial<CFile>) => onChange(files.map((f) => (f.id === id ? { ...f, ...patch } : f)))

  // 폴더별로 묶는다 (한 단계)
  const groups = useMemo(() => {
    const m = new Map<string, CFile[]>()
    for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
      const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''
      m.set(dir, [...(m.get(dir) ?? []), f])
    }
    return [...m.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
  }, [files])

  const addFile = (path: string) => {
    const p = path.trim().replace(/^\/+/, '')
    if (!p || files.some((f) => f.path === p)) return
    const f: CFile = { id: newId('f'), path: p, content: '', size: 0, visible: true, readOnly: false }
    onChange([...files, f])
    setSel(f.id)
    setAdding(null)
  }

  return (
    <div className="grid h-[calc(100vh-420px)] min-h-[480px] grid-cols-[280px_minmax(0,1fr)] overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
      <div className="flex min-h-0 flex-col border-r border-line">
        <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-3">
          <span className="label">FILES</span>
          <IconBtn label="새 파일" className="ml-auto" onClick={() => setAdding('')}>
            <FilePlus size={16} aria-hidden />
          </IconBtn>
        </div>
        <ul className="min-h-0 flex-1 overflow-auto py-2 text-[14px]">
          {adding !== null && (
            <li className="px-3 pb-2">
              <input
                autoFocus
                aria-label="새 파일 경로"
                placeholder="경로/파일이름.java"
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addFile(adding)
                  if (e.key === 'Escape') setAdding(null)
                }}
                onBlur={() => (adding.trim() ? addFile(adding) : setAdding(null))}
                className={cx(input, 'h-8 font-mono text-[13px]')}
              />
            </li>
          )}
          {groups.map(([dir, list]) => (
            <li key={dir || '.'}>
              {dir && (
                <p className="flex h-7 items-center gap-1.5 px-3 font-mono text-[13px] text-text-muted">
                  <Folder size={14} aria-hidden /> {dir}
                </p>
              )}
              <ul>
                {list.map((f) => {
                  const name = f.path.slice(f.path.lastIndexOf('/') + 1)
                  return (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => setSel(f.id)}
                        aria-current={sel === f.id}
                        className={cx(
                          'relative flex h-7 w-full items-center gap-1.5 pr-3 text-left font-mono text-[13px]',
                          dir ? 'pl-8' : 'pl-3',
                          sel === f.id ? 'bg-brand-dim text-text' : 'text-text hover:bg-panel-raised',
                          !f.visible && 'text-text-faint',
                        )}
                      >
                        {sel === f.id && <i className="absolute inset-y-0 left-0 w-0.5 bg-brand" aria-hidden />}
                        <FileText size={14} className={f.pages ? 'text-info' : 'text-text-muted'} aria-hidden />
                        <span className="truncate">{name}</span>
                        {!f.visible && <EyeOff size={13} className="ml-auto shrink-0" aria-label="응시자에게 숨김" />}
                        {f.readOnly && <Lock size={12} className={cx('shrink-0 text-text-faint', f.visible && 'ml-auto')} aria-label="읽기 전용" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>

      {cur ? (
        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="flex h-10 shrink-0 items-center gap-3 border-b border-line px-4">
            {renaming === cur.id ? (
              <input
                autoFocus
                aria-label="파일 경로"
                defaultValue={cur.path}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const v = e.currentTarget.value.trim()
                    if (v && !files.some((f) => f.path === v && f.id !== cur.id)) set(cur.id, { path: v })
                    setRenaming(null)
                  }
                  if (e.key === 'Escape') setRenaming(null)
                }}
                onBlur={() => setRenaming(null)}
                className={cx(input, 'h-7 max-w-[420px] font-mono text-[13px]')}
              />
            ) : (
              <button type="button" onClick={() => setRenaming(cur.id)} title="눌러서 이름 바꾸기" className="truncate font-mono text-[13px] text-text hover:text-brand">
                {cur.path}
              </button>
            )}
            <span className="tnum font-mono text-[12px] text-text-faint">{(cur.size / 1024).toFixed(1)} KB</span>
            <div className="ml-auto flex items-center gap-4">
              <Toggle label="응시자에게 보임" checked={cur.visible} onChange={(v) => set(cur.id, { visible: v })} />
              <Toggle label="읽기 전용" checked={cur.readOnly} onChange={(v) => set(cur.id, { readOnly: v })} />
              <IconBtn
                label="파일 삭제"
                onClick={() => {
                  onChange(files.filter((f) => f.id !== cur.id))
                  setSel(files.find((f) => f.id !== cur.id)?.id ?? null)
                }}
              >
                <Trash2 size={16} aria-hidden />
              </IconBtn>
            </div>
          </div>
          {!cur.visible && (
            <p className="flex items-center gap-2 border-b border-line bg-caution/8 px-4 py-1.5 text-[13px] text-caution">
              <EyeOff size={14} aria-hidden /> 응시자에게 보이지 않는 파일입니다. 채점용 숨김 테스트 등에 씁니다.
            </p>
          )}
          {cur.pages ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-4 text-[13px]">
                {(['페이지', '추출한 텍스트'] as const).map((l, i) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setPdfText(i === 1)}
                    className={cx('rounded-sm px-2 py-0.5 font-medium', pdfText === (i === 1) ? 'bg-panel-raised text-text' : 'text-text-muted hover:text-text')}
                  >
                    {l}
                  </button>
                ))}
                <span className="tnum ml-auto font-mono text-text-muted">{cur.pages.length}쪽</span>
              </div>
              <div className="min-h-0 flex-1 overflow-auto bg-panel-sunken p-6">
                {pdfText ? (
                  <pre className="font-mono text-[13px] leading-6 whitespace-pre-wrap text-text">
                    {cur.pages.map((p, i) => `── ${i + 1}쪽 ──\n${p}`).join('\n\n')}
                  </pre>
                ) : (
                  <div className="mx-auto flex max-w-[560px] flex-col gap-4">
                    {cur.pages.map((p, i) => (
                      <figure key={i} className="aspect-[1/1.3] rounded-sm border border-line bg-panel p-8 shadow-sm">
                        <figcaption className="tnum mb-4 font-mono text-[12px] text-text-faint">{i + 1} / {cur.pages!.length}</figcaption>
                        <p className="text-[14px] leading-7 whitespace-pre-wrap text-text">{p}</p>
                      </figure>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 bg-panel-sunken">
              <CodeEditor path={cur.path} value={cur.content ?? ''} onChange={(v) => set(cur.id, { content: v, size: new TextEncoder().encode(v).length })} />
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center text-[14px] text-text-muted">파일을 고르세요</div>
      )}
    </div>
  )
}

// ── 문항 / 후속 질문 ──
function QuestionsTab({
  stage,
  track,
  qs,
  files,
  onChange,
}: {
  stage: CQuestion['stage']
  track: CTask['track']
  qs: CQuestion[]
  files: CFile[]
  onChange: (qs: CQuestion[]) => void
}) {
  const [menu, setMenu] = useState(false)
  const set = (id: string, patch: Partial<CQuestion>) => onChange(qs.map((q) => (q.id === id ? { ...q, ...patch } : q)))
  const add = (type: QType) => {
    const q: CQuestion = {
      id: newId('q'),
      stage,
      type,
      content: '',
      points: stage === 'TASK' ? 5 : undefined,
      active: true,
      sources: [],
      ...(type === 'SINGLE' || type === 'MULTI' ? { choices: [1, 2, 3].map(() => ({ id: newId('c'), content: '', correct: false })) } : {}),
      ...(type === 'SHORT' ? { keys: [] } : {}),
      ...(type === 'ESSAY' && stage === 'TASK' ? { answerGuide: '' } : {}),
    }
    onChange([...qs, q])
    setMenu(false)
  }
  const pdfs = files.filter((f) => f.pages)
  const total = qs.filter((q) => q.active).reduce((n, q) => n + (q.points ?? 0), 0)
  const prefix = stage === 'TASK' ? 'Q' : 'F'

  return (
    <div className="mx-auto flex max-w-[920px] flex-col gap-3">
      {stage === 'TASK' ? (
        <p className="text-[14px] text-text-muted">
          사용 중인 문항 배점 합계 <b className="tnum font-mono text-text">{total}점</b>. 역량 채점(100점)과 따로 집계합니다.
        </p>
      ) : (
        <p className="text-[14px] text-text-muted">제출 뒤에 묻는 질문입니다. 배점은 없고, 답변은 역량 채점의 근거로 씁니다.</p>
      )}
      {qs.map((q, i) => (
        <article key={q.id} className={cx('rounded-xl border border-line bg-panel shadow-sm', !q.active && 'opacity-60')}>
          <header className="flex h-12 items-center gap-3 border-b border-line px-4">
            <span className="tnum font-mono text-[14px] font-semibold text-text">
              {prefix}
              {i + 1}
            </span>
            {stage === 'TASK' ? (
              <span className="rounded-sm bg-panel-raised px-2 py-0.5 text-[12px] font-semibold text-text-muted">{QTYPE_LABEL[q.type]}</span>
            ) : (
              <span className="rounded-sm bg-panel-raised px-2 py-0.5 text-[12px] font-semibold text-text-muted">서술형</span>
            )}
            {q.locked && (
              <span className="inline-flex items-center gap-1 text-[12px] text-text-muted" title="모든 과제에 들어가는 고정 질문이라 지울 수 없습니다">
                <Lock size={12} aria-hidden /> 고정
              </span>
            )}
            {stage === 'TASK' && (
              <label className="ml-2 flex items-center gap-1.5 text-[13px] text-text-muted">
                배점
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={q.points ?? 0}
                  onChange={(e) => set(q.id, { points: Number(e.target.value) })}
                  className="tnum h-7 w-14 rounded-sm border border-line-strong bg-panel px-2 text-right font-mono text-[13px] outline-none focus:border-brand"
                />
                점
              </label>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Toggle label="사용" checked={q.active} onChange={(v) => set(q.id, { active: v })} />
              <MoveButtons i={i} n={qs.length} label={`${prefix}${i + 1}`} onMove={(to) => onChange(move(qs, i, to))} />
              <IconBtn
                label={`${prefix}${i + 1} 복제`}
                onClick={() => {
                  const c = { ...structuredClone(q), id: newId('q'), locked: false }
                  c.choices = c.choices?.map((x) => ({ ...x, id: newId('c') }))
                  onChange([...qs.slice(0, i + 1), c, ...qs.slice(i + 1)])
                }}
              >
                <Copy size={15} aria-hidden />
              </IconBtn>
              <IconBtn label={`${prefix}${i + 1} 삭제`} disabled={q.locked} onClick={() => onChange(qs.filter((x) => x.id !== q.id))}>
                <Trash2 size={15} aria-hidden />
              </IconBtn>
            </div>
          </header>
          <div className="flex flex-col gap-4 p-4">
            <textarea
              aria-label={`${prefix}${i + 1} 문제 내용`}
              rows={2}
              placeholder="문제 내용"
              value={q.content}
              onChange={(e) => set(q.id, { content: e.target.value })}
              className={cx(input, 'resize-y py-2 leading-6')}
            />

            {(q.type === 'SINGLE' || q.type === 'MULTI') && stage === 'TASK' && (
              <div className="flex flex-col gap-2">
                <p className="text-[13px] font-semibold text-text-muted">보기 ({q.type === 'SINGLE' ? '정답 1개' : '정답 여러 개'})</p>
                {q.choices!.map((c, ci) => (
                  <div key={c.id} className={cx('flex items-center gap-2 rounded-sm border px-2 py-1', c.correct ? 'border-signal bg-signal/6' : 'border-line')}>
                    <button
                      type="button"
                      role={q.type === 'SINGLE' ? 'radio' : 'checkbox'}
                      aria-checked={c.correct}
                      aria-label={`보기 ${ci + 1} 정답`}
                      onClick={() =>
                        set(q.id, {
                          choices: q.choices!.map((x) =>
                            q.type === 'SINGLE' ? { ...x, correct: x.id === c.id } : x.id === c.id ? { ...x, correct: !x.correct } : x,
                          ),
                        })
                      }
                      className={cx(
                        'flex size-5 shrink-0 items-center justify-center border-2',
                        q.type === 'SINGLE' ? 'rounded-full' : 'rounded-sm',
                        c.correct ? 'border-signal bg-signal text-on-accent' : 'border-line-strong',
                      )}
                    >
                      {c.correct && <Check size={12} strokeWidth={3} aria-hidden />}
                    </button>
                    <span className="tnum w-5 font-mono text-[13px] text-text-muted">{'①②③④⑤⑥⑦⑧'[ci] ?? ci + 1}</span>
                    <input
                      aria-label={`보기 ${ci + 1} 내용`}
                      value={c.content}
                      onChange={(e) => set(q.id, { choices: q.choices!.map((x) => (x.id === c.id ? { ...x, content: e.target.value } : x)) })}
                      className="h-8 flex-1 bg-transparent text-[15px] outline-none"
                      placeholder="보기 내용"
                    />
                    <IconBtn label={`보기 ${ci + 1} 삭제`} onClick={() => set(q.id, { choices: q.choices!.filter((x) => x.id !== c.id) })}>
                      <X size={14} aria-hidden />
                    </IconBtn>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => set(q.id, { choices: [...q.choices!, { id: newId('c'), content: '', correct: false }] })}
                  className="inline-flex items-center gap-1 self-start text-[14px] font-semibold text-brand hover:underline"
                >
                  <Plus size={14} aria-hidden /> 보기 추가
                </button>
              </div>
            )}

            {q.type === 'SHORT' && <KeysEditor keys={q.keys ?? []} onChange={(keys) => set(q.id, { keys })} />}

            {q.type === 'ESSAY' && stage === 'TASK' && (
              <Field id={`guide-${q.id}`} label="채점 기준">
                <textarea
                  id={`guide-${q.id}`}
                  rows={2}
                  value={q.answerGuide ?? ''}
                  onChange={(e) => set(q.id, { answerGuide: e.target.value })}
                  placeholder="만점 답이 꼭 짚어야 할 것"
                  className={cx(input, 'resize-y py-2 leading-6')}
                />
              </Field>
            )}

            {stage === 'TASK' && (
              <SourcesEditor
                sources={q.sources}
                pdfs={pdfs}
                warn={track === 'BIZ' && q.sources.length < 2}
                onChange={(sources) => set(q.id, { sources })}
              />
            )}
          </div>
        </article>
      ))}

      <div className="relative">
        <button
          type="button"
          onClick={() => (stage === 'TASK' ? setMenu((v) => !v) : add('ESSAY'))}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-md border border-dashed border-line-strong text-[15px] font-semibold text-text-muted hover:border-brand hover:text-brand"
        >
          <Plus size={16} aria-hidden /> {stage === 'TASK' ? '문항 추가' : '후속 질문 추가'}
        </button>
        {menu && (
          <div role="menu" className="fade-in absolute top-16 left-1/2 z-20 w-48 -translate-x-1/2 rounded-xl border border-line bg-panel p-1 shadow-modal">
            {(Object.keys(QTYPE_LABEL) as QType[]).map((t) => (
              <button key={t} type="button" role="menuitem" onClick={() => add(t)} className="flex w-full rounded-sm px-3 py-2 text-left text-[14px] text-text hover:bg-panel-raised">
                {QTYPE_LABEL[t]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function KeysEditor({ keys, onChange }: { keys: string[]; onChange: (k: string[]) => void }) {
  const [v, setV] = useState('')
  const add = () => {
    const x = v.trim()
    if (x && !keys.includes(x)) onChange([...keys, x])
    setV('')
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] font-semibold text-text-muted">인정 답안</p>
      <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-sm border border-line-strong px-2 py-1.5 focus-within:border-brand">
        {keys.map((k) => (
          <span key={k} className="inline-flex items-center gap-1 rounded-sm bg-signal/10 py-0.5 pr-1 pl-2 font-mono text-[13px] text-signal">
            {k}
            <button type="button" aria-label={`${k} 빼기`} onClick={() => onChange(keys.filter((x) => x !== k))} className="rounded-sm p-0.5 hover:bg-signal/15">
              <X size={12} aria-hidden />
            </button>
          </span>
        ))}
        <input
          aria-label="인정 답안 추가"
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          onBlur={add}
          placeholder={keys.length ? '' : '답안 입력 후 Enter'}
          className="h-7 min-w-32 flex-1 bg-transparent font-mono text-[14px] outline-none"
        />
      </div>
      <p className="text-[12px] text-text-muted">띄어쓰기와 대소문자는 무시하고 비교합니다.</p>
    </div>
  )
}

function SourcesEditor({ sources, pdfs, warn, onChange }: { sources: CQuestion['sources']; pdfs: CFile[]; warn: boolean; onChange: (s: CQuestion['sources']) => void }) {
  const unused = pdfs.filter((p) => !sources.some((s) => s.fileId === p.id))
  return (
    <div className="flex flex-col gap-2 rounded-sm bg-panel-raised/60 p-3">
      <div className="flex items-center gap-2">
        <p className="text-[13px] font-semibold text-text-muted">근거 문서</p>
        {warn && (
          <span className="inline-flex items-center gap-1 text-[12px] text-caution">
            <CircleAlert size={13} aria-hidden /> 비개발 문항은 2개 이상 필요
          </span>
        )}
      </div>
      {sources.map((s, i) => {
        const f = pdfs.find((p) => p.id === s.fileId)
        return (
          <div key={s.fileId} className="flex items-center gap-2">
            <span className="inline-flex min-w-0 items-center gap-1.5 rounded-sm bg-info/10 px-2 py-1 font-mono text-[12px] text-info">
              <FileText size={13} aria-hidden />
              <span className="truncate">{f?.path.split('/').pop() ?? '지워진 파일'}</span>
            </span>
            <input
              aria-label="근거 페이지"
              value={s.pages}
              onChange={(e) => onChange(sources.map((x, j) => (j === i ? { ...x, pages: e.target.value } : x)))}
              placeholder="쪽"
              className="h-7 w-16 rounded-sm border border-line-strong bg-panel px-2 font-mono text-[13px] outline-none focus:border-brand"
            />
            <input
              aria-label="출제 메모"
              value={s.note}
              onChange={(e) => onChange(sources.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
              placeholder="출제 메모"
              className="h-7 flex-1 rounded-sm border border-line-strong bg-panel px-2 text-[13px] outline-none focus:border-brand"
            />
            <IconBtn label="근거 빼기" onClick={() => onChange(sources.filter((_, j) => j !== i))}>
              <X size={14} aria-hidden />
            </IconBtn>
          </div>
        )
      })}
      {pdfs.length === 0 ? (
        <p className="text-[12px] text-text-muted">파일 탭에 PDF가 없습니다.</p>
      ) : (
        unused.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {unused.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange([...sources, { fileId: p.id, pages: '', note: '' }])}
                className="inline-flex items-center gap-1 rounded-sm border border-dashed border-line-strong px-2 py-1 font-mono text-[12px] text-text-muted hover:border-brand hover:text-brand"
              >
                <Plus size={12} aria-hidden /> {p.path.split('/').pop()}
              </button>
            ))}
          </div>
        )
      )}
    </div>
  )
}

// ── 작은 조각 ──
function move<T>(arr: T[], from: number, to: number) {
  const a = [...arr]
  const [x] = a.splice(from, 1)
  a.splice(to, 0, x)
  return a
}
function MoveButtons({ i, n, label, onMove }: { i: number; n: number; label: string; onMove: (to: number) => void }) {
  return (
    <span className="flex">
      <IconBtn label={`${label} 위로`} disabled={i === 0} onClick={() => onMove(i - 1)}>
        <ArrowUp size={15} aria-hidden />
      </IconBtn>
      <IconBtn label={`${label} 아래로`} disabled={i === n - 1} onClick={() => onMove(i + 1)}>
        <ArrowDown size={15} aria-hidden />
      </IconBtn>
    </span>
  )
}
function IconBtn({ label, children, onClick, disabled, className }: { label: string; children: ReactNode; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cx('inline-flex size-8 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-panel-raised hover:text-text disabled:cursor-not-allowed disabled:opacity-30', className)}
    >
      {children}
    </button>
  )
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-text-muted select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cx('relative h-5 w-9 rounded-full transition-colors', checked ? 'bg-brand' : 'bg-line-strong')}
      >
        <span className={cx('absolute top-0.5 size-4 rounded-full bg-panel shadow-sm transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </button>
      {label}
    </label>
  )
}
