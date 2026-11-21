import { useEffect, useRef } from 'react'
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { javaLanguage } from '@codemirror/lang-java'
import { markdown } from '@codemirror/lang-markdown'
import { bracketMatching, HighlightStyle, indentOnInput, LanguageSupport, syntaxHighlighting } from '@codemirror/language'
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { Annotation, EditorState, type Extension } from '@codemirror/state'
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view'
import { styleTags, tags as t } from '@lezer/highlight'
import { completionInsert, posOf, type CompletionItem, type DefinitionTarget } from '../lib/liveDiagnostics'

/** 밖에서 넣은 내용 변경 표시 (사용자 입력과 구분) */
const External = Annotation.define<boolean>()

// DESIGN.md §6.9 Code Editor: CodeMirror 6 + DESIGN 토큰 테마

// 기본 Java 문법 태그에 더해 클래스 선언, 메서드 선언, 필드, 어노테이션을 구분한다.
// (필드 사용처는 this.x 처럼 점으로 접근할 때만 구분된다. 지역 변수와 필드를 완전히 가르려면 언어 서버가 필요하다.)
const javaPlus = new LanguageSupport(
  javaLanguage.configure({
    props: [
      styleTags({
        'ClassDeclaration/Definition InterfaceDeclaration/Definition EnumDeclaration/Definition RecordDeclaration/Definition ConstructorDeclaration/Definition':
          t.className,
        'MethodDeclaration/Definition': t.function(t.definition(t.variableName)),
        'FieldDeclaration/VariableDeclarator/Definition ConstantDeclaration/VariableDeclarator/Definition': t.propertyName,
        'FieldAccess/Identifier': t.propertyName,
        'Annotation/Identifier MarkerAnnotation/Identifier Annotation/ScopedIdentifier/Identifier MarkerAnnotation/ScopedIdentifier/Identifier':
          t.annotation,
      }),
    ],
  }),
)

const v = (name: string) => `var(--color-${name})`

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.modifier, t.moduleKeyword, t.operatorKeyword, t.self, t.null], color: v('code-keyword') },
  { tag: [t.string, t.character], color: v('code-string') },
  { tag: [t.integer, t.float, t.number, t.bool, t.annotation], color: v('code-number') },
  { tag: [t.className, t.typeName, t.standard(t.typeName)], color: v('code-type') },
  { tag: [t.function(t.variableName), t.function(t.definition(t.variableName))], color: v('code-method') },
  { tag: t.propertyName, color: v('code-field') },
  { tag: [t.variableName, t.definition(t.variableName), t.labelName], color: v('text') },
  { tag: [t.lineComment, t.blockComment, t.comment], color: v('text-faint'), fontStyle: 'italic' },
  // Markdown
  { tag: t.heading, color: v('text'), fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: '700' },
  { tag: [t.link, t.url], color: v('code-method') },
  { tag: [t.processingInstruction, t.monospace], color: v('code-number') },
])

const theme = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: v('panel-sunken'), color: v('text'), fontSize: '14px' },
    '.cm-scroller': { fontFamily: '"JetBrains Mono", ui-monospace, Consolas, monospace', lineHeight: '22px' },
    '.cm-content': { padding: '12px 0', caretColor: v('brand') },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: v('brand'), borderLeftWidth: '2px' },
    '&.cm-focused': { outline: 'none' },
    '.cm-gutters': { backgroundColor: v('panel-sunken'), color: v('text-faint'), border: 'none' },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 16px 0 12px', minWidth: '48px', fontVariantNumeric: 'tabular-nums' },
    '.cm-activeLine': { backgroundColor: v('panel-raised') },
    '.cm-activeLineGutter': { backgroundColor: v('panel-raised'), color: v('text-muted') },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: 'color-mix(in srgb, var(--color-brand) 16%, transparent)',
    },
    '.cm-matchingBracket': { backgroundColor: 'color-mix(in srgb, var(--color-brand) 16%, transparent)', outline: 'none' },
    '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--color-text-muted) 20%, transparent)' },
    '.cm-tooltip': { backgroundColor: v('panel-raised'), border: `1px solid ${v('line')}`, color: v('text') },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: v('line-strong'), color: v('text') },
    '.cm-panels': { backgroundColor: v('panel'), color: v('text'), borderColor: v('line') },
    '.cm-panels input, .cm-panels button': { fontFamily: 'inherit' },
    '.cm-diagnostic-error': { borderLeftColor: v('alert') },
    '.cm-lintRange-error': {
      backgroundImage: 'none',
      textDecoration: `underline wavy ${v('alert')}`,
      textUnderlineOffset: '3px',
    },
    '.cm-lint-marker-error': { content: 'none' },
  },
  { dark: true },
)

export type EditorDiagnostic = { line: number; column: number; message: string; severity: 'error' | 'warning' }

function languageFor(path: string): Extension {
  if (path.endsWith('.java')) return javaPlus
  if (path.endsWith('.md')) return markdown()
  return []
}

function toCm(state: EditorState, diags: EditorDiagnostic[]): Diagnostic[] {
  return diags
    .filter((d) => d.line >= 1 && d.line <= state.doc.lines)
    .map((d) => {
      const line = state.doc.line(d.line)
      const from = Math.min(line.from + Math.max(0, d.column - 1), line.to)
      return { from, to: line.to > from ? line.to : from, severity: d.severity, message: d.message }
    })
}

