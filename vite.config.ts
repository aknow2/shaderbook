import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { aiChatVitePlugin } from './server/aiChat/vitePlugin.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), aiChatVitePlugin()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
