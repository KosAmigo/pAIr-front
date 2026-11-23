/**
 * 휴대폰 보조 캠 사용 여부.
 * 영상(WebRTC·TURN) 대신 JPEG 프레임을 서버 중계로 응시자 PC 에 보내는 방식으로 다시 켠다 (2026-11-23 확정).
 * 분석은 응시자 PC 의 별도 Worker 에서 하고, 서버는 프레임을 그대로 넘기기만 한다.
 */
export const PHONE_CAM_ENABLED = true

/**
 * PC 화면 공유 사용 여부.
 * 지금은 웹캠(MediaPipe 몸·고개 분석)과 브라우저 이벤트(탭·창·마우스 이탈), 이벤트 스냅샷만으로 감독한다.
 * false 면 화면 공유 요청·안내를 보여 주지 않고 입장·시험 중 연결 조건에서도 뺀다. 나중에 쓰려면 true 로 바꾼다.
 */
export const SCREEN_SHARE_ENABLED = true

/**
 * PC 웹캠 분석을 Web Worker 에서 돌릴지 (메인 스레드가 안 막혀 저사양 PC 에서도 시험 화면이 덜 끊긴다).
 * Worker 가 안 되는 환경은 자동으로 메인 스레드 분석으로 넘어간다. 주소 끝에 &vision=main 을 붙이면 메인으로 고정한다.
 */
export const VISION_WORKER_ENABLED = true
