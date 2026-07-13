import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { getShaderbookServerOrigin } from './server/config.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/ai-chat': {
        target: getShaderbookServerOrigin(),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
