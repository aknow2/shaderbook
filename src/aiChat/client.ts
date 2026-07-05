import {
  AI_CHAT_CLIENT_TIMEOUT_MS,
  isAiChatErrorCode,
} from './types'
import type {
  AiChatCancelRequest,
  AiChatCancelResponse,
  AiChatErrorCode,
  AiChatErrorResponse,
  AiChatMessageRequest,
  AiChatMessageResponse,
} from './types'

export class AiChatClientError extends Error {
  readonly displayMessage: string

  constructor(displayMessage: string) {
    super(displayMessage)
    this.name = 'AiChatClientError'
    this.displayMessage = displayMessage
  }
}

export async function sendAiChatMessage(
  request: AiChatMessageRequest,
  options: { timeoutMs?: number } = {},
): Promise<AiChatMessageResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? AI_CHAT_CLIENT_TIMEOUT_MS,
  )

  try {
    const response = await fetch('/api/ai-chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    })

    return await parseAiChatResponse(response, isAiChatMessageResponse)
  } catch (error) {
    throw normalizeFetchError(error)
  } finally {
    clearTimeout(timeout)
  }
}

export async function cancelAiChatRequest(
  request: AiChatCancelRequest,
): Promise<AiChatCancelResponse> {
  try {
    const response = await fetch('/api/ai-chat/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })

    return await parseAiChatResponse(response, isAiChatCancelResponse)
  } catch (error) {
    throw normalizeFetchError(error)
  }
}

async function parseAiChatResponse<T>(
  response: Response,
  isExpectedResponse: (value: unknown) => value is T,
): Promise<T> {
  let body: unknown

  try {
    body = await response.json()
  } catch {
    throw new AiChatClientError('AI chat request failed.')
  }

  if (!response.ok) {
    throw new AiChatClientError(getDisplayMessageFromErrorResponse(body))
  }

  if (!isExpectedResponse(body)) {
    throw new AiChatClientError('AI chat request failed.')
  }

  return body
}

function normalizeFetchError(error: unknown): Error {
  if (error instanceof AiChatClientError) {
    return error
  }

  return new AiChatClientError('AI chat server is not running.')
}

function getDisplayMessageFromErrorResponse(value: unknown): string {
  if (!isAiChatErrorResponse(value)) {
    return 'AI chat request failed.'
  }

  if (value.error.code === 'INVALID_REQUEST') {
    return value.error.message || 'AI chat request failed.'
  }

  return getDisplayMessageForErrorCode(value.error.code)
}

function getDisplayMessageForErrorCode(code: AiChatErrorCode): string {
  switch (code) {
    case 'CODEX_NOT_FOUND':
      return 'Codex CLI is not installed or not found in PATH.'
    case 'TIMEOUT':
      return 'Codex request timed out.'
    case 'CANCELED':
      return 'Request canceled.'
    case 'INVALID_CODEX_RESPONSE':
      return 'Codex returned an invalid response.'
    case 'CODEX_FAILED':
    case 'INVALID_REQUEST':
    case 'NOT_FOUND':
    case 'INTERNAL_ERROR':
      return 'AI chat request failed.'
  }
}

function isAiChatMessageResponse(value: unknown): value is AiChatMessageResponse {
  if (!isRecord(value) || typeof value.requestId !== 'string' || !isRecord(value.message)) {
    return false
  }

  return (
    value.message.role === 'assistant' &&
    typeof value.message.content === 'string' &&
    (value.message.proposedCode === null || typeof value.message.proposedCode === 'string') &&
    Array.isArray(value.message.notes) &&
    value.message.notes.every((note) => typeof note === 'string')
  )
}

function isAiChatCancelResponse(value: unknown): value is AiChatCancelResponse {
  return isRecord(value) && typeof value.requestId === 'string' && value.canceled === true
}

function isAiChatErrorResponse(value: unknown): value is AiChatErrorResponse {
  return (
    isRecord(value) &&
    isRecord(value.error) &&
    isAiChatErrorCode(value.error.code) &&
    typeof value.error.message === 'string'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
