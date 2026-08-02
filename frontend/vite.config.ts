import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // O backend (Express + SQLite) sobe em 3001. O proxy faz o browser ver
    // tudo na mesma origem, então nada de CORS e nenhuma porta escrita no
    // código do frontend — só caminhos `/api/...`.
    //
    // `changeOrigin: false` de propósito: é localhost falando com localhost.
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL ?? 'http://localhost:3001',
        changeOrigin: false,
      },
    },
  },
})
