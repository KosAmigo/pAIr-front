/**
 * 휴대폰 보조 캠 사용 여부.
 * 영상(WebRTC·TURN) 대신 JPEG 프레임을 서버 중계로 응시자 PC 에 보내는 방식으로 다시 켠다 (2026-11-23 확정).
 * 분석은 응시자 PC 의 별도 Worker 에서 하고, 서버는 프레임을 그대로 넘기기만 한다.
 * 2026-11-24 결정: 사용 안 함이 기본이다(꺼짐). 켜려면 개발 서버를 `VITE_PHONE_CAM_ENABLED=true` 로 띄운다
 * (휴대폰 캠이 입장·시험 중 연결 조건과 환경 점검 항목에서 빠진다).
 */
export const PHONE_CAM_ENABLED = (import.meta.env?.VITE_PHONE_CAM_ENABLED as string | undefined) === 'true'

/**
 * PC 화면 공유 사용 여부. 2026-11-24 결정: 사용 안 함(꺼짐).
 * 지금은 웹캠(MediaPipe 몸·고개 분석)과 브라우저 이벤트(탭·창·마우스 이탈), 이벤트 스냅샷만으로 감독한다.
 * false 면 화면 공유 요청·안내를 보여 주지 않고 입장·시험 중 연결 조건에서도 뺀다. 나중에 쓰려면 true 로 바꾼다.
 */
export const SCREEN_SHARE_ENABLED = false

/**
 * PC 웹캠 분석을 Web Worker 에서 돌릴지 (메인 스레드가 안 막혀 저사양 PC 에서도 시험 화면이 덜 끊긴다).
 * Worker 가 안 되는 환경은 자동으로 메인 스레드 분석으로 넘어간다. 주소 끝에 &vision=main 을 붙이면 메인으로 고정한다.
 */
export const VISION_WORKER_ENABLED = true

/**
 * 감독관 실시간 영상 보기(웹캠·화면 공유) 사용 여부. 기본은 꺼짐이다 (2026-11-24 결정).
 * 응시자가 휴대폰 핫스팟이면 영상 연결(ICE)이 실패하는 경우가 있어 TURN 없이는 쓰지 않는다. 이벤트 기록과 사진으로 감독한다.
 * 코드·서버 시그널링은 그대로 두었다. 켜려면 개발 서버를 `VITE_LIVE_VIEW_ENABLED=true` 로 띄우고 백엔드는 `PAIR_LIVE_VIEW_ENABLED=true` 로 켠다.
 */
export const LIVE_VIEW_ENABLED = (import.meta.env?.VITE_LIVE_VIEW_ENABLED as string | undefined) === 'true'

/**
 * 서버 추론 감독 스위치 (프론트). 기본은 꺼짐이다. 켜려면 `VITE_SERVER_VISION_ENABLED=true` 로 띄운다.
 * 꺼져 있으면 지금처럼 응시자 PC 가 분석하고 `/ws/proctor` 로 휴대폰 사진을 받는다 (기존 코드는 그대로 둔다).
 * 서버 모드는 이 스위치와 백엔드가 입장 정보로 알려 주는 회차별 플래그가 둘 다 켜졌을 때만 쓴다 (serverVisionActive).
 */
export const SERVER_VISION_ENABLED = (import.meta.env?.VITE_SERVER_VISION_ENABLED as string | undefined) === 'true'

/** 이 회차를 서버 추론 감독으로 진행하는지. 빌드 스위치와 회차별 플래그(입장 정보의 serverVision)가 모두 켜져야 한다 */
export function serverVisionActive(entry: { serverVision?: boolean | null } | null | undefined, buildEnabled = SERVER_VISION_ENABLED): boolean {
  return buildEnabled && entry?.serverVision === true
}
