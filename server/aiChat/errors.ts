import type { ServerResponse } from 'node:http'
import type { AiChatErrorCode, AiChatErrorResponse } from '../../src/aiChat/types.ts'

export class AiChatServerError extends Error {
  readonly code: AiChatErrorCode

  constructor(code: AiChatErrorCode, message = getDefaultErrorMessage(code)) {
    super(message)
    this.name = 'AiChatServerError'
    this.code = code
  }
}

export class InvalidAiResponseError extends AiChatServerError {
  constructor(message = getDefaultErrorMessage('INVALID_AI_RESPONSE')) {
    super('INVALID_AI_RESPONSE', message)
    this.name = 'InvalidAiResponseError'
  }
}

export const InvalidCodexResponseError = InvalidAiResponseError
export type InvalidCodexResponseError = InvalidAiResponseError

export const AI_CHAT_ERROR_STATUS: Record<AiChatErrorCode, number> = {
  INVALID_REQUEST: 400,
  NOT_FOUND: 404,
  TIMEOUT: 408,
  CANCELED: 499,
  CODEX_NOT_FOUND: 500,
  CLAUDE_NOT_FOUND: 500,
  AI_AGENT_FAILED: 500,
  INVALID_AI_RESPONSE: 500,
  CODEX_FAILED: 500,
  INVALID_CODEX_RESPONSE: 500,
  INTERNAL_ERROR: 500,
}

export function getDefaultErrorMessage(code: AiChatErrorCode): string {
  switch (code) {
    case 'INVALID_REQUEST':
      return 'Invalid request.'
    case 'NOT_FOUND':
      return 'Not found.'
    case 'TIMEOUT':
      return 'AI chat request timed out.'
    case 'CANCELED':
      return 'Request canceled.'
    case 'CODEX_NOT_FOUND':
      return 'Codex CLI is not installed or not found in PATH.'
    case 'CLAUDE_NOT_FOUND':
      return 'Claude CLI is not installed or not found in PATH.'
    case 'AI_AGENT_FAILED':
      return 'AI chat request failed.'
    case 'INVALID_AI_RESPONSE':
      return 'AI returned an invalid response.'
    case 'CODEX_FAILED':
      return 'AI chat request failed.'
    case 'INVALID_CODEX_RESPONSE':
      return 'AI returned an invalid response.'
    case 'INTERNAL_ERROR':
      return 'Internal server error.'
  }
}

export function getHttpStatusForErrorCode(code: AiChatErrorCode): number {
  return AI_CHAT_ERROR_STATUS[code]
}

export function createAiChatErrorResponse(
  code: AiChatErrorCode,
  message = getDefaultErrorMessage(code),
): AiChatErrorResponse {
  return {
    error: {
      code,
      message,
    },
  }
}

export function writeAiChatErrorResponse(
  response: ServerResponse,
  code: AiChatErrorCode,
  message = getDefaultErrorMessage(code),
): void {
  const body = JSON.stringify(createAiChatErrorResponse(code, message))

  response.statusCode = getHttpStatusForErrorCode(code)
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(body)
}
