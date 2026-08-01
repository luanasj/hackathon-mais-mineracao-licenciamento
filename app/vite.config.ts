import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base relativa: o bundle precisa abrir a partir de qualquer diretório, inclusive offline
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // maplibre-gl carrega seu worker via `new URL(...)`; o pré-bundling do Vite
  // reescreve esse caminho e quebra o worker (404 em .vite/deps). Excluir do
  // pré-bundling resolve — ver https://github.com/maplibre/maplibre-gl-js/issues/3204
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
})
