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

export class InvalidCodexResponseError extends AiChatServerError {
  constructor(message = getDefaultErrorMessage('INVALID_CODEX_RESPONSE')) {
    super('INVALID_CODEX_RESPONSE', message)
    this.name = 'InvalidCodexResponseError'
  }
}

export const AI_CHAT_ERROR_STATUS: Record<AiChatErrorCode, number> = {
  INVALID_REQUEST: 400,
  NOT_FOUND: 404,
  TIMEOUT: 408,
  CANCELED: 499,
  CODEX_NOT_FOUND: 500,
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
      return 'Codex request timed out.'
    case 'CANCELED':
      return 'Request canceled.'
    case 'CODEX_NOT_FOUND':
      return 'Codex CLI is not installed or not found in PATH.'
    case 'CODEX_FAILED':
      return 'AI chat request failed.'
    case 'INVALID_CODEX_RESPONSE':
      return 'Codex returned an invalid response.'
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
