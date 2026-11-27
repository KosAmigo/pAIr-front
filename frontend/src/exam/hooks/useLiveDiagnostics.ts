import { useEffect, useRef, useState } from 'react'
import { api, type CompileDiagnostic } from '../../api'
import { DIAGNOSTICS_DELAY_MS, javaSources } from '../../lib/liveDiagnostics'

/** 입력이 멈추고 잠시 뒤 서버에서 오류를 분석해 편집기 밑줄(liveDiagnostics)을 갱신한다 */
export function useLiveDiagnostics(sessionId: string, stage: 'solve' | 'followup', contents: Record<string, string>) {
  const [liveDiagnostics, setLiveDiagnostics] = useState<CompileDiagnostic[] | null>(null)
  const diagnosticsSeq = useRef(0)

  // 입력이 멈추고 잠시 뒤 서버에서 오류를 분석해 밑줄을 갱신한다 (저장 여부와 상관없이 화면의 내용 기준)
  useEffect(() => {
    if (stage !== 'solve') return
    const files = javaSources(contents)
    if (!Object.keys(files).length) return
    const seq = ++diagnosticsSeq.current
    const id = setTimeout(() => {
      api
        .diagnostics(sessionId, files)
        .then((r) => {
          if (seq === diagnosticsSeq.current) setLiveDiagnostics(r.diagnostics)
        })
        .catch(() => {
          // 분석이 바쁘거나 실패하면 이전 밑줄을 그대로 둔다. 빌드 버튼의 결과가 기준이다
        })
    }, DIAGNOSTICS_DELAY_MS)
    return () => clearTimeout(id)
  }, [contents, stage, sessionId])

  return liveDiagnostics
}
