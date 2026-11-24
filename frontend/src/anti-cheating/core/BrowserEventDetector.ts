import type { AntiCheatingConfig, ResumeReason, SignalType } from './types.ts'

/** 창 전환과 비슷한 키 조합인가 (Alt+Tab, Win/Cmd 키, Alt+Esc, Alt+F4, Ctrl+Tab, Ctrl+W/T/N, PrintScreen) */
export function isWindowSwitchKey(e: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey'>): boolean {
  if (typeof e.key !== 'string') return false
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
  if (key === 'Meta' || key === 'OS' || key === 'PrintScreen') return true
  if (e.altKey && (key === 'Tab' || key === 'Escape' || key === 'F4')) return true
  if (e.ctrlKey && (key === 'Tab' || key === 'w' || key === 't' || key === 'n')) return true
  return false
}

type KeyboardLock = { lock?: (codes: string[]) => Promise<void>; unlock?: () => void }
const LOCKED_CODES = ['AltLeft', 'AltRight', 'Tab', 'MetaLeft', 'MetaRight', 'Escape', 'KeyW', 'KeyT', 'KeyN']

/** 전체 화면일 때 크롬 계열은 이 키들을 페이지로 넘겨 준다 (Keyboard Lock). 지원하지 않거나 거절되면 감지만 한다 */
function lockKeys() {
  const kb = (typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard)
  kb?.lock?.(LOCKED_CODES)?.catch(() => undefined)
}

function unlockKeys() {
  const kb = (typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard)
  kb?.unlock?.()
}

type EventSurfaces = { documentTarget?: Document; windowTarget?: Window }

export class BrowserEventDetector {
  private readonly documentTarget?: Document
  private readonly windowTarget?: Window
  private started = false
  private wasFullscreen = false
  private readonly onSignal: (type: SignalType) => void
  private readonly onResume: (reason: ResumeReason) => void
  private readonly config: AntiCheatingConfig

  constructor(
    onSignal: (type: SignalType) => void,
    onResume: (reason: ResumeReason) => void,
    config: AntiCheatingConfig,
    surfaces: EventSurfaces = {},
  ) {
    this.onSignal = onSignal
    this.onResume = onResume
    this.config = config
    this.documentTarget = surfaces.documentTarget ?? (typeof document === 'undefined' ? undefined : document)
    this.windowTarget = surfaces.windowTarget ?? (typeof window === 'undefined' ? undefined : window)
  }

  private readonly onPointerLeave = (event: MouseEvent) => {
    if (event.relatedTarget != null) return
    // 위·아래 가장자리로 나가는 것은 이탈로 세지 않는다 (전체 화면의 ESC 안내 버튼은 위쪽, 화면 공유 안내 막대는 위·아래쪽에 있다).
    // 창을 벗어나는 것은 창 이탈(WINDOW_BLUR)이 따로 감지한다. 좌표가 없는 이벤트는 좌우로 본다
    const y = event.clientY
    if (typeof y === 'number') {
      const bottom = this.windowTarget?.innerHeight
      if (y <= 0 || (typeof bottom === 'number' && y >= bottom)) return
    }
    this.emit('MOUSE_LEAVE')
  }
  private readonly onPointerEnter = () => this.onResume('pointer-return')
  private readonly onBlur = () => this.emit('WINDOW_BLUR')
  private readonly onFocus = () => this.onResume('window-focus')
  private readonly onVisibilityChange = () => {
    if (this.documentTarget?.visibilityState === 'hidden') this.emit('TAB_HIDDEN')
    else this.onResume('tab-visible')
  }
  private readonly onFullscreenChange = () => {
    const isFullscreen = Boolean(this.documentTarget?.fullscreenElement)
    if (isFullscreen) {
      this.wasFullscreen = true
      lockKeys()
      this.onResume('fullscreen-enter')
    } else if (this.wasFullscreen) {
      this.wasFullscreen = false
      unlockKeys()
      this.emit('FULLSCREEN_EXIT')
    }
  }
  private readonly onUserActivity = () => this.onResume('user-activity')
  /** 창 전환·탭 조작과 비슷한 키. 브라우저가 막게 해 보고(OS 단축키는 못 막을 수 있다), 막든 못 막든 기록한다 */
  private readonly onShortcutKey = (event: KeyboardEvent) => {
    if (!isWindowSwitchKey(event)) return
    event.preventDefault()
    this.emit('KEY_SHORTCUT')
  }

  start() {
    if (this.started || !this.config.enabled || !this.documentTarget || !this.windowTarget) return
    this.started = true
    this.wasFullscreen = Boolean(this.documentTarget.fullscreenElement)
    this.documentTarget.documentElement.addEventListener('mouseleave', this.onPointerLeave)
    this.documentTarget.documentElement.addEventListener('mouseenter', this.onPointerEnter)
    this.documentTarget.addEventListener('visibilitychange', this.onVisibilityChange)
    this.documentTarget.addEventListener('fullscreenchange', this.onFullscreenChange)
    this.documentTarget.addEventListener('keydown', this.onUserActivity)
    // 위 활동 감지 뒤에 등록해, 같은 키 입력에서 활동 감지가 먼저 돌고 단축키 신호가 그 뒤에 남게 한다
    this.documentTarget.addEventListener('keydown', this.onShortcutKey, true)
    lockKeys()
    this.documentTarget.addEventListener('pointerdown', this.onUserActivity)
    this.windowTarget.addEventListener('blur', this.onBlur)
    this.windowTarget.addEventListener('focus', this.onFocus)
  }

  stop() {
    if (!this.started || !this.documentTarget || !this.windowTarget) return
    this.started = false
    this.documentTarget.documentElement.removeEventListener('mouseleave', this.onPointerLeave)
    this.documentTarget.documentElement.removeEventListener('mouseenter', this.onPointerEnter)
    this.documentTarget.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.documentTarget.removeEventListener('fullscreenchange', this.onFullscreenChange)
    this.documentTarget.removeEventListener('keydown', this.onUserActivity)
    this.documentTarget.removeEventListener('keydown', this.onShortcutKey, true)
    unlockKeys()
    this.documentTarget.removeEventListener('pointerdown', this.onUserActivity)
    this.windowTarget.removeEventListener('blur', this.onBlur)
    this.windowTarget.removeEventListener('focus', this.onFocus)
  }

  private emit(type: SignalType) {
    if (this.config.signals[type]) this.onSignal(type)
  }
}