/**
 * 파일 하나를 편집하는 코드 편집기. path 가 바뀌면 새 문서로 다시 만든다.
 */
export function CodeEditor({
  path,
  value,
  onChange,
  readOnly = false,
  diagnostics = [],
  onComplete,
  onDefinition,
  onGoto,
  reveal,
}: {
  path: string
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  diagnostics?: EditorDiagnostic[]
  /** 커서(offset) 앞 "식." 의 멤버 후보를 서버에 물어본다 */
  onComplete?: (path: string, offset: number) => Promise<CompletionItem[]>
  /** 커서(offset) 위치 이름의 정의를 서버에 물어본다. 없으면 null */
  onDefinition?: (path: string, offset: number) => Promise<DefinitionTarget | null>
  /** 정의를 찾았을 때(Ctrl/⌘+클릭, F12) 그 위치로 가 달라고 알린다. 다른 파일이면 밖에서 열어 준다 */
  onGoto?: (target: DefinitionTarget) => void
  /** 이 줄·열로 커서를 옮기고 화면 가운데로 스크롤한다. nonce 가 바뀔 때마다 다시 옮긴다 */
  reveal?: { line: number; column: number; nonce: number }
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const onDefinitionRef = useRef(onDefinition)
  onDefinitionRef.current = onDefinition
  const onGotoRef = useRef(onGoto)
  onGotoRef.current = onGoto

  // 파일(path)이나 읽기 전용 여부가 바뀔 때만 편집기를 새로 만든다
  useEffect(() => {
    if (!host.current) return
    /** 서버 자동 완성: "식." 뒤에서만. 입력하는 동안 글자가 이어지면 다시 묻지 않고 걸러 보여 준다 */
    const serverComplete = async (context: CompletionContext): Promise<CompletionResult | null> => {
      const ask = onCompleteRef.current
      const word = context.matchBefore(/\.\w*/)
      if (!ask || !word) return null
      const items = await ask(path, context.pos).catch(() => [])
      if (context.aborted || !items.length) return null
      return {
        from: word.from + 1,
        validFor: /^\w*$/,
        options: items.map((item) => ({
          label: item.name,
          detail: item.signature,
          type: item.kind === 'method' ? 'method' : 'property',
          apply: (v: EditorView, _c: unknown, from: number, to: number) => {
            const { text, cursor } = completionInsert(item)
            v.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + cursor }, userEvent: 'input.complete' })
          },
        })),
      }
    }
    /** 커서(또는 클릭한) 위치 이름의 정의로 간다 */
    const goToDefinition = async (offset: number) => {
      const ask = onDefinitionRef.current
      if (!ask) return
      const target = await ask(path, offset).catch(() => null)
      if (target) onGotoRef.current?.(target)
    }
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion({ override: [serverComplete] }),
        highlightActiveLine(),
        highlightSelectionMatches(),
        lintGutter(),
        EditorState.tabSize.of(4),
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorView.domEventHandlers({
          // Ctrl(Mac 은 ⌘)+클릭: 클릭한 이름의 정의로 이동
          mousedown(e, v) {
            if (!(e.ctrlKey || e.metaKey) || e.button !== 0) return false
            const pos = v.posAtCoords({ x: e.clientX, y: e.clientY })
            if (pos === null) return false
            e.preventDefault()
            void goToDefinition(pos)
            return true
          },
        }),
        keymap.of([{ key: 'F12', run: (v) => (void goToDefinition(v.state.selection.main.head), true) }, indentWithTab, ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...completionKeymap]),
        languageFor(path),
        syntaxHighlighting(highlight),
        theme,
        EditorView.contentAttributes.of({ 'aria-label': `${path} 편집기` }),
        EditorView.updateListener.of((u) => {
          // 밖에서 내용을 바꾼 경우(AI 수정 적용 등)는 사용자 입력이 아니므로 알리지 않는다
          if (u.docChanged && !u.transactions.some((t) => t.annotation(External))) onChangeRef.current?.(u.state.doc.toString())
        }),
      ],
    })
    const ed = new EditorView({ state, parent: host.current })
    view.current = ed
    return () => {
      ed.destroy()
      view.current = null
    }
    // value 는 처음 만들 때만 쓴다. 이후 입력은 편집기가 직접 관리한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, readOnly])

  // 바깥에서 내용이 바뀐 경우(처음 불러오기 등)만 맞춘다
  useEffect(() => {
    const ed = view.current
    if (ed && ed.state.doc.toString() !== value) {
      ed.dispatch({ changes: { from: 0, to: ed.state.doc.length, insert: value }, annotations: External.of(true) })
    }
  }, [value])

  // 정의로 이동한 자리: 커서를 옮기고 가운데로 스크롤
  useEffect(() => {
    const ed = view.current
    if (!ed || !reveal) return
    const doc = ed.state.doc
    const starts = Array.from({ length: doc.lines }, (_, i) => doc.line(i + 1).from)
    const pos = posOf(starts, doc.length, reveal.line, reveal.column)
    ed.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) })
    ed.focus()
  }, [reveal])

  // 컴파일 오류 밑줄
  useEffect(() => {
    const ed = view.current
    if (ed) ed.dispatch(setDiagnostics(ed.state, toCm(ed.state, diagnostics)))
  }, [diagnostics, path])

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />
}
