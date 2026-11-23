/**
 * 휴대폰 보조 캠 사용 여부.
 * 휴대폰 연결 코드(릴레이·QR·스캔)는 구현만 해 두었고 실제 서비스에서는 동작하지 않으므로,
 * 화면에는 휴대폰 환경 설정을 보여 주지 않는다. 나중에 쓰려면 true 로 바꾼다.
 */
export const PHONE_CAM_ENABLED = false

/**
 * PC 화면 공유 사용 여부.
 * 지금은 웹캠(MediaPipe 몸·고개 분석)과 브라우저 이벤트(탭·창·마우스 이탈), 이벤트 스냅샷만으로 감독한다.
 * false 면 화면 공유 요청·안내를 보여 주지 않고 입장·시험 중 연결 조건에서도 뺀다. 나중에 쓰려면 true 로 바꾼다.
 */
export const SCREEN_SHARE_ENABLED = true
