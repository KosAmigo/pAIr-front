import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { proctorRelay } from './server/proctorRelay.ts'

// npm run dev           : 기본. 같은 와이파이의 휴대폰 보조 캠·팀원 접속까지 (자체 서명 HTTPS. 휴대폰 카메라는 HTTPS 에서만 열린다)
// npm run dev:local     : 이 PC 만 (http://localhost:5173)
// PAIR_RELAY=backend npm run dev : 개발용 릴레이(Vite 플러그인) 대신 백엔드(Spring) 릴레이 /ws/proctor 를 쓴다.
//   감독관 실시간 보기·휴대폰 프레임 중계의 운영 구현을 개발 PC 두 대로 확인할 때 켠다. 백엔드(8180)가 떠 있어야 한다.
export default defineConfig(({ mode }) => {
  const lan = mode === 'lan'
  const backendRelay = process.env.PAIR_RELAY === 'backend'
  return {
    // 휴대폰 보조 캠 릴레이 (개발용, pAIr-docs/API/실전시험_감독_API.md §2). 운영은 백엔드가 제공한다
    plugins: [react(), tailwindcss(), ...(lan ? [basicSsl()] : []), ...(backendRelay ? [] : [proctorRelay()])],
    server: {
      host: lan ? true : undefined,
      // 휴대폰 LTE 테스트용 임시 터널 주소 (Vite 는 모르는 호스트 요청을 막는다)
      allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok-free.dev', '.loca.lt'],
      // 백엔드(Spring Boot, pAIr-back)로 API 요청을 넘긴다
      proxy: {
        '/api': 'http://localhost:8180',
        // 백엔드 릴레이를 쓸 때만: 브라우저는 이 개발 서버(https)로 붙고, 서버가 백엔드(ws)로 이어 준다 (https 페이지는 ws:// 로 직접 못 붙는다)
        ...(backendRelay ? { '/ws/proctor': { target: 'ws://localhost:8180', ws: true } } : {}),
      },
    },
  }
})
