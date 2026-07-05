import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AI_CHAT_CLIENT_TIMEOUT_MS,
  AI_CHAT_CODE_MAX_LENGTH,
  AI_CHAT_HISTORY_MAX_ITEMS,
  AI_CHAT_MESSAGE_MAX_LENGTH,
  AI_CHAT_REQUEST_ID_MAX_LENGTH,
  AI_CHAT_SERVER_TIMEOUT_MS,
} from './types'
import type { AiChatErrorCode } from './types'
import {
  createAiChatId,
  createChatHistory,
  validateAiChatDraft,
  validateAiChatMessageText,
} from './state'
import type { ChatMessage } from './state'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

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

describe('AI chat state helpers', () => {
  it('rejects an empty message', () => {
    expect(validateAiChatMessageText('')).toEqual({
      canSend: false,
      errorMessage: 'Message is empty.',
    })
  })

  it('rejects a whitespace-only message', () => {
    expect(validateAiChatMessageText('   \n\t')).toEqual({
      canSend: false,
      errorMessage: 'Message is empty.',
    })
  })

  it('accepts a 4000 character message', () => {
    expect(validateAiChatMessageText('a'.repeat(4000))).toEqual({
      canSend: true,
      errorMessage: null,
    })
  })

  it('rejects a 4001 character message', () => {
    expect(validateAiChatMessageText('a'.repeat(4001))).toEqual({
      canSend: false,
      errorMessage: 'Message is too long.',
    })
  })

  it('returns WGSL empty error for empty code', () => {
    expect(validateAiChatDraft({ message: 'Fix this', code: '' })).toEqual({
      canSend: false,
      errorMessage: 'WGSL code is empty.',
    })
  })

  it('accepts 200000 character code', () => {
    expect(validateAiChatDraft({ message: 'Fix this', code: 'a'.repeat(200000) })).toEqual({
      canSend: true,
      errorMessage: null,
    })
  })

  it('returns WGSL too large error for 200001 character code', () => {
    expect(validateAiChatDraft({ message: 'Fix this', code: 'a'.repeat(200001) })).toEqual({
      canSend: false,
      errorMessage: 'WGSL code is too large.',
    })
  })

  it('excludes error messages from API history', () => {
    expect(createChatHistory([chatMessage('error', 'Network failed')])).toEqual([])
  })

  it('keeps only the latest 20 history items', () => {
    const messages = Array.from({ length: 21 }, (_, index) =>
      chatMessage('user', `message-${index}`),
    )

    expect(createChatHistory(messages).map((message) => message.content)).toEqual(
      Array.from({ length: 20 }, (_, index) => `message-${index + 1}`),
    )
  })

  it('includes assistant proposedCode in history', () => {
    expect(
      createChatHistory([
        chatMessage('assistant', 'Use this shader', {
          proposedCode: '@fragment fn main() -> @location(0) vec4f { return vec4f(1); }',
        }),
      ]),
    ).toEqual([
      {
        role: 'assistant',
        content: 'Use this shader',
        proposedCode: '@fragment fn main() -> @location(0) vec4f { return vec4f(1); }',
      },
    ])
  })

  it('excludes assistant notes from history', () => {
    const [historyItem] = createChatHistory([
      chatMessage('assistant', 'Use this shader', {
        notes: ['note 1', 'note 2'],
        proposedCode: 'code',
      }),
    ])

    expect(historyItem).not.toHaveProperty('notes')
  })

  it('excludes assistant applied state from history', () => {
    const [historyItem] = createChatHistory([
      chatMessage('assistant', 'Use this shader', {
        applied: true,
        proposedCode: 'code',
      }),
    ])

    expect(historyItem).not.toHaveProperty('applied')
  })

  it('generates request id with crypto.randomUUID()', () => {
    const randomUUID = vi.fn(() => 'request-id')
    vi.stubGlobal('crypto', { randomUUID })

    expect(createAiChatId()).toBe('request-id')
    expect(randomUUID).toHaveBeenCalledOnce()
  })

  it('generates a fallback id when crypto.randomUUID() is unavailable', () => {
    vi.stubGlobal('crypto', {})

    expect(createAiChatId()).toEqual(expect.any(String))
    expect(createAiChatId()).not.toBe('')
  })
})

function chatMessage(
  role: ChatMessage['role'],
  content: string,
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: `${role}-${content}`,
    role,
    content,
    proposedCode: null,
    notes: [],
    applied: false,
    createdAt: 0,
    ...overrides,
  }
}
