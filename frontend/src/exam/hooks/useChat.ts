import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { api, chatStream, type ApiError, type AttemptView, type EditProposal, type Material, type Turn } from '../../api'
import { addAttachment, defaultPages, type AttachRef } from '../../lib/chatAttach'
import type { EditAction } from '../../components/EditProposal'
import type { LiveExam } from '../../proctor/liveExam.ts'

/** AI 채팅: 대화 기록, 답변 스트리밍, 첨부, 수정 제안 적용·거절 */
export function useChat({
  sessionId, live, maxAttach, pdfInfo, dirty, saveFiles, setContents, setDirty, setOpen, setActive, setView, refreshCredits, flash,
}: {
  sessionId: string
  live: LiveExam | null
  maxAttach: number
  pdfInfo: Record<string, Material>
  dirty: Set<string>
  saveFiles: (paths?: string[]) => Promise<number>
  setContents: Dispatch<SetStateAction<Record<string, string>>>
  setDirty: Dispatch<SetStateAction<Set<string>>>
  setOpen: Dispatch<SetStateAction<string[]>>
  setActive: Dispatch<SetStateAction<string>>
  setView: Dispatch<SetStateAction<AttemptView | null>>
  refreshCredits: () => Promise<unknown> | void
  flash: (msg: string) => void
}) {
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

  /** 파일 트리의 파일을 첨부로 바꾼다. PDF 자료는 기본으로 전체(최대 20쪽)를 붙인다 */
  const attachFor = (path: string): AttachRef =>
    pdfInfo[path] ? { source: 'TASK_FILE', path, pages: defaultPages(pdfInfo[path].pages) } : { source: 'ATTEMPT_FILE', path }
  /** 끌어다 놓거나 첨부 버튼을 누르면 호출된다. 못 붙이는 이유가 있으면 안내 문구를 돌려준다 */
  const attach = (ref: AttachRef): string | null => {
    const r = addAttachment(attachedRef.current, ref, maxAttach)
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
        const r = addAttachment(list, ref, maxAttach)
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

  return {
    turns, setTurns, streaming, chatBusy, chatError, editBusy, attached, updateAttached,
    viewing, setViewing, viewingEdit, attach, attachFor, sendChat, decideEdit,
  }
}
