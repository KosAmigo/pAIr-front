import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Hammer, Loader2, Lock, Play, Save, X } from 'lucide-react'
import { CodeEditor } from '../components/CodeEditor'
import { FileSearch } from '../components/FileSearch'
import type { SearchHit } from '../lib/fileSearch'
import { cx } from '../components/cx'
import { Button, IconButton } from '../components/ui'
import { ActivityRail, type SidePanel } from '../components/ActivityRail'
import { ResizeHandle } from '../components/ResizeHandle'
import { useQuestions } from '../components/questions/useQuestions'
import { CoachTour, examGuideSteps } from '../components/CoachTour'
import { isJavaSource, javaSources, marksFor, type DefinitionTarget } from '../lib/liveDiagnostics'
import { api, ApiError, chatStream, type AiLimits, type CompileDiagnostic, type EditProposal, type Task, type Turn } from '../api'
import { AttemptPdf } from '../components/AttemptPdf'
import {
  MAX_ATTACH, addAttachment, defaultPages, removeAttachment,
  setPages, type AttachRef,
} from '../lib/chatAttach'
import { EditModal, type EditAction } from '../components/EditProposal'
import { WarningModal } from '../anti-cheating'
import { proctorApi } from '../proctor/api/proctorApi.ts'
import NoticeBanner from '../proctor/react/NoticeBanner.tsx'
import { readLiveExam } from '../proctor/liveExam.ts'
import { useCredits } from '../data/credits'
import { ExamHeader } from '../exam/components/ExamHeader'
import { SidePanel as SidePanelView } from '../exam/components/SidePanel'
import { ChatPanel } from '../exam/components/ChatPanel'
import { FollowUp } from '../exam/components/FollowUp'
import { PromptList } from '../exam/components/PromptList'
import { ConfirmModal } from '../exam/components/ConfirmModal'
import { DocChecks } from '../exam/components/DocChecks'
import { CenterMessage } from '../exam/components/CenterMessage'
import { NewExam } from '../exam/components/NewExam'
import { buildTree } from '../exam/components/PathTree'
import { readOnlyPath, fileName } from '../exam/format'
import { useLiveGuard } from '../exam/hooks/useLiveGuard'
import { endLiveProctoring } from '../exam/endLiveProctoring'
import { useLiveDiagnostics } from '../exam/hooks/useLiveDiagnostics'
import { useEditor } from '../exam/hooks/useEditor'
import { useExamLoader, type LoadSinks } from '../exam/hooks/useExamLoader'
import { usePanelWidths, DEFAULT_WIDTHS, MIN_WIDTHS, RAIL_WIDTH, CENTER_MIN, maxPanelWidth } from '../exam/hooks/usePanelWidths'
export { NewExam }

// 카메라 감독은 실전 시험에서만 불러온다 (자가진단은 분석 모델을 내려받지 않는다)

const CamMonitor = lazy(() => import('../proctor/react/CamMonitor.tsx'))

// 실제 응시 화면: 백엔드 API 에 연결된 버전. 레이아웃은 DESIGN.md §7-3 응시 화면을 따른다.

