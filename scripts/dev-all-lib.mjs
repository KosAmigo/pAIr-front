// dev-all.mjs 가 쓰는 순수 함수 모음 (테스트하기 쉽게 따로 둔다).

export const FRONT_PORT = 5173
export const BACK_PORT = 8180

const TUNNEL_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/g

/** cloudflared 로그에서 터널 주소를 꺼낸다. 로그에는 api.trycloudflare.com 도 나오므로 제외한다 */
export function extractTunnelUrl(text) {
  for (const m of text.matchAll(TUNNEL_URL)) {
    if (!m[0].startsWith('https://api.')) return m[0]
  }
  return null
}

/** 공백이 있는 경로를 셸 명령에 넣을 때 따옴표로 감싼다 */
export function quote(arg) {
  return /\s/.test(arg) ? `"${arg}"` : arg
}

/** 이 OS 에서 gradle wrapper 를 부르는 명령 */
export function gradleCommand(platform) {
  const wrapper = platform === 'win32' ? 'backend\\gradlew.bat' : './backend/gradlew'
  return `${wrapper} -p backend bootRun --console=plain`
}

/** cloudflared 가 없을 때 안내할 설치 방법 */
export function cloudflaredInstallHint(platform) {
  if (platform === 'win32') return 'winget install Cloudflare.cloudflared (설치 뒤 터미널을 새로 여세요)'
  if (platform === 'darwin') return 'brew install cloudflared'
  return 'https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/'
}

/**
 * 띄울 프로세스 목록. 순서대로 시작한다 (터널을 먼저 열어야 그 주소를 백엔드·프론트에 넘길 수 있다).
 *  - 터널이 있으면 프론트는 빌드본(preview)을 쓴다: 개발 서버는 연결이 잠깐 끊기면 휴대폰 페이지를 통째로 새로고침한다.
 *  - 터널 주소는 백엔드(초대 메일 링크)와 프론트(휴대폰 QR 주소)에 환경변수로 넘긴다.
 */
export function planServices({ platform, frontDir, backDir, tunnelUrl, javaTmp, frontPort = FRONT_PORT }) {
  const services = []

  const backEnv = {}
  if (javaTmp) backEnv.JAVA_TOOL_OPTIONS = `-Djdk.net.unixdomain.tmpdir=${javaTmp}`
  if (tunnelUrl) backEnv.PAIR_ENTRY_BASE_URL = tunnelUrl
  services.push({ name: '백엔드', port: BACK_PORT, readyPath: '/api/time', cwd: backDir, command: gradleCommand(platform), env: backEnv })

  const frontEnv = tunnelUrl ? { PAIR_PUBLIC_ORIGIN: tunnelUrl } : {}
  const frontCommand = tunnelUrl
    ? `npm run build && npm run preview -- --port ${frontPort} --strictPort`
    : `npm run dev:local -- --port ${frontPort} --strictPort`
  services.push({ name: '프론트', port: frontPort, readyPath: '/', cwd: frontDir, command: frontCommand, env: frontEnv })

  return services
}
