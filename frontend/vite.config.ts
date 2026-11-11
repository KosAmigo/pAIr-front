import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 백엔드(Spring Boot, backend/)로 API 요청을 넘긴다
    proxy: {
      '/api': 'http://localhost:8180',
    },
  },
})
