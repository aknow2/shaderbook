export const AI_CHAT_MESSAGE_MAX_LENGTH = 4000
export const AI_CHAT_CODE_MAX_LENGTH = 200000
export const AI_CHAT_HISTORY_MAX_ITEMS = 20
export const AI_CHAT_REQUEST_ID_MAX_LENGTH = 128
export const AI_CHAT_SESSION_ID_MAX_LENGTH = 128
export const AI_CHAT_SERVER_TIMEOUT_MS = 300000
export const AI_CHAT_CLIENT_TIMEOUT_MS = 310000

export type ChatHistoryItem = {
  role: 'user' | 'assistant'
  content: string
  proposedCode?: string | null
}

export type AiChatAgent = 'codex' | 'claude'

export type AiChatCodexModel =
  | 'gpt-5.6-sol'
  | 'gpt-5.6-terra'
  | 'gpt-5.6-luna'
  | 'gpt-5.5'
  | 'gpt-5.4'
  | 'gpt-5.4-mini'
  | 'gpt-5.3-codex-spark'

export type AiChatClaudeModel =
  | 'claude-default'
  | 'sonnet'
  | 'fable'
  | 'opus'
  | 'haiku'

export type AiChatModel = AiChatCodexModel | AiChatClaudeModel

export type AiChatCodexPerformance =
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'
  | 'ultra'

export type AiChatClaudePerformance =
  | 'default'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'

export type AiChatPerformance = AiChatCodexPerformance | AiChatClaudePerformance

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
  sessionId?: string
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
  sessionId?: string
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
    { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
    { id: 'gpt-5.6-terra', label: 'GPT-5.6-Terra' },
    { id: 'gpt-5.6-luna', label: 'GPT-5.6-Luna' },
    { id: 'gpt-5.5', label: 'GPT-5.5' },
    { id: 'gpt-5.4', label: 'GPT-5.4' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4-Mini' },
    { id: 'gpt-5.3-codex-spark', label: 'GPT-5.3-Codex-Spark' },
  ],
  claude: [
    { id: 'claude-default', label: 'Default (recommended)' },
    { id: 'sonnet', label: 'Sonnet' },
    { id: 'fable', label: 'Fable' },
    { id: 'opus', label: 'Opus' },
    { id: 'haiku', label: 'Haiku' },
  ],
} as const satisfies {
  readonly codex: readonly { id: AiChatCodexModel; label: string }[]
  readonly claude: readonly { id: AiChatClaudeModel; label: string }[]
}

export const AI_CHAT_PERFORMANCE_OPTIONS_BY_AGENT = {
  codex: [
    { id: 'low', label: 'Low' },
    { id: 'medium', label: 'Medium' },
    { id: 'high', label: 'High' },
    { id: 'xhigh', label: 'XHigh' },
    { id: 'max', label: 'Max' },
    { id: 'ultra', label: 'Ultra' },
  ],
  claude: [
    { id: 'default', label: 'Default' },
    { id: 'low', label: 'Low' },
    { id: 'medium', label: 'Medium' },
    { id: 'high', label: 'High' },
    { id: 'xhigh', label: 'XHigh' },
    { id: 'max', label: 'Max' },
  ],
} as const satisfies {
  readonly codex: readonly { id: AiChatCodexPerformance; label: string }[]
  readonly claude: readonly { id: AiChatClaudePerformance; label: string }[]
}

export const AI_CHAT_DEFAULT_AGENT = 'codex' satisfies AiChatAgent

export const AI_CHAT_DEFAULT_MODEL_BY_AGENT = {
  codex: 'gpt-5.6-sol',
  claude: 'claude-default',
} as const satisfies {
  readonly codex: AiChatCodexModel
  readonly claude: AiChatClaudeModel
}

export const AI_CHAT_DEFAULT_PERFORMANCE_BY_AGENT = {
  codex: 'high',
  claude: 'default',
} as const satisfies {
  readonly codex: AiChatCodexPerformance
  readonly claude: AiChatClaudePerformance
}

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
    (AI_CHAT_PERFORMANCE_OPTIONS_BY_AGENT.codex.some((option) => option.id === value) ||
      AI_CHAT_PERFORMANCE_OPTIONS_BY_AGENT.claude.some((option) => option.id === value))
  )
}

export function isAiChatModelForAgent(
  agent: AiChatAgent,
  model: AiChatModel,
): boolean {
  return AI_CHAT_MODEL_OPTIONS_BY_AGENT[agent].some((option) => option.id === model)
}

export function isAiChatPerformanceForAgent(
  agent: AiChatAgent,
  performance: AiChatPerformance,
): boolean {
  return AI_CHAT_PERFORMANCE_OPTIONS_BY_AGENT[agent].some(
    (option) => option.id === performance,
  )
}

export function normalizeAiChatMessageRequest(
  request: AiChatMessageRequest,
): NormalizedAiChatMessageRequest {
  const agent = request.agent ?? AI_CHAT_DEFAULT_AGENT

  if (!isAiChatAgent(agent)) {
    throw new Error('Unsupported AI chat agent.')
  }

  if (request.sessionId && agent !== 'codex') {
    throw new Error('AI chat sessions are only available for Codex.')
  }

  const model = request.model ?? AI_CHAT_DEFAULT_MODEL_BY_AGENT[agent]

  if (!isAiChatModel(model)) {
    throw new Error('Unsupported AI chat model.')
  }

  if (!isAiChatModelForAgent(agent, model)) {
    throw new Error('AI chat model is not available for the selected agent.')
  }

  const performance = request.performance ?? AI_CHAT_DEFAULT_PERFORMANCE_BY_AGENT[agent]

  if (!isAiChatPerformance(performance)) {
    throw new Error('Unsupported AI chat performance.')
  }

  if (!isAiChatPerformanceForAgent(agent, performance)) {
    throw new Error('AI chat performance is not available for the selected agent.')
  }

  return {
    ...request,
    agent,
    model,
    performance,
  }
}
