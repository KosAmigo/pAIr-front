import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { relayPlugin } from './server/relay'

// 폰 브라우저는 HTTPS가 아니면 카메라를 열 수 없으므로 기본은 자체 서명 인증서로 띄운다.
// `vite --mode http`는 PC 단독 확인용 (localhost는 HTTP여도 카메라 허용).
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'http' ? [] : [basicSsl()]), relayPlugin()],
  server: { host: true, port: 5174, strictPort: true },
  preview: { host: true, port: 5174, strictPort: true },
}))
