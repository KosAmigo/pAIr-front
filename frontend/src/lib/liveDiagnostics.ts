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
export type CompletionItem = { name: string; kind: 'method' | 'field'; signature: string; hasParams: boolean }

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
