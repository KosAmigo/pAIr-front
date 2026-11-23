// 화면 확인(Playwright). 새 브라우저를 받지 않고 PC에 설치된 크롬을 쓴다 (npx playwright install 하지 않는다).
// 가짜 API 는 e2e/mock.ts 에서 테스트 안에서만 넣는다. 실행: npm run e2e / npm run shots
import { defineConfig } from '@playwright/test'

const PORT = 5179

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
    command: `npm run dev:local -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
