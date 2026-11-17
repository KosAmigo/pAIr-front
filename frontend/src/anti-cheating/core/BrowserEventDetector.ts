import type { AntiCheatingConfig, ResumeReason, SignalType } from './types.ts'

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
    if (event.relatedTarget == null) this.emit('MOUSE_LEAVE')
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
      this.onResume('fullscreen-enter')
    } else if (this.wasFullscreen) {
      this.wasFullscreen = false
      this.emit('FULLSCREEN_EXIT')
    }
  }
  private readonly onUserActivity = () => this.onResume('user-activity')

  start() {
    if (this.started || !this.config.enabled || !this.documentTarget || !this.windowTarget) return
    this.started = true
    this.wasFullscreen = Boolean(this.documentTarget.fullscreenElement)
    this.documentTarget.documentElement.addEventListener('mouseleave', this.onPointerLeave)
    this.documentTarget.documentElement.addEventListener('mouseenter', this.onPointerEnter)
    this.documentTarget.addEventListener('visibilitychange', this.onVisibilityChange)
    this.documentTarget.addEventListener('fullscreenchange', this.onFullscreenChange)
    this.documentTarget.addEventListener('keydown', this.onUserActivity)
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
    this.documentTarget.removeEventListener('pointerdown', this.onUserActivity)
    this.windowTarget.removeEventListener('blur', this.onBlur)
    this.windowTarget.removeEventListener('focus', this.onFocus)
  }

  private emit(type: SignalType) {
    if (this.config.signals[type]) this.onSignal(type)
  }
}
