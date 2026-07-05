export const AI_CHAT_MESSAGE_MAX_LENGTH = 4000
export const AI_CHAT_CODE_MAX_LENGTH = 200000
export const AI_CHAT_HISTORY_MAX_ITEMS = 20
export const AI_CHAT_REQUEST_ID_MAX_LENGTH = 128
export const AI_CHAT_SERVER_TIMEOUT_MS = 120000
export const AI_CHAT_CLIENT_TIMEOUT_MS = 130000

export type ChatHistoryItem = {
  role: 'user' | 'assistant'
  content: string
  proposedCode?: string | null
}

export type AiChatMessageRequest = {
  requestId: string
  message: string
  code: string
  history: ChatHistoryItem[]
}

export type AiChatAssistantMessage = {
  role: 'assistant'
  content: string
  proposedCode: string | null
  notes: string[]
}

export type AiChatMessageResponse = {
  requestId: string
  message: AiChatAssistantMessage
}

export type AiChatCancelRequest = {
  requestId: string
}

export type AiChatCancelResponse = {
  requestId: string
  canceled: true
}

export type AiChatErrorCode =
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'TIMEOUT'
  | 'CANCELED'
  | 'CODEX_NOT_FOUND'
  | 'CODEX_FAILED'
  | 'INVALID_CODEX_RESPONSE'
  | 'INTERNAL_ERROR'

export type AiChatErrorResponse = {
  error: {
    code: AiChatErrorCode
    message: string
  }
}

const aiChatErrorCodes: AiChatErrorCode[] = [
  'INVALID_REQUEST',
  'NOT_FOUND',
  'TIMEOUT',
  'CANCELED',
  'CODEX_NOT_FOUND',
  'CODEX_FAILED',
  'INVALID_CODEX_RESPONSE',
  'INTERNAL_ERROR',
]

export function isAiChatErrorCode(value: unknown): value is AiChatErrorCode {
  return typeof value === 'string' && aiChatErrorCodes.includes(value as AiChatErrorCode)
}
