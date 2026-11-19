// 외부 붙여넣기 감지. 시험 화면 안에서 복사한 글(내 코드, 문서, AI 답변)을 다시 붙이는 것은 정상이므로,
// 페이지 안에서 복사·잘라내기한 글을 기억해 두고 그것과 다른 글이 붙여 넣어질 때만 "외부 붙여넣기"로 본다.
// 짧은 글(변수 이름 등)은 오탐이 많아 MIN_CHARS 보다 짧으면 무시한다.

export type ExternalPaste = { chars: number; lines: number; target: string; occurredAt: string }

type EventSurfaces = { documentTarget?: Document; windowTarget?: Window }

/** 이보다 짧은 붙여넣기는 무시 (한두 단어는 외워 칠 수도 있는 수준) */
export const MIN_PASTE_CHARS = 20
/** 페이지 안 복사 기록을 몇 개까지 기억할지 */
const MAX_REMEMBERED = 20

/** 줄바꿈·공백 차이(CRLF, 들여쓰기 끝 공백)는 같은 글로 본다 */
export function normalize(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim()
}

export class PasteDetector {
  private readonly remembered: string[] = []
  private readonly documentTarget?: Document
  private readonly windowTarget?: Window
  private readonly onExternal: (paste: ExternalPaste) => void
  private started = false

  constructor(onExternal: (paste: ExternalPaste) => void, surfaces: EventSurfaces = {}) {
    this.onExternal = onExternal
    this.documentTarget = surfaces.documentTarget ?? (typeof document === 'undefined' ? undefined : document)
    this.windowTarget = surfaces.windowTarget ?? (typeof window === 'undefined' ? undefined : window)
  }

  start() {
    if (this.started || !this.documentTarget) return
    this.started = true
    // capture 단계: 편집기가 이벤트를 막아도(preventDefault) 먼저 본다
    this.documentTarget.addEventListener('copy', this.onCopy, true)
    this.documentTarget.addEventListener('cut', this.onCopy, true)
    this.documentTarget.addEventListener('paste', this.onPaste, true)
  }

  stop() {
    if (!this.started || !this.documentTarget) return
    this.started = false
    this.documentTarget.removeEventListener('copy', this.onCopy, true)
    this.documentTarget.removeEventListener('cut', this.onCopy, true)
    this.documentTarget.removeEventListener('paste', this.onPaste, true)
  }

  /** 페이지 안에서 복사한 글로 기록 (테스트와 편집기 연동용) */
  rememberCopy(text: string) {
    const n = normalize(text)
    if (!n) return
    this.remembered.push(n)
    if (this.remembered.length > MAX_REMEMBERED) this.remembered.shift()
  }

  /** 붙여 넣은 글이 외부에서 왔는지. 페이지 안 복사의 일부만 붙여도 안쪽으로 본다 */
  isExternal(text: string): boolean {
    const n = normalize(text)
    if (n.length < MIN_PASTE_CHARS) return false
    return !this.remembered.some((r) => r === n || r.includes(n))
  }

  private readonly onCopy = () => {
    this.rememberCopy(this.selectedText())
  }

  private readonly onPaste = (event: Event) => {
    const data = (event as ClipboardEvent).clipboardData?.getData('text/plain') ?? ''
    if (!this.isExternal(data)) return
    const n = normalize(data)
    this.onExternal({
      chars: n.length,
      lines: n.split('\n').length,
      target: targetName(event.target),
      occurredAt: new Date().toISOString(),
    })
  }

  /** 입력창 안 선택은 getSelection 에 안 잡히므로 따로 본다 */
  private selectedText(): string {
    const active = this.documentTarget?.activeElement
    if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
      const el = active as HTMLTextAreaElement
      if (typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number') {
        return el.value.slice(el.selectionStart, el.selectionEnd)
      }
    }
    return this.windowTarget?.getSelection?.()?.toString() ?? ''
  }
}

/** 어디에 붙였는지 (내용은 보내지 않고 위치 이름만) */
function targetName(target: EventTarget | null): string {
  const el = target as HTMLElement | null
  if (!el || typeof el.closest !== 'function') return 'unknown'
  if (el.closest('.cm-editor')) return 'editor'
  if (el.closest('#chat-input') || el.id === 'chat-input') return 'chat'
  return el.tagName ? el.tagName.toLowerCase() : 'unknown'
}
