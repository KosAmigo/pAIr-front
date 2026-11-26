// 채팅 첨부: 파일 트리에서 끌어온 작업 파일·과제 PDF 쪽을 질문에 붙이는 규칙(화면 쪽).
// 서버가 다시 검증하고 글자도 직접 읽는다. 여기는 보기 좋게 미리 막고 끌기 값을 만드는 순수 함수만 둔다.

export const MAX_ATTACH = 5
/** 끌기에 실리는 값의 종류. 외부 파일 끌기와 섞이지 않게 전용 타입을 쓴다 */
export const ATTACH_MIME = 'application/x-pair-attachment'
/** 첨부 파일 하나당 추가로 차감되는 크레딧 (서버 pair.credit.attachment 와 같은 값) */
export const ATTACH_CREDIT = 5
/** PDF 쪽 범위로 한 번에 보낼 수 있는 최대 쪽수 (서버 TaskMaterialService.MAX_PAGES) */
export const MAX_PDF_PAGES = 20

export type AttachSource = 'ATTEMPT_FILE' | 'TASK_FILE'
export type AttachRef = { source: AttachSource; path: string; pages?: string }

export const attachKey = (r: AttachRef) => `${r.source}|${r.path}|${r.pages ?? ''}`

/** 파일 트리 행을 끌 때 dataTransfer 에 넣는 값 */
export const encodeDrag = (r: AttachRef) => JSON.stringify(r)

/** 놓인 값을 읽는다. 우리가 만든 값이 아니면 null */
export function decodeDrop(raw: string): AttachRef | null {
  try {
    const v = JSON.parse(raw) as Partial<AttachRef>
    if ((v.source !== 'ATTEMPT_FILE' && v.source !== 'TASK_FILE') || typeof v.path !== 'string' || !v.path) return null
    if (v.pages !== undefined && typeof v.pages !== 'string') return null
    return v.source === 'TASK_FILE' ? { source: v.source, path: v.path, pages: v.pages } : { source: v.source, path: v.path }
  } catch {
    return null
  }
}

export type AddResult = { ok: true; list: AttachRef[] } | { ok: false; reason: 'full' | 'duplicate'; message: string }

/** 첨부를 목록에 더한다. 같은 파일(PDF 는 같은 쪽 범위까지)이 이미 있거나 max(과제별 제한, 기본 5)개가 찼으면 이유를 돌려준다 */
export function addAttachment(list: AttachRef[], ref: AttachRef, max: number = MAX_ATTACH): AddResult {
  // 같은 작업 파일은 한 번만, PDF 는 파일이 같으면 쪽 범위를 고쳐 쓰게 하므로 한 번만
  if (list.some((a) => a.source === ref.source && a.path === ref.path)) {
    return { ok: false, reason: 'duplicate', message: '이미 붙인 파일입니다.' }
  }
  if (list.length >= max) {
    return { ok: false, reason: 'full', message: `첨부는 한 번에 ${max}개까지 붙일 수 있습니다.` }
  }
  return { ok: true, list: [...list, ref] }
}

export const removeAttachment = (list: AttachRef[], ref: AttachRef) => list.filter((a) => attachKey(a) !== attachKey(ref))

/** PDF 칩의 쪽 범위를 고친다 */
export const setPages = (list: AttachRef[], path: string, pages: string) =>
  list.map((a) => (a.source === 'TASK_FILE' && a.path === path ? { ...a, pages } : a))

/** 끌었을 때 기본으로 붙일 쪽: 전체(최대 20쪽). 쪽 수를 모르면 첫 쪽 */
export const defaultPages = (total: number | undefined) => (!total || total <= 1 ? '1' : `1-${Math.min(total, MAX_PDF_PAGES)}`)

/** "1,3-4" 형식인지, 합쳐서 20쪽 이하인지. 서버(TaskMaterialService.parsePages)와 같은 규칙이다 */
export function validPages(spec: string | undefined): boolean {
  if (!spec || !spec.trim()) return false
  const set = new Set<number>()
  for (const part of spec.split(',')) {
    const m = /^(\d{1,6})(?:-(\d{1,6}))?$/.exec(part.trim())
    if (!m) return false
    const from = Number(m[1])
    const to = m[2] === undefined ? from : Number(m[2])
    if (from < 1 || to < from || to - from + 1 > MAX_PDF_PAGES) return false
    for (let i = from; i <= to; i++) set.add(i)
    if (set.size > MAX_PDF_PAGES) return false
  }
  return true
}

/** 보낼 수 있는지: PDF 칩은 쪽 범위가 올바라야 한다 */
export const sendable = (list: AttachRef[]) => list.every((a) => a.source !== 'TASK_FILE' || validPages(a.pages))

/** 새로 붙인 첨부가 더하는 크레딧 */
export const attachCost = (list: AttachRef[]) => list.length * ATTACH_CREDIT

export const attachLabel = (r: AttachRef) => (r.source === 'TASK_FILE' && r.pages ? `${r.path.split('/').pop()} ${r.pages}쪽` : r.path.split('/').pop() ?? r.path)

/** 남은 질문 수. 사용한 질문은 사용자 턴 수다. 0 이하로 내려가지 않는다 */
export const turnsLeft = (limit: number, turns: { role: string }[]) => Math.max(0, limit - turns.filter((t) => t.role === 'user').length)

/** 글자 수를 "8,000자" 꼴로 */
export const charsLabel = (n: number) => `${n.toLocaleString('ko-KR')}자`
