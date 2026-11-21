// 응시 화면의 과제 PDF 자료 뷰어. 응시자 API(/api/attempts/{id}/materials/file)는 로그인 헤더가 필요해
// fetch → blob URL 로 받아 iframe 에 넣는다. 파일이 바뀌면 부모가 key 로 새로 만든다.
import { useEffect, useState } from 'react'
import { FileWarning, Loader2 } from 'lucide-react'
import { ApiError, materialBlobUrl } from '../api'

export function AttemptPdf({ attemptId, path }: { attemptId: string; path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    let made: string | null = null
    materialBlobUrl(attemptId, path)
      .then((u) => {
        if (!alive) return URL.revokeObjectURL(u)
        made = u
        setUrl(u)
      })
      .catch((e: ApiError) => alive && setError(e.message))
    return () => {
      alive = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [attemptId, path])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center gap-2 bg-panel-sunken text-[14px] text-alert" role="alert">
        <FileWarning size={18} aria-hidden /> {error}
      </div>
    )
  }
  if (!url) {
    return (
      <div className="flex h-full items-center justify-center gap-2 bg-panel-sunken text-[14px] text-text-muted">
        <Loader2 size={16} className="animate-spin text-brand" aria-hidden /> 자료를 불러오는 중
      </div>
    )
  }
  return <iframe title={path.split('/').pop() ?? '자료'} src={url} className="block h-full w-full border-0 bg-panel-sunken" />
}
