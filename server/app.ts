import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { resolve } from 'node:path'
import express from 'express'
import type { Express } from 'express'
import { createAiChatRouter } from './aiChat/router.ts'
import type { RunAiChatAgentForHandler } from './aiChat/handler.ts'
import { createRequestRegistry } from './aiChat/requestRegistry.ts'
import type { RequestRegistry } from './aiChat/requestRegistry.ts'

export type ShaderbookServerOptions = {
  registry?: RequestRegistry
  runAiChatAgent?: RunAiChatAgentForHandler
  staticDirectory?: string
}

export type ShaderbookServer = {
  app: Express
  httpServer: Server
  registry: RequestRegistry
}

export function createShaderbookServer(
  options: ShaderbookServerOptions = {},
): ShaderbookServer {
  const registry = options.registry ?? createRequestRegistry()
  const app = express()

  app.disable('x-powered-by')
  app.use(
    '/api/ai-chat',
    createAiChatRouter({
      registry,
      ...(options.runAiChatAgent ? { runAiChatAgent: options.runAiChatAgent } : {}),
    }),
  )
  app.use(express.static(options.staticDirectory ?? resolve(process.cwd(), 'dist')))

  return {
    app,
    httpServer: createServer(app),
    registry,
  }
}
