// 화면 확인(Playwright). 새 브라우저를 받지 않고 PC에 설치된 크롬을 쓴다 (npx playwright install 하지 않는다).
// 가짜 API 는 e2e/mock.ts 에서 테스트 안에서만 넣는다. 실행: npm run e2e / npm run shots
import { defineConfig } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 5179)
// E2E_PREVIEW=1 이면 개발 서버 대신 빌드한 묶음을 띄운다(모듈 수백 개를 따로 받지 않아 3배쯤 빠르다).
// Windows 에서 네트워크 상태가 바뀌면(와이파이·VPN·가상 어댑터) 크롬이 진행 중인 localhost 요청을 net::ERR_NETWORK_CHANGED 로 끊어
// 화면이 비거나 page.goto 가 실패하는데, 요청 수가 적을수록 덜 걸린다. 코드 문제가 아니라 환경 문제라 retries 로 덮지 않았다.
// 개발 서버 전용 기능(휴대폰 릴레이 플러그인)은 빠지므로 live-proctor·phone-frames 류는 기본(개발 서버)으로 돌린다.
const PREVIEW = process.env.E2E_PREVIEW === '1'

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'chrome',
    headless: true,
  },
  projects: [
    { name: 'desktop-1440', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'desktop-1280', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: PREVIEW
      ? `npx vite build --outDir .e2e-dist --emptyOutDir && npx vite preview --outDir .e2e-dist --port ${PORT} --strictPort`
      : `npm run dev:local -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
