import {
  AI_CHAT_CODE_MAX_LENGTH,
  AI_CHAT_DEFAULT_MODEL_BY_AGENT,
  AI_CHAT_DEFAULT_PERFORMANCE_BY_AGENT,
  AI_CHAT_HISTORY_MAX_ITEMS,
  AI_CHAT_MESSAGE_MAX_LENGTH,
} from './types'
import type {
  AiChatAgent,
  AiChatCodexModel,
  AiChatCodexPerformance,
  AiChatClaudeModel,
  AiChatClaudePerformance,
  ChatHistoryItem,
} from './types'

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
  proposedCode: string | null
  notes: string[]
  applied: boolean
  createdAt: number
}

export type AiChatValidationResult = {
  canSend: boolean
  errorMessage: string | null
}

export type AiChatDraft = {
  message: string
  code: string
}

export type SelectedModelByAgent = {
  codex: AiChatCodexModel
  claude: AiChatClaudeModel
}

export type SelectedPerformanceByAgent = {
  codex: AiChatCodexPerformance
  claude: AiChatClaudePerformance
}

export type AiChatSelectionState = {
  selectedAgent: AiChatAgent
  selectedModelByAgent: SelectedModelByAgent
  selectedPerformanceByAgent: SelectedPerformanceByAgent
}

const VALID_RESULT: AiChatValidationResult = {
  canSend: true,
  errorMessage: null,
}

export function validateAiChatMessageText(message: string): AiChatValidationResult {
  if (message.trim().length === 0) {
    return {
      canSend: false,
      errorMessage: 'Message is empty.',
    }
  }

  if (message.length > AI_CHAT_MESSAGE_MAX_LENGTH) {
    return {
      canSend: false,
      errorMessage: 'Message is too long.',
    }
  }

  return VALID_RESULT
}

export function validateAiChatDraft(draft: AiChatDraft): AiChatValidationResult {
  const messageResult = validateAiChatMessageText(draft.message)
  if (!messageResult.canSend) {
    return messageResult
  }

  if (draft.code.length === 0) {
    return {
      canSend: false,
      errorMessage: 'WGSL code is empty.',
    }
  }

  if (draft.code.length > AI_CHAT_CODE_MAX_LENGTH) {
    return {
      canSend: false,
      errorMessage: 'WGSL code is too large.',
    }
  }

  return VALID_RESULT
}

export function createChatHistory(messages: ChatMessage[]): ChatHistoryItem[] {
  return messages
    .filter((message) => message.role !== 'error')
    .map((message): ChatHistoryItem => {
      if (message.role === 'assistant') {
        return {
          role: 'assistant',
          content: message.content,
          proposedCode: message.proposedCode,
        }
      }

      return {
        role: 'user',
        content: message.content,
      }
    })
    .slice(-AI_CHAT_HISTORY_MAX_ITEMS)
}

export function createInitialSelectedModelByAgent(): SelectedModelByAgent {
  return {
    codex: AI_CHAT_DEFAULT_MODEL_BY_AGENT.codex,
    claude: AI_CHAT_DEFAULT_MODEL_BY_AGENT.claude,
  }
}

export function createInitialSelectedPerformanceByAgent(): SelectedPerformanceByAgent {
  return {
    codex: AI_CHAT_DEFAULT_PERFORMANCE_BY_AGENT.codex,
    claude: AI_CHAT_DEFAULT_PERFORMANCE_BY_AGENT.claude,
  }
}

export function switchAiChatAgent(
  state: AiChatSelectionState,
  nextAgent: AiChatAgent,
): AiChatSelectionState {
  return {
    ...state,
    selectedAgent: nextAgent,
  }
}

export function updateSelectedAiChatModelForAgent<TAgent extends AiChatAgent>(
  selectedModelByAgent: SelectedModelByAgent,
  agent: TAgent,
  model: SelectedModelByAgent[TAgent],
): SelectedModelByAgent {
  return {
    ...selectedModelByAgent,
    [agent]: model,
  }
}

export function updateSelectedAiChatPerformanceForAgent<TAgent extends AiChatAgent>(
  selectedPerformanceByAgent: SelectedPerformanceByAgent,
  agent: TAgent,
  performance: SelectedPerformanceByAgent[TAgent],
): SelectedPerformanceByAgent {
  return {
    ...selectedPerformanceByAgent,
    [agent]: performance,
  }
}

export function createAiChatId(): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
