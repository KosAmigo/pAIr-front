export const SIGNAL_TYPES = ['MOUSE_LEAVE', 'WINDOW_BLUR', 'TAB_HIDDEN', 'FULLSCREEN_EXIT'] as const

export type SignalType = (typeof SIGNAL_TYPES)[number]
export type ResumeReason = 'pointer-return' | 'window-focus' | 'tab-visible' | 'fullscreen-enter' | 'user-activity'
export type AntiCheatingConfig = {
  enabled: boolean
  signals: Readonly<Record<SignalType, boolean>>
}

export const DEFAULT_ANTI_CHEATING_CONFIG: AntiCheatingConfig = {
  enabled: true,
  signals: { MOUSE_LEAVE: true, WINDOW_BLUR: true, TAB_HIDDEN: true, FULLSCREEN_EXIT: true },
}

export type BrowserSignal = { signalId: string; type: SignalType; occurredAt: string }
export type Violation = { violationId: string; sessionId: string; occurredAt: string; signals: BrowserSignal[] }
export type SessionSummary = {
  sessionId: string
  startedAt: string
  endedAt: string | null
  violationCount: number
  active: boolean
}
export type EventHistory = { events: BrowserSignal[]; violationIds: string[] }
