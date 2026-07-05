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

export type AiChatAgent = 'codex' | 'claude'

export type AiChatCodexModel = 'codex-default' | 'codex-fast' | 'codex-deep'

export type AiChatClaudeModel = 'claude-default' | 'claude-fast' | 'claude-deep'

export type AiChatModel = AiChatCodexModel | AiChatClaudeModel

export type AiChatPerformance = 'fast' | 'balanced' | 'deep'

export type AiChatSelection = {
  agent: AiChatAgent
  model: AiChatModel
  performance: AiChatPerformance
}

export type AiChatMessageRequest = {
  requestId: string
  message: string
  code: string
  history: ChatHistoryItem[]
  agent?: AiChatAgent
  model?: AiChatModel
  performance?: AiChatPerformance
}

export type NormalizedAiChatMessageRequest =
  Omit<AiChatMessageRequest, 'agent' | 'model' | 'performance'> & AiChatSelection

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
  | 'CLAUDE_NOT_FOUND'
  | 'AI_AGENT_FAILED'
  | 'INVALID_AI_RESPONSE'
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
  'CLAUDE_NOT_FOUND',
  'AI_AGENT_FAILED',
  'INVALID_AI_RESPONSE',
  'CODEX_FAILED',
  'INVALID_CODEX_RESPONSE',
  'INTERNAL_ERROR',
]

export const AI_CHAT_AGENT_OPTIONS = [
  { id: 'codex', label: 'Codex CLI' },
  { id: 'claude', label: 'Claude CLI' },
] as const satisfies readonly { id: AiChatAgent; label: string }[]

export const AI_CHAT_MODEL_OPTIONS_BY_AGENT = {
  codex: [
    { id: 'codex-default', label: 'Default' },
    { id: 'codex-fast', label: 'Fast' },
    { id: 'codex-deep', label: 'Deep' },
  ],
  claude: [
    { id: 'claude-default', label: 'Default' },
    { id: 'claude-fast', label: 'Fast' },
    { id: 'claude-deep', label: 'Deep' },
  ],
} as const satisfies {
  readonly codex: readonly { id: AiChatCodexModel; label: string }[]
  readonly claude: readonly { id: AiChatClaudeModel; label: string }[]
}

export const AI_CHAT_PERFORMANCE_OPTIONS = [
  { id: 'fast', label: 'Fast' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'deep', label: 'Deep' },
] as const satisfies readonly { id: AiChatPerformance; label: string }[]

export const AI_CHAT_DEFAULT_AGENT = 'codex' satisfies AiChatAgent

export const AI_CHAT_DEFAULT_MODEL_BY_AGENT = {
  codex: 'codex-default',
  claude: 'claude-default',
} as const satisfies {
  readonly codex: AiChatCodexModel
  readonly claude: AiChatClaudeModel
}

export const AI_CHAT_DEFAULT_PERFORMANCE = 'balanced' satisfies AiChatPerformance

export function isAiChatErrorCode(value: unknown): value is AiChatErrorCode {
  return typeof value === 'string' && aiChatErrorCodes.includes(value as AiChatErrorCode)
}

export function isAiChatAgent(value: unknown): value is AiChatAgent {
  return (
    typeof value === 'string' &&
    AI_CHAT_AGENT_OPTIONS.some((option) => option.id === value)
  )
}

export function isAiChatModel(value: unknown): value is AiChatModel {
  return (
    typeof value === 'string' &&
    (AI_CHAT_MODEL_OPTIONS_BY_AGENT.codex.some((option) => option.id === value) ||
      AI_CHAT_MODEL_OPTIONS_BY_AGENT.claude.some((option) => option.id === value))
  )
}

export function isAiChatPerformance(value: unknown): value is AiChatPerformance {
  return (
    typeof value === 'string' &&
    AI_CHAT_PERFORMANCE_OPTIONS.some((option) => option.id === value)
  )
}

export function isAiChatModelForAgent(
  agent: AiChatAgent,
  model: AiChatModel,
): boolean {
  return AI_CHAT_MODEL_OPTIONS_BY_AGENT[agent].some((option) => option.id === model)
}

export function normalizeAiChatMessageRequest(
  request: AiChatMessageRequest,
): NormalizedAiChatMessageRequest {
  const agent = request.agent ?? AI_CHAT_DEFAULT_AGENT

  if (!isAiChatAgent(agent)) {
    throw new Error('Unsupported AI chat agent.')
  }

  const model = request.model ?? AI_CHAT_DEFAULT_MODEL_BY_AGENT[agent]

  if (!isAiChatModel(model)) {
    throw new Error('Unsupported AI chat model.')
  }

  if (!isAiChatModelForAgent(agent, model)) {
    throw new Error('AI chat model is not available for the selected agent.')
  }

  const performance = request.performance ?? AI_CHAT_DEFAULT_PERFORMANCE

  if (!isAiChatPerformance(performance)) {
    throw new Error('Unsupported AI chat performance.')
  }

  return {
    ...request,
    agent,
    model,
    performance,
  }
}
