import { useState } from 'react'

// ── 패널 폭 ─────────────────────────────
// 과제·파일 / 문항 / AI 채팅 폭(px). 사용자가 바꾼 값은 이 브라우저에 남긴다.
export const WIDTHS_KEY = 'exam-panel-widths'
export const DEFAULT_WIDTHS = { side: 280, questions: 360, chat: 380 }
export const MIN_WIDTHS = { side: 220, questions: 280, chat: 300 }
export const RAIL_WIDTH = 48
export const CENTER_MIN = 360

export function usePanelWidths() {
  const [widths, setWidths] = useState<typeof DEFAULT_WIDTHS>(() => {
    try {
      return { ...DEFAULT_WIDTHS, ...JSON.parse(localStorage.getItem(WIDTHS_KEY) ?? '{}') }
    } catch {
      return DEFAULT_WIDTHS
    }
  })
  const setWidth = (key: keyof typeof DEFAULT_WIDTHS, width: number) => {
    const next = { ...widths, [key]: width }
    setWidths(next)
    try {
      localStorage.setItem(WIDTHS_KEY, JSON.stringify(next))
    } catch {
      // 저장이 막힌 브라우저에서는 이번 화면에서만 유지한다
    }
  }
  return [widths, setWidth] as const
}

// 가운데 칸의 최소 폭을 남기고 이 패널이 가질 수 있는 최대 폭
export const maxPanelWidth = (panel: HTMLElement) => {
  const grid = panel.parentElement!
  const center = grid.querySelector<HTMLElement>(':scope > [data-tour="editor"]')!
  return panel.getBoundingClientRect().width + center.getBoundingClientRect().width - CENTER_MIN
}
