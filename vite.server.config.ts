import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: 'dist-server',
    ssr: 'server/index.ts',
    target: 'node20',
  },
})
