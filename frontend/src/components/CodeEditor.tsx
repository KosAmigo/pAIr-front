import { useEffect, useRef } from 'react'
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { javaLanguage } from '@codemirror/lang-java'
import { markdown } from '@codemirror/lang-markdown'
import { bracketMatching, HighlightStyle, indentOnInput, LanguageSupport, syntaxHighlighting } from '@codemirror/language'
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { EditorState, type Extension } from '@codemirror/state'
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view'
import { styleTags, tags as t } from '@lezer/highlight'

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
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.modifier, t.moduleKeyword, t.operatorKeyword, t.self, t.null], color: v('branch-3') },
  { tag: [t.string, t.character], color: v('branch-1') },
  { tag: [t.integer, t.float, t.number, t.bool, t.annotation], color: v('branch-4') },
  { tag: [t.className, t.typeName, t.standard(t.typeName)], color: v('code-type') },
  { tag: [t.function(t.variableName), t.function(t.definition(t.variableName))], color: v('branch-2') },
  { tag: t.propertyName, color: v('code-field') },
  { tag: [t.variableName, t.definition(t.variableName), t.labelName], color: v('text') },
  { tag: [t.lineComment, t.blockComment, t.comment], color: v('text-faint'), fontStyle: 'italic' },
  // Markdown
  { tag: t.heading, color: v('text'), fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: '700' },
  { tag: [t.link, t.url], color: v('branch-2') },
  { tag: [t.processingInstruction, t.monospace], color: v('branch-4') },
])

const theme = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: v('panel-sunken'), color: v('text'), fontSize: '14px' },
    '.cm-scroller': { fontFamily: '"JetBrains Mono", ui-monospace, Consolas, monospace', lineHeight: '22px' },
    '.cm-content': { padding: '12px 0', caretColor: v('signal') },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: v('signal'), borderLeftWidth: '2px' },
    '&.cm-focused': { outline: 'none' },
    '.cm-gutters': { backgroundColor: v('panel-sunken'), color: v('text-faint'), border: 'none' },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 16px 0 12px', minWidth: '48px', fontVariantNumeric: 'tabular-nums' },
    '.cm-activeLine': { backgroundColor: v('panel-raised') },
    '.cm-activeLineGutter': { backgroundColor: v('panel-raised'), color: v('text-muted') },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: 'color-mix(in srgb, var(--color-info) 30%, transparent)',
    },
    '.cm-matchingBracket': { backgroundColor: 'color-mix(in srgb, var(--color-signal) 20%, transparent)', outline: 'none' },
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
}: {
  path: string
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  diagnostics?: EditorDiagnostic[]
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // 파일(path)이나 읽기 전용 여부가 바뀔 때만 편집기를 새로 만든다
  useEffect(() => {
    if (!host.current) return
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
        autocompletion(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        lintGutter(),
        EditorState.tabSize.of(4),
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        keymap.of([indentWithTab, ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...completionKeymap]),
        languageFor(path),
        syntaxHighlighting(highlight),
        theme,
        EditorView.contentAttributes.of({ 'aria-label': `${path} 편집기` }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current?.(u.state.doc.toString())
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
      ed.dispatch({ changes: { from: 0, to: ed.state.doc.length, insert: value } })
    }
  }, [value])

  // 컴파일 오류 밑줄
  useEffect(() => {
    const ed = view.current
    if (ed) ed.dispatch(setDiagnostics(ed.state, toCm(ed.state, diagnostics)))
  }, [diagnostics, path])

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />
}
