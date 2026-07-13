import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import { createAiChatHandler } from './handler.ts'
import type { AiChatHandlerDependencies } from './handler.ts'

export function createAiChatRouter(dependencies: AiChatHandlerDependencies): Router {
  const router = Router()
  const handler = createAiChatHandler(dependencies)
  const handleRequest = (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, next)
  }

  router.post('/messages', handleRequest)
  router.post('/cancel', handleRequest)
  router.use(handleRequest)

  return router
}
