import type { Plugin } from 'vite'
import { createAiChatHandler } from './handler.ts'
import { createRequestRegistry } from './requestRegistry.ts'

export function aiChatVitePlugin(): Plugin {
  return {
    name: 'wgslpg-ai-chat',
    apply: 'serve',
    configureServer(server) {
      const registry = createRequestRegistry()
      const handler = createAiChatHandler({ registry })

      server.middlewares.use('/api/ai-chat', (request, response, next) => {
        void handler(request, response, next)
      })
    },
  }
}
