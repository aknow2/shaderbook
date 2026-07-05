import { describe, expect, it } from 'vitest'
import {
  AI_CHAT_CLIENT_TIMEOUT_MS,
  AI_CHAT_CODE_MAX_LENGTH,
  AI_CHAT_HISTORY_MAX_ITEMS,
  AI_CHAT_MESSAGE_MAX_LENGTH,
  AI_CHAT_REQUEST_ID_MAX_LENGTH,
  AI_CHAT_SERVER_TIMEOUT_MS,
} from './types'
import type { AiChatErrorCode } from './types'

describe('AI chat shared contract constants', () => {
  it('AI_CHAT_MESSAGE_MAX_LENGTH is 4000', () => {
    expect(AI_CHAT_MESSAGE_MAX_LENGTH).toBe(4000)
  })

  it('AI_CHAT_CODE_MAX_LENGTH is 200000', () => {
    expect(AI_CHAT_CODE_MAX_LENGTH).toBe(200000)
  })

  it('AI_CHAT_HISTORY_MAX_ITEMS is 20', () => {
    expect(AI_CHAT_HISTORY_MAX_ITEMS).toBe(20)
  })

  it('AI_CHAT_REQUEST_ID_MAX_LENGTH is 128', () => {
    expect(AI_CHAT_REQUEST_ID_MAX_LENGTH).toBe(128)
  })

  it('AI_CHAT_SERVER_TIMEOUT_MS is 120000', () => {
    expect(AI_CHAT_SERVER_TIMEOUT_MS).toBe(120000)
  })

  it('AI_CHAT_CLIENT_TIMEOUT_MS is 130000', () => {
    expect(AI_CHAT_CLIENT_TIMEOUT_MS).toBe(130000)
  })

  it('AiChatErrorCode can represent the specified error code union', () => {
    const errorCodes = [
      'INVALID_REQUEST',
      'NOT_FOUND',
      'TIMEOUT',
      'CANCELED',
      'CODEX_NOT_FOUND',
      'CODEX_FAILED',
      'INVALID_CODEX_RESPONSE',
      'INTERNAL_ERROR',
    ] satisfies AiChatErrorCode[]

    expect(errorCodes).toEqual([
      'INVALID_REQUEST',
      'NOT_FOUND',
      'TIMEOUT',
      'CANCELED',
      'CODEX_NOT_FOUND',
      'CODEX_FAILED',
      'INVALID_CODEX_RESPONSE',
      'INTERNAL_ERROR',
    ])
  })
})
