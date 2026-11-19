import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { proctorRelay } from './server/proctorRelay.ts'

// npm run dev           : PC 만 (http://localhost:5173)
// npm run dev:lan       : 휴대폰 보조 캠까지 (같은 와이파이, 자체 서명 HTTPS. 휴대폰 카메라는 HTTPS 에서만 열린다)
export default defineConfig(({ mode }) => {
  const lan = mode === 'lan'
  return {
    // 휴대폰 보조 캠 릴레이 (개발용, docs/api/실전시험_감독_API.md §2). 운영은 백엔드가 제공한다
    plugins: [react(), tailwindcss(), ...(lan ? [basicSsl()] : []), proctorRelay()],
    server: {
      host: lan ? true : undefined,
      // 백엔드(Spring Boot, backend/)로 API 요청을 넘긴다
      proxy: {
        '/api': 'http://localhost:8180',
      },
    },
  }
})
