import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type ApiError, type AttemptView, type Material } from '../../api'

/** 편집기 상태: 열린 파일·내용·저장 대기, 자동 저장, 파일 열기·닫기·수정, Ctrl+S, 파일 검색 */
export function useEditor({
  sessionId, view, stage, pdfInfo, setActionError, flash,
}: {
  sessionId: string
  view: AttemptView | null
  stage: 'solve' | 'followup'
  pdfInfo: Record<string, Material>
  setActionError: (msg: string | null) => void
  flash: (msg: string) => void
}) {
  const [contents, setContents] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<string[]>([])
  const [active, setActive] = useState('')
  const contentsRef = useRef(contents)
  useEffect(() => {
    contentsRef.current = contents
  }, [contents])
  const [reveal, setReveal] = useState<{ path: string; line: number; column: number; nonce: number } | null>(null)

  const saveFiles = useCallback(
    async (paths?: string[]) => {
      const targets = (paths ?? [...dirty]).filter((p) => dirty.has(p))
      const saved: Record<string, string> = {}
      for (const p of targets) {
        saved[p] = contents[p] ?? ''
        await api.save(sessionId, p, saved[p])
      }
      if (targets.length) {
        setDirty((d) => {
          const n = new Set(d)
          // 보내는 동안 더 고친 파일은 저장 대상으로 남긴다
          targets.forEach((p) => (contentsRef.current[p] ?? '') === saved[p] && n.delete(p))
          return n
        })
      }
      return targets.length
    },
    [dirty, contents, sessionId],
  )

  // 입력이 멈추고 2초 뒤 자동 저장
  useEffect(() => {
    if (!dirty.size || stage !== 'solve') return
    const id = setTimeout(() => {
      saveFiles().catch((e: ApiError) => setActionError(e.message))
    }, 2000)
    return () => clearTimeout(id)
  }, [dirty, contents, stage, saveFiles])

  // 자동 저장을 기다리던 중에 화면을 나가면(뒤로 가기 등) 마지막으로 한 번 저장한다
  const saveOnLeave = useRef<(() => void) | null>(null)
  useEffect(() => {
    saveOnLeave.current = dirty.size && stage === 'solve' ? () => void saveFiles().catch(() => undefined) : null
  })
  useEffect(() => () => saveOnLeave.current?.(), [sessionId])

  // Ctrl/⌘+F: 브라우저 찾기 대신 파일 검색을 연다
  const [searching, setSearching] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyF' && (e.ctrlKey || e.metaKey) && !e.altKey) {
        e.preventDefault()
        setSearching(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // 파일 내용은 열 때 불러오므로, 검색창을 열면 아직 안 읽은 파일도 읽는다(PDF 자료는 이름으로만 찾는다)
  useEffect(() => {
    if (!searching || !view) return
    const missing = view.files.filter((p) => !(p in contentsRef.current))
    if (!missing.length) return
    setSearchLoading(true)
    void Promise.allSettled(missing.map((p) => api.file(sessionId, p))).then((results) => {
      const got = Object.fromEntries(results.flatMap((r) => (r.status === 'fulfilled' ? [[r.value.path, r.value.content]] : [])))
      // 그사이 불러왔거나 고친 내용은 덮어쓰지 않는다
      setContents((m) => ({ ...got, ...m }))
      setSearchLoading(false)
      if (results.some((r) => r.status === 'rejected')) setActionError('일부 파일을 읽지 못해 검색에서 빠졌습니다.')
    })
  }, [searching, view, sessionId])

  // Ctrl+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        saveFiles()
          .then((n) => flash(n ? '저장했습니다' : '변경 사항이 없습니다'))
          .catch((er: ApiError) => setActionError(er.message))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveFiles])

  const openFile = async (p: string) => {
    if (!(p in contents) && !pdfInfo[p]) {
      try {
        const c = await api.file(sessionId, p)
        setContents((m) => ({ ...m, [p]: c.content }))
      } catch (e) {
        setActionError((e as ApiError).message)
        return
      }
    }
    if (!open.includes(p)) setOpen([...open, p])
    setActive(p)
  }
  const closeFile = (p: string) => {
    void saveFiles([p])
    const next = open.filter((f) => f !== p)
    setOpen(next)
    if (active === p) setActive(next[next.length - 1] ?? '')
  }
  const edit = (value: string) => {
    setContents((m) => ({ ...m, [active]: value }))
    setDirty((d) => new Set(d).add(active))
  }

  return {
    contents, setContents, dirty, setDirty, open, setOpen, active, setActive,
    reveal, setReveal, contentsRef, saveFiles, openFile, closeFile, edit,
    searching, setSearching, searchLoading,
  }
}
