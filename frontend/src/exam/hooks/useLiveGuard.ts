import { useCallback, useEffect, useRef, useState } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import type { AttemptView } from '../../api'
import { useAntiCheating } from '../../anti-cheating'
import { PasteDetector } from '../../anti-cheating/core/PasteDetector.ts'
import type { Violation } from '../../anti-cheating/core/types.ts'
import { toBrowserViolation } from '../../proctor/core/events.ts'
import { proctorApi } from '../../proctor/api/proctorApi.ts'
import { camHub } from '../../proctor/camHub.ts'
import { secondsLeft, type LiveExam } from '../../proctor/liveExam.ts'
import { HEARTBEAT_MS } from '../constants'
import { endLiveProctoring } from '../endLiveProctoring'

/** 실전 감독: 브라우저 이탈·붙여넣기 기록, 전체 화면, 연결 신호, 종료 시각 자동 종료. 자가진단(live 가 null)은 감독을 켜지 않는다 */
export function useLiveGuard({
  sessionId, live, view, navigate,
}: {
  sessionId: string
  live: LiveExam | null
  view: AttemptView | null
  navigate: NavigateFunction
}) {
  const watching = Boolean(live && view && (view.attempt.status === 'SOLVING' || view.attempt.status === 'FOLLOWUP'))
  // 감독 회차면 브라우저 이탈도 회차 감독 기록(proctor_events, source=BROWSER)에 함께 남긴다
  const forwardViolation = useCallback(
    (v: Violation) => {
      const first = v.signals[0]?.type
      if (!live?.proctoring || !first) return
      // 단축키 입력은 서버에 창 이탈로 남기고, 키 입력으로 감지됐다는 표시만 붙인다
      const viaShortcut = first === 'KEY_SHORTCUT'
      const type = viaShortcut ? 'WINDOW_BLUR' : first
      camHub.recordBrowser(toBrowserViolation(type, v.occurredAt, live.serverOffsetMs, { signals: v.signals.length, ...(viaShortcut ? { via: 'shortcut' } : {}) }))
    },
    [live],
  )
  // 브라우저 이탈 감지는 감독을 켠 실전 회차에서만 쓴다 (자가진단은 쓰지 않는다). 기록은 감독 이벤트(DB)로 간다
  const antiCheating = useAntiCheating({ sessionId, active: watching && Boolean(live?.proctoring), onViolation: forwardViolation })
  // 실전 시험은 전체 화면에서만 푼다. 전체 화면이어야 Alt+Tab·Win 키를 브라우저가 붙잡을 수 있다 (Keyboard Lock)
  const [fullscreen, setFullscreen] = useState(() => typeof document !== 'undefined' && Boolean(document.fullscreenElement))
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  // 실전: 10초마다 서버에 연결 신호를 보낸다. 창이 닫히거나 끊겨 5분(유예)을 넘기면 서버가 링크를 만료시킨다
  const [linkExpired, setLinkExpired] = useState(false)
  const liveInvite = live?.invite
  useEffect(() => {
    if (!liveInvite || !watching) return
    let alive = true
    const beat = () =>
      proctorApi.heartbeat(liveInvite).then(
        (r) => alive && r.expired && setLinkExpired(true),
        () => undefined, // 신호가 안 가는 동안은 서버가 알아서 끊김으로 본다. 다음 신호에서 다시 보낸다
      )
    beat()
    const id = window.setInterval(beat, HEARTBEAT_MS)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [liveInvite, watching])
  const needFullscreen = watching && Boolean(live?.proctoring) && !fullscreen
  // 사용 안내는 위쪽 도움말(?) 버튼을 눌렀을 때만 보여 준다 (대기실에서는 문구가 돌아가며 안내한다)

  // 외부 붙여넣기: 시험 화면 안에서 복사한 글이 아닌 것을 붙이면 PASTE 이벤트 (글자 수·위치만, 내용은 보내지 않음)
  useEffect(() => {
    if (!watching || !live?.proctoring) return
    const detector = new PasteDetector((p) =>
      camHub.recordBrowser(toBrowserViolation('PASTE', p.occurredAt, live.serverOffsetMs, { chars: p.chars, lines: p.lines, target: p.target })),
    )
    detector.start()
    return () => detector.stop()
  }, [watching, live])

  // 실전: 종료 시각(서버 기준)이 지나면 서버가 자동 제출한다. 화면은 감독을 끄고 제출 완료로 간다
  // 후속 질문 단계에서는 경과 타이머가 멈추므로 실전만 1초마다 다시 그려 남은 시간을 갱신한다
  const [, setLiveTick] = useState(0)
  useEffect(() => {
    if (!live) return
    const id = window.setInterval(() => setLiveTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [live])
  const liveLeft = live ? secondsLeft(live) : null
  const liveOver = liveLeft !== null && liveLeft <= 0
  const finishAntiCheating = antiCheating.finish
  const ended = useRef(false)
  useEffect(() => {
    if (!liveOver || ended.current) return
    ended.current = true
    void finishAntiCheating()
    void endLiveProctoring().finally(() => navigate(`/exam/${sessionId}/submitted`, { replace: true }))
  }, [liveOver, sessionId, navigate, finishAntiCheating])

  return { antiCheating, linkExpired, needFullscreen, liveLeft }
}
