// 입력 중 오류 밑줄: 서버(/diagnostics)에 보낼 파일을 고르고, 편집기에 그릴 오류를 고르는 규칙.
import type { CompileDiagnostic } from '../api'

/** 입력이 멈추고 이만큼 지나면 분석을 요청한다 (밀리초) */
export const DIAGNOSTICS_DELAY_MS = 700

/** 서버가 분석하는 파일: 작업 폴더의 .java (서버의 빌드와 같은 규칙) */
export const isJavaSource = (path: string) => (path.startsWith('src/') || path.startsWith('test/')) && path.endsWith('.java')

/** 화면에 열려 있는 파일 중 분석에 보낼 것만. 서버가 저장된 나머지 파일과 합쳐 분석한다 */
export function javaSources(contents: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(contents).filter(([path]) => isJavaSource(path)))
}

export type EditorMark = { line: number; column: number; message: string; severity: 'error' | 'warning' }

/** 지금 보는 파일의 밑줄. 실시간 분석 결과가 있으면 그것을, 없으면 마지막 빌드 결과를 쓴다 */
export function marksFor(file: string | null, live: CompileDiagnostic[] | null, built: CompileDiagnostic[] | undefined): EditorMark[] {
  return (live ?? built ?? [])
    .filter((d) => d.file === file)
    .map((d) => ({ line: d.line, column: d.column, message: d.message, severity: d.severity }))
}

/** 서버가 돌려주는 자동 완성 후보 (POST /attempts/{id}/complete) */
export type CompletionItem = { name: string; kind: 'method' | 'field' | 'variable' | 'class'; signature: string; hasParams: boolean }

/** CodeMirror 목록의 아이콘 종류 */
export const completionType = (kind: CompletionItem['kind']) => (kind === 'field' ? 'property' : kind)

/**
 * 자동 완성을 서버에 물어볼 자리인지. 점 뒤이거나(글자가 없어도), 이름 글자를 한 글자 이상 쳤을 때.
 * 숫자로 시작하는 글자(리터럴)나, 글자를 안 쳤는데 점도 없으면(Ctrl+Space 로 직접 연 경우만) 묻지 않는다.
 */
export function shouldAskCompletion(word: string, charBefore: string, explicit: boolean): boolean {
  if (word && /^[0-9]/.test(word)) return false
  return charBefore === '.' || word.length > 0 || explicit
}

/** 후보를 고르면 넣을 글자와, 넣은 뒤 커서 위치(넣기 시작한 자리 기준). 인자가 있는 메서드는 괄호 안에 커서를 둔다 */
export function completionInsert(item: CompletionItem): { text: string; cursor: number } {
  if (item.kind !== 'method') return { text: item.name, cursor: item.name.length }
  return { text: `${item.name}()`, cursor: item.hasParams ? item.name.length + 1 : item.name.length + 2 }
}

/** 서버가 돌려주는 정의 위치 (POST /attempts/{id}/definition). 줄·열은 1부터 */
export type DefinitionTarget = { file: string; line: number; column: number; kind: string; name: string }

/** 줄·열(1부터)을 문서 안 글자 위치로. 문서 밖이면 가장 가까운 끝으로 맞춘다 */
export function posOf(lineStarts: number[], docLength: number, line: number, column: number): number {
  const index = Math.min(Math.max(line, 1), lineStarts.length) - 1
  const start = lineStarts[index] ?? 0
  const end = index + 1 < lineStarts.length ? lineStarts[index + 1] - 1 : docLength
  return Math.min(start + Math.max(column, 1) - 1, end)
}

/** 자바 키워드·리터럴. 서버 호출 없이 편집기에서 바로 완성 목록에 낸다 */
export const JAVA_KEYWORDS = [
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'continue', 'default', 'do', 'double',
  'else', 'enum', 'extends', 'false', 'final', 'finally', 'float', 'for', 'if', 'implements', 'import', 'instanceof', 'int',
  'interface', 'long', 'new', 'null', 'package', 'private', 'protected', 'public', 'record', 'return', 'short', 'static',
  'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'true', 'try', 'var', 'void', 'volatile', 'while',
]

/** 문법 트리의 이 노드 안(주석, 문자열, 글자)에서는 완성 목록을 열지 않는다 */
export const inCommentOrString = (nodeName: string) => /Comment|String|Text|Char/.test(nodeName)