// ── 응시 화면 ───────────────────────────
export default function RealExam() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const { refresh: refreshCredits } = useCredits()
  // 입장 링크로 시작한 실전 응시일 때만 값이 있다. 자가진단은 null → 감독을 전혀 켜지 않는다
  const [live] = useState(() => readLiveExam(sessionId))
  // 처음 불러온 값을 편집기·채팅 상태로 넘긴다(아래에서 세터를 채운다)
  const loadSinks = useRef<LoadSinks | null>(null)
  const { view, setView, loadError, stage, setStage, elapsed, materials } = useExamLoader(sessionId, navigate, loadSinks)
  const [side, setSide] = useState<SidePanel>('task')
  const [showOutput, setShowOutput] = useState(true)
  const [showChat, setShowChat] = useState(true)
  const [widths, setWidth] = usePanelWidths()
  const sideKey = side === 'questions' ? 'questions' : 'side'
  const [turns, setTurns] = useState<Turn[]>([])
  const [chatBusy, setChatBusy] = useState(false)
  const [streaming, setStreaming] = useState<{ question: string; answer: string } | null>(null)
  const [chatError, setChatError] = useState<string | null>(null)
  const [editBusy, setEditBusy] = useState(false)
  // 이번 질문에 붙이려고 끌어 놓은 파일과, 이 과제의 PDF 자료(응시 파일로 복사되지 않아 따로 온다)
  const [attached, setAttached] = useState<AttachRef[]>([])
  // 같은 렌더 안에서 파일을 연달아 놓아도 앞의 것이 사라지지 않게 최신 목록을 ref 로도 쥔다
  const attachedRef = useRef<AttachRef[]>([])
  const updateAttached = (fn: (l: AttachRef[]) => AttachRef[]) => {
    attachedRef.current = fn(attachedRef.current)
    setAttached(attachedRef.current)
  }
  const [viewing, setViewing] = useState<{ turn: number; index: number } | null>(null)
  // 빌드(컴파일만) 또는 테스트 실행 결과. 마지막으로 누른 쪽을 보여 준다.
  const [run, setRun] = useState<{
    kind: 'build' | 'test'
    compiled: boolean
    lines: string[]
    passed?: number
    failed?: number
    diagnostics: CompileDiagnostic[]
  } | null>(null)
  const [busyTask, setBusyTask] = useState<'build' | 'test' | null>(null)
  const running = busyTask !== null
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }
  const pdfInfo = useMemo(() => Object.fromEntries(materials.map((m) => [m.path, m])), [materials])
  const tree = useMemo(() => buildTree([...(view?.files ?? []), ...materials.map((m) => m.path)]), [view, materials])

  const {
    contents, setContents, dirty, setDirty, open, setOpen, active, setActive,
    reveal, setReveal, contentsRef, saveFiles, openFile, closeFile, edit,
    searching, setSearching, searchLoading,
  } = useEditor({ sessionId, view, stage, pdfInfo, setActionError, flash })
  loadSinks.current = { setTurns, setContents, setOpen, setActive }
  const liveDiagnostics = useLiveDiagnostics(sessionId, stage, contents)
  const [fuIndex, setFuIndex] = useState(0)
  const [fuAnswers, setFuAnswers] = useState<string[] | null>(null)
  const [refTab, setRefTab] = useState<'prompts' | 'file'>('prompts')
  // 객관식·단답형 문항 (비개발 과제). 풀이 중이 아니면 읽기 전용
  const qs = useQuestions(sessionId, stage !== 'solve')
  const hasQuestions = qs.questions.length > 0 || qs.load === 'error'
  const { antiCheating, linkExpired, needFullscreen, liveLeft } = useLiveGuard({ sessionId, live, view, navigate })
  const [tourOpen, setTourOpen] = useState(false)
  const doneUrl = live ? `/exam/${sessionId}/submitted` : `/report/${sessionId}`

  if (loadError) return <CenterMessage text="" error={loadError} />
  if (!view) return <CenterMessage text="응시 화면을 불러오고 있습니다" />

  const task = view.task as Task & { requiredHeadings?: string[] }
  // 과제별 AI 제한(E6). 서버가 주지 않으면(옛 서버) 화면 기본값
  const aiLimits: AiLimits = view.aiLimits ?? { turns: 40, maxAttach: MAX_ATTACH, contextChars: 30000 }
  const dev = task.type === 'dev'
  // 실전은 서버 기준 종료 시각까지, 자가진단은 과제 제한 시간에서 지난 시간을 뺀다
  const left = liveLeft ?? task.minutes * 60 - elapsed
  const locked = stage === 'followup'
  const fuList = fuAnswers ?? task.followUps.map(() => '')
  const showPrompts = locked && refTab === 'prompts'
  const tone = locked ? 'text-text' : left <= 180 ? 'text-alert' : left <= 600 ? 'text-caution' : 'text-text'
  const isDoc = !dev && active === task.editableFile

  /** 편집기 도우미(자동 완성·정의로 이동)가 서버에 보낼 화면의 저장 전 내용 */
  const editorHelp = {
    complete: async (path: string, offset: number) =>
      isJavaSource(path) ? (await api.complete(sessionId, javaSources(contentsRef.current), path, offset)).items : [],
    definition: async (path: string, offset: number) =>
      isJavaSource(path) ? (await api.definition(sessionId, javaSources(contentsRef.current), path, offset)).definition : null,
    goto: async (t: DefinitionTarget) => {
      await openFile(t.file)
      setRefTab('file')
      setReveal({ path: t.file, line: t.line, column: t.column, nonce: Date.now() })
    },
  }
  const pickSearchHit = async (hit: SearchHit) => {
    setSearching(false)
    await openFile(hit.path)
    setRefTab('file')
    if (hit.line) setReveal({ path: hit.path, line: hit.line, column: hit.column ?? 1, nonce: Date.now() })
  }
  const doRun = async (kind: 'build' | 'test') => {
    setBusyTask(kind)
    setActionError(null)
    setShowOutput(true)
    try {
      await saveFiles()
      if (kind === 'build') {
        const r = await api.build(sessionId)
        setRun({ kind, compiled: r.compiled, lines: r.lines, diagnostics: r.diagnostics })
      } else {
        const r = await api.run(sessionId)
        setRun({ kind, compiled: r.compiled, lines: r.lines, passed: r.passed, failed: r.failed, diagnostics: r.diagnostics ?? [] })
      }
    } catch (e) {
      setActionError((e as ApiError).message)
    } finally {
      setBusyTask(null)
    }
  }
  const activeDiagnostics = marksFor(active, liveDiagnostics, run?.diagnostics)

  /** 파일 트리의 파일을 첨부로 바꾼다. PDF 자료는 기본으로 전체(최대 20쪽)를 붙인다 */
  const attachFor = (path: string): AttachRef =>
    pdfInfo[path] ? { source: 'TASK_FILE', path, pages: defaultPages(pdfInfo[path].pages) } : { source: 'ATTEMPT_FILE', path }
  /** 끌어다 놓거나 첨부 버튼을 누르면 호출된다. 못 붙이는 이유가 있으면 안내 문구를 돌려준다 */
  const attach = (ref: AttachRef): string | null => {
    const r = addAttachment(attachedRef.current, ref, aiLimits.maxAttach)
    if (!r.ok) return r.message
    updateAttached(() => r.list)
    return null
  }

  const sendChat = async (text: string) => {
    setChatBusy(true)
    setChatError(null)
    setStreaming({ question: text, answer: '' })
    // 보내는 순간 입력창의 첨부는 비운다. 실패하면 되돌리고, 답변 중에 새로 붙인 파일은 남긴다
    const sent = attachedRef.current
    updateAttached(() => [])
    try {
      // 서버는 저장된 파일 내용을 읽으므로, 고치던 첨부 파일은 먼저 저장한다
      const dirtyAttached = sent.filter((a) => a.source === 'ATTEMPT_FILE' && dirty.has(a.path)).map((a) => a.path)
      if (dirtyAttached.length) await saveFiles(dirtyAttached)
      const added = await chatStream(sessionId, text, (d) => setStreaming((s) => (s ? { ...s, answer: s.answer + d } : s)), sent)
      if (!live) void refreshCredits()
      setTurns((t) => [...t, ...added])
      return true
    } catch (e) {
      updateAttached((now) => now.reduce((list, ref) => {
        const r = addAttachment(list, ref, aiLimits.maxAttach)
        return r.ok ? r.list : list
      }, sent))
      setChatError((e as ApiError).message)
      return false
    } finally {
      setStreaming(null)
      setChatBusy(false)
    }
  }

  /** AI 수정 제안 적용/거절. 적용하면 서버가 파일을 고치고, 그 파일을 편집기에 열어 보여 준다. */
  const decideEdit = async (turn: number, e: EditProposal, action: EditAction) => {
    setEditBusy(true)
    setChatError(null)
    try {
      if (action === 'apply' && dirty.has(e.path)) await saveFiles([e.path])
      const r = await api.decideEdit(sessionId, turn, e.index, action)
      const v = await api.attempt(sessionId)
      setTurns(v.turns)
      setView((old) => (old ? { ...old, files: v.files } : v))
      if (r.status === 'APPLIED' && r.content != null) {
        const content = r.content
        setContents((m) => ({ ...m, [r.path]: content }))
        setDirty((d) => {
          const n = new Set(d)
          n.delete(r.path)
          return n
        })
        setOpen((o) => (o.includes(r.path) ? o : [...o, r.path]))
        setActive(r.path)
        setViewing(null)
        flash(`적용했습니다: ${r.path}`)
      } else {
        setViewing(null)
      }
    } catch (er) {
      setChatError((er as ApiError).message)
    } finally {
      setEditBusy(false)
    }
  }
  const viewingEdit = viewing ? turns.find((t) => t.turn === viewing.turn)?.edits?.find((x) => x.index === viewing.index) : undefined

  const doSubmit = async () => {
    setBusy(true)
    setActionError(null)
    try {
      await saveFiles()
      await qs.flush()
      await api.submit(sessionId)
      setConfirm(false)
      setStage('followup')
    } catch (e) {
      setActionError((e as ApiError).message)
      setConfirm(false)
    } finally {
      setBusy(false)
    }
  }

  const doFollowUps = async (answers: string[]) => {
    setBusy(true)
    setActionError(null)
    try {
      await api.followUps(sessionId, answers)
      await antiCheating.finish()
      if (live) {
        // 이 과제만 회차에 제출 기록(과제별 제출). 실패해도 종료 시각에 서버가 대신 제출하므로 화면은 넘어간다
        const taskId = Object.keys(live.attempts).find((t) => live.attempts[t] === sessionId)
        if (taskId) await proctorApi.submitTask(live.invite, taskId).catch(() => undefined)
        await endLiveProctoring()
      }
      navigate(doneUrl)
    } catch (e) {
      setActionError((e as ApiError).message)
      setBusy(false)
    }
  }

  return (
    // 집중 무대(DESIGN.md §0-1, §7-3): 들어올 때 짧은 페이드만, 꾸밈 연출은 focus-stage 로 끈다
    <div className="focus-stage fade-in flex h-full flex-col bg-bg">
      <NoticeBanner invite={live?.invite} />
      {/* 6.7 Status Bar */}
      <ExamHeader
        task={task}
        live={live}
        left={left}
        locked={locked}
        tone={tone}
        model={view.attempt.model}
        antiCheating={antiCheating}
        setActionError={setActionError}
        setTourOpen={setTourOpen}
        setConfirm={setConfirm}
      />

      {actionError && (
        <div role="alert" className="flex shrink-0 items-center gap-3 border-b border-alert/40 bg-alert/10 px-4 py-2 text-[14px] text-alert">
          {actionError}
          <IconButton label="닫기" className="ml-auto" onClick={() => setActionError(null)}>
            <X size={16} aria-hidden />
          </IconButton>
        </div>
      )}

      <div
        className="grid min-h-0 flex-1"
        // 창이 좁아지면 양옆 칸이 최소 폭까지 먼저 줄고, 가운데 칸은 CENTER_MIN 을 지킨다
        style={{
          gridTemplateColumns: [
            `${RAIL_WIDTH}px`,
            side && `minmax(${MIN_WIDTHS[sideKey]}px, ${widths[sideKey]}px)`,
            `minmax(${CENTER_MIN}px, 1fr)`,
            showChat && `minmax(${MIN_WIDTHS.chat}px, ${widths.chat}px)`,
            live?.proctoring && 'auto', // 카메라 감독 열
          ].filter(Boolean).join(' '),
        }}
      >
        <ActivityRail
          side={side}
          onSide={setSide}
          showOutput={showOutput}
          onToggleOutput={() => setShowOutput((v) => !v)}
          outputLabel={dev ? '실행 결과' : '체크리스트'}
          showChat={showChat}
          onToggleChat={() => setShowChat((v) => !v)}
          questions={hasQuestions ? { answered: qs.answered, total: qs.questions.length } : undefined}
        />
        {/* 사이드 패널: 과제 / 파일 */}
        {side && (
          <SidePanelView
            side={side}
            widths={widths}
            sideKey={sideKey}
            setWidth={setWidth}
            task={task}
            dev={dev}
            hasQuestions={hasQuestions}
            qs={qs}
            setSide={setSide}
            tree={tree}
            active={active}
            openFile={openFile}
            locked={locked}
            setRefTab={setRefTab}
            attachFor={attachFor}
            attach={attach}
            flash={flash}
          />
        )}

        {/* 가운데: 에디터 + 출력 | 후속 질문 */}
        <div className="flex min-h-0 min-w-0 flex-col" data-tour="editor">
          <>
              <div className="flex h-10 shrink-0 items-stretch border-b border-line bg-panel">
                <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto" role="tablist" aria-label="열린 파일">
                  {locked && (
                    <button
                      role="tab"
                      type="button"
                      aria-selected={showPrompts}
                      onClick={() => setRefTab('prompts')}
                      className={cx(
                        'relative flex shrink-0 items-center border-r border-line px-3 text-[14px]',
                        showPrompts ? 'bg-panel-sunken text-text' : 'text-text-muted hover:text-text',
                      )}
                    >
                      {showPrompts && <span className="absolute inset-x-0 top-0 h-0.5 bg-brand" aria-hidden />}
                      내 질문 <span className="tnum ml-1.5 font-mono text-[12px] text-text-faint">{turns.filter((t) => t.role === 'user').length}</span>
                    </button>
                  )}
                  {open.map((f) => (
                    <div
                      key={f}
                      className={cx(
                        'group relative flex shrink-0 items-center gap-1 border-r border-line pr-1 pl-3',
                        active === f && !showPrompts ? 'bg-panel-sunken text-text' : 'text-text-muted hover:text-text',
                        locked && 'pr-3',
                      )}
                    >
                      {active === f && !showPrompts && <span className="absolute inset-x-0 top-0 h-0.5 bg-brand" aria-hidden />}
                      <button
                        role="tab"
                        aria-selected={active === f && !showPrompts}
                        type="button"
                        onClick={() => {
                          setActive(f)
                          setRefTab('file')
                        }}
                        className="font-mono text-[14px]"
                        title={f}
                      >
                        {fileName(f)}
                        {dirty.has(f) && <span className="ml-1 text-caution">●</span>}
                      </button>
                      {!locked && <button
                        type="button"
                        aria-label={`${fileName(f)} 닫기`}
                        onClick={() => closeFile(f)}
                        className="inline-flex size-6 items-center justify-center rounded-sm text-text-faint hover:bg-panel-raised hover:text-text"
                      >
                        <X size={14} aria-hidden />
                      </button>}
                    </div>
                  ))}
                </div>
                {(locked || readOnlyPath(active)) && (
                  <span className="flex items-center gap-1 px-3 font-mono text-[12px] text-text-faint">
                    <Lock size={12} aria-hidden /> READ ONLY
                  </span>
                )}
              </div>

              <div className="min-h-0 flex-1">
                {showPrompts ? (
                  <PromptList
                    turns={turns}
                    onInsert={(ref) =>
                      setFuAnswers(fuList.map((a, j) => (j === fuIndex ? (a && !/\s$/.test(a) ? a + ' ' : a) + ref : a)))
                    }
                  />
                ) : active && pdfInfo[active] ? (
                  <AttemptPdf key={active} attemptId={sessionId} path={active} />
                ) : active && !isDoc ? (
                  <CodeEditor
                    path={active}
                    value={contents[active] ?? ''}
                    readOnly={locked || readOnlyPath(active)}
                    onChange={edit}
                    diagnostics={activeDiagnostics}
                    onComplete={editorHelp.complete}
                    onDefinition={editorHelp.definition}
                    onGoto={(t) => void editorHelp.goto(t)}
                    reveal={reveal && reveal.path === active ? reveal : undefined}
                  />
                ) : active ? (
                  <textarea
                    aria-label={`${active} 편집기`}
                    value={contents[active] ?? ''}
                    readOnly={locked || readOnlyPath(active)}
                    spellCheck={false}
                    onChange={(e) => edit(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Tab' && !readOnlyPath(active)) {
                        e.preventDefault()
                        const el = e.currentTarget
                        const { selectionStart: s, selectionEnd: en, value } = el
                        edit(value.slice(0, s) + '    ' + value.slice(en))
                        requestAnimationFrame(() => el.setSelectionRange(s + 4, s + 4))
                      }
                    }}
                    className={cx(
                      'block h-full w-full resize-none bg-panel-sunken text-text outline-none',
                      isDoc ? 'px-12 py-8 font-sans text-body' : 'px-4 py-3 font-mono text-code whitespace-pre',
                      readOnlyPath(active) && 'text-text-muted',
                    )}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-panel-sunken text-[15px] text-text-muted">파일 탐색기에서 파일을 여세요</div>
                )}
              </div>

              {locked ? (
                <div className="h-[48%] min-h-[300px] shrink-0 border-t border-line">
                  <FollowUp
                    questions={task.followUps}
                    i={fuIndex}
                    onIndex={setFuIndex}
                    answers={fuList}
                    onAnswers={setFuAnswers}
                    busy={busy}
                    error={actionError}
                    onDone={(a) => void doFollowUps(a)}
                  />
                </div>
              ) : (
              <section className={cx('flex shrink-0 flex-col border-t border-line bg-panel', showOutput ? 'h-60' : 'h-10')}>
                <header className={cx('flex h-10 shrink-0 items-center gap-3 px-4', showOutput && 'border-b border-line')}>
                  <span className="label">{dev ? 'OUTPUT' : 'CHECK'}</span>
                  {dev && run && (
                    <span
                      className={cx(
                        'font-mono text-[13px]',
                        run.compiled && (run.kind === 'build' || run.failed === 0) ? 'text-signal' : 'text-alert',
                      )}
                    >
                      {!run.compiled
                        ? `build failed, ${run.diagnostics.filter((d) => d.severity === 'error').length} errors`
                        : run.kind === 'build'
                          ? 'build successful'
                          : `${run.passed} passed, ${run.failed} failed`}
                    </span>
                  )}
                  {dev && (
                    <div className="ml-auto flex items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => void doRun('build')} disabled={running} title="컴파일만 합니다">
                        {busyTask === 'build' ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Hammer size={16} aria-hidden />} 빌드
                      </Button>
                      <Button variant="primary" size="sm" onClick={() => void doRun('test')} disabled={running} title="컴파일하고 test 폴더의 JUnit 테스트를 실행합니다">
                        {busyTask === 'test' ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Play size={16} aria-hidden />} 테스트 실행
                      </Button>
                    </div>
                  )}
                </header>
                {showOutput && (
                <div className="min-h-0 flex-1 overflow-auto bg-panel-sunken p-4 font-mono text-code">
                  {!dev ? (
                    <DocChecks task={task} doc={contents[task.editableFile ?? ''] ?? ''} />
                  ) : running ? (
                    <span className="text-text-faint">
                      {busyTask === 'build' ? '$ 컴파일하고 있습니다...' : '$ 컴파일하고 테스트를 실행하고 있습니다...'}
                    </span>
                  ) : run ? (
                    run.lines.map((l, i) => {
                      const m = /^\[(ERROR|WARNING)\] (\S+\.java):(\d+)/.exec(l)
                      return m ? (
                        <button
                          key={i}
                          type="button"
                          onClick={() => void openFile(m[2])}
                          title={`${m[2]} ${m[3]}번째 줄 열기`}
                          className={cx('block w-full text-left whitespace-pre-wrap hover:underline', m[1] === 'ERROR' ? 'text-alert' : 'text-caution')}
                        >
                          {l}
                        </button>
                      ) : (
                      <div
                        key={i}
                        className={cx(
                          'whitespace-pre-wrap',
                          l.startsWith('$') && 'text-text-faint',
                          /\[OK\]|tests successful/.test(l) && 'text-signal',
                          /\[X\]|\[ERROR\]|\[TIMEOUT\]|FAILED|tests failed\s*\]/.test(l) && !/\b0 tests failed/.test(l) && 'text-alert',
                        )}
                      >
                        {l}
                      </div>
                      )
                    })
                  ) : (
                    <span className="text-text-faint">$ 빌드는 컴파일만, 테스트 실행은 컴파일 후 test 폴더의 JUnit 테스트까지 돌립니다</span>
                  )}
                </div>
                )}
              </section>
              )}
            </>
        </div>

        {/* 오른쪽: AI */}
        {showChat && (
        <div className="relative min-h-0 min-w-0" data-tour="chat">
          <ResizeHandle
            label="AI 채팅 창 크기 조절"
            edge="left"
            value={widths.chat}
            min={MIN_WIDTHS.chat}
            maxWidth={maxPanelWidth}
            onResize={(w) => setWidth('chat', w)}
            onReset={() => setWidth('chat', DEFAULT_WIDTHS.chat)}
          />
          <div className="absolute inset-0 flex">
            <div className="flex min-w-0 flex-1 flex-col">
              <ChatPanel turns={turns} streaming={streaming} disabled={locked} busy={chatBusy} error={chatError} onSend={sendChat} model={view.attempt.model} maxChars={view.chatMaxChars ?? 1000} limits={aiLimits}
                editBusy={editBusy}
                onEdit={(t, e, a) => void decideEdit(t, e, a)}
                onViewEdit={(t, e) => setViewing({ turn: t, index: e.index })}
                attachments={attached}
                materialPages={Object.fromEntries(materials.map((m) => [m.path, m.pages]))}
                showCost={!live}
                onAttach={attach}
                onDetach={(r) => updateAttached((l) => removeAttachment(l, r))}
                onPages={(path, pages) => updateAttached((l) => setPages(l, path, pages))}
              />
            </div>
          </div>
          {locked && (
            <div className="absolute top-12 right-4 flex items-center gap-1.5 rounded-sm bg-panel-raised px-2 py-1 font-mono text-[12px] text-text-muted">
              <Lock size={14} aria-hidden /> READ ONLY
            </div>
          )}
        </div>
        )}

        {/* 카메라 감독: 응시 UI 와 겹치지 않게 맨 오른쪽 전용 열 */}
        {live?.proctoring && (
          <Suspense fallback={<aside className="w-12 border-l border-line bg-panel" aria-hidden />}>
            <CamMonitor live={live} />
          </Suspense>
        )}
      </div>

      {searching && (
        <FileSearch
          paths={[...view.files, ...materials.map((m) => m.path)]}
          contents={contents}
          loading={searchLoading}
          onPick={(h) => void pickSearchHit(h)}
          onClose={() => setSearching(false)}
        />
      )}
      {tourOpen &&<CoachTour steps={examGuideSteps({ proctoring: Boolean(live?.proctoring) })} storageKey="exam-guide-v3" onClose={() => setTourOpen(false)} />}
      {linkExpired && (
        <div role="alertdialog" aria-modal="true" aria-label="입장 링크 만료" className="fixed inset-0 z-[95] flex items-center justify-center bg-bg/95 p-4">
          <section className="w-full max-w-[460px] rounded-lg border border-alert/50 bg-panel p-6 text-center shadow-modal">
            <h2 className="text-h2 font-semibold">입장 링크가 만료되었습니다</h2>
            <p className="mt-2 text-[15px] leading-6 break-keep text-text-muted">
              연결이 끊긴 채로 유예 시간(5분)을 넘겨 이 시험 링크가 만료되었습니다. 이 기록은 감독 기록에 남았습니다. 기업 담당자에게 문의해 주세요. 담당자가 링크를 되살리면 같은 링크로 다시 들어와 남은 시간 동안 이어서 풀 수 있습니다.
            </p>
            <Button variant="primary" className="mt-5" onClick={() => navigate('/')}>
              나가기
            </Button>
          </section>
        </div>
      )}
      {needFullscreen && (
        <div role="dialog" aria-modal="true" aria-label="전체 화면 필요" className="fixed inset-0 z-[80] flex items-center justify-center bg-bg/90 p-4 backdrop-blur-sm">
          <section className="w-full max-w-[440px] rounded-lg border border-line bg-panel p-6 text-center shadow-modal">
            <h2 className="text-h2 font-semibold">전체 화면으로 시험을 진행합니다</h2>
            <p className="mt-2 text-[15px] leading-6 text-text-muted">시험 중에는 다른 창으로 이동할 수 없고, 이동 시도(Alt+Tab, Win 키 등)는 기록됩니다.</p>
            <Button
              variant="primary"
              className="mt-5"
              onClick={() => void antiCheating.requestFullscreen().catch(() => setActionError('전체 화면으로 전환할 수 없습니다. 브라우저 설정을 확인해 주세요.'))}
            >
              전체 화면 시작
            </Button>
          </section>
        </div>
      )}
      <WarningModal violation={antiCheating.warning} count={antiCheating.count} onClose={antiCheating.dismissWarning} />
      {confirm && <ConfirmModal busy={busy} onCancel={() => setConfirm(false)} onConfirm={() => void doSubmit()} />}
      {viewing && viewingEdit && (
        <EditModal
          edit={viewingEdit}
          turn={viewing.turn}
          busy={editBusy}
          disabled={locked}
          onAction={(a) => void decideEdit(viewing.turn, viewingEdit, a)}
          onClose={() => setViewing(null)}
        />
      )}

      {toast && (
        <div role="status" className="fade-in fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-md border border-line bg-panel-raised px-4 py-2 text-[14px] shadow-modal">
          <Save size={16} className="text-signal" aria-hidden />
          {toast}
        </div>
      )}
    </div>
  )
}
