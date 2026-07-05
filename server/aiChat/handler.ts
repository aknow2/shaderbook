import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  AI_CHAT_CODE_MAX_LENGTH,
  AI_CHAT_HISTORY_MAX_ITEMS,
  AI_CHAT_MESSAGE_MAX_LENGTH,
  AI_CHAT_REQUEST_ID_MAX_LENGTH,
  normalizeAiChatMessageRequest,
} from '../../src/aiChat/types.ts'
import type {
  AiChatCancelRequest,
  AiChatMessageRequest,
  ChatHistoryItem,
  NormalizedAiChatMessageRequest,
} from '../../src/aiChat/types.ts'
import { AiChatServerError, writeAiChatErrorResponse } from './errors.ts'
import { readJsonBody } from './readJsonBody.ts'
import { runAiChatAgent as defaultRunAiChatAgent } from './aiAgentRunner.ts'
import type { AiChatRunnerResult } from './aiAgentRunner.ts'
import type { RequestRegistry } from './requestRegistry.ts'

export type RunAiChatAgentForHandler = (
  request: NormalizedAiChatMessageRequest,
  context: { registry: RequestRegistry },
) => Promise<AiChatRunnerResult>

export type AiChatHandlerDependencies = {
  registry: RequestRegistry
  runAiChatAgent?: RunAiChatAgentForHandler
}

export function createAiChatHandler(dependencies: AiChatHandlerDependencies) {
  const runAiChatAgent: RunAiChatAgentForHandler =
    dependencies.runAiChatAgent ??
    ((request, context) =>
      defaultRunAiChatAgent(request, {
        registry: context.registry,
      }))

  return async function handleAiChatRequest(
    request: IncomingMessage,
    response: ServerResponse,
    _next: (error?: unknown) => void,
  ): Promise<void> {
    try {
      if (request.method !== 'POST') {
        writeAiChatErrorResponse(response, 'NOT_FOUND')
        return
      }

      const path = getRequestPath(request.url)

      if (path === '/messages') {
        await handleMessages(request, response, dependencies.registry, runAiChatAgent)
        return
      }

      if (path === '/cancel') {
        await handleCancel(request, response, dependencies.registry)
        return
      }

      writeAiChatErrorResponse(response, 'NOT_FOUND')
    } catch (error) {
      if (error instanceof AiChatServerError) {
        writeAiChatErrorResponse(response, error.code, error.message)
        return
      }

      writeAiChatErrorResponse(response, 'INTERNAL_ERROR')
    }
  }
}

async function handleMessages(
  request: IncomingMessage,
  response: ServerResponse,
  registry: RequestRegistry,
  runAiChatAgent: RunAiChatAgentForHandler,
): Promise<void> {
  const body = await readJsonBody(request)

  if (!isAiChatMessageRequest(body)) {
    throw new AiChatServerError('INVALID_REQUEST')
  }

  const normalizedRequest = normalizeMessageRequest(body)
  const result = await runAiChatAgent(normalizedRequest, { registry })

  writeJson(response, 200, {
    requestId: normalizedRequest.requestId,
    message: {
      role: 'assistant',
      content: result.message,
      proposedCode: result.proposedCode,
      notes: result.notes,
    },
  })
}

function normalizeMessageRequest(
  request: AiChatMessageRequest,
): NormalizedAiChatMessageRequest {
  try {
    return normalizeAiChatMessageRequest(request)
  } catch (error) {
    if (error instanceof Error) {
      throw new AiChatServerError('INVALID_REQUEST', error.message)
    }

    throw new AiChatServerError('INVALID_REQUEST')
  }
}

async function handleCancel(
  request: IncomingMessage,
  response: ServerResponse,
  registry: RequestRegistry,
): Promise<void> {
  const body = await readJsonBody(request)

  if (!isAiChatCancelRequest(body)) {
    throw new AiChatServerError('INVALID_REQUEST')
  }

  registry.cancel(body.requestId)

  writeJson(response, 200, {
    requestId: body.requestId,
    canceled: true,
  })
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body))
}

function getRequestPath(url: string | undefined): string {
  if (!url) {
    return ''
  }

  return new URL(url, 'http://localhost').pathname
}

function isAiChatMessageRequest(value: unknown): value is AiChatMessageRequest {
  if (!isRecord(value)) {
    return false
  }

  return (
    isValidRequestId(value.requestId) &&
    typeof value.message === 'string' &&
    value.message.trim().length > 0 &&
    value.message.length <= AI_CHAT_MESSAGE_MAX_LENGTH &&
    typeof value.code === 'string' &&
    value.code.length > 0 &&
    value.code.length <= AI_CHAT_CODE_MAX_LENGTH &&
    Array.isArray(value.history) &&
    value.history.length <= AI_CHAT_HISTORY_MAX_ITEMS &&
    value.history.every(isChatHistoryItem)
  )
}

function isAiChatCancelRequest(value: unknown): value is AiChatCancelRequest {
  return isRecord(value) && isValidRequestId(value.requestId)
}

function isChatHistoryItem(value: unknown): value is ChatHistoryItem {
  if (!isRecord(value)) {
    return false
  }

  if (!(value.role === 'user' || value.role === 'assistant')) {
    return false
  }

  if (typeof value.content !== 'string') {
    return false
  }

  return (
    value.proposedCode === undefined ||
    value.proposedCode === null ||
    typeof value.proposedCode === 'string'
  )
}

function isValidRequestId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= AI_CHAT_REQUEST_ID_MAX_LENGTH
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
