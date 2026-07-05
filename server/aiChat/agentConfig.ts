import type {
  AiChatAgent,
  AiChatModel,
  AiChatPerformance,
} from '../../src/aiChat/types.ts'
import { AiChatServerError } from './errors.ts'

export const CODEX_MODEL_CLI_VALUES = {
  'codex-fast': 'gpt-5-mini',
  'codex-deep': 'gpt-5',
} as const

export const CLAUDE_MODEL_CLI_VALUES = {
  'claude-fast': 'claude-sonnet',
  'claude-deep': 'claude-opus',
} as const

export const CODEX_PERFORMANCE_CLI_VALUES = {
  fast: 'model_reasoning_effort="low"',
  deep: 'model_reasoning_effort="high"',
} as const

export const CLAUDE_PERFORMANCE_CLI_VALUES = {
  fast: 'low',
  deep: 'high',
} as const

type AgentCliConfig = {
  command: string
  baseArgs: readonly string[]
  modelArgs: Partial<Record<AiChatModel, readonly string[]>>
  performanceArgs: Record<AiChatPerformance, readonly string[]>
}

export const AI_CHAT_AGENT_CLI_CONFIG = {
  codex: {
    command: 'codex',
    baseArgs: [
      'exec',
      '--sandbox',
      'read-only',
      '--skip-git-repo-check',
      '--output-last-message',
    ],
    modelArgs: {
      'codex-default': [],
      'codex-fast': ['--model', CODEX_MODEL_CLI_VALUES['codex-fast']],
      'codex-deep': ['--model', CODEX_MODEL_CLI_VALUES['codex-deep']],
    },
    performanceArgs: {
      fast: ['--config', CODEX_PERFORMANCE_CLI_VALUES.fast],
      balanced: [],
      deep: ['--config', CODEX_PERFORMANCE_CLI_VALUES.deep],
    },
  },
  claude: {
    command: 'claude',
    baseArgs: [
      '--print',
      '--output-format',
      'text',
      '--no-session-persistence',
      '--safe-mode',
      '--tools',
      '',
    ],
    modelArgs: {
      'claude-default': [],
      'claude-fast': ['--model', CLAUDE_MODEL_CLI_VALUES['claude-fast']],
      'claude-deep': ['--model', CLAUDE_MODEL_CLI_VALUES['claude-deep']],
    },
    performanceArgs: {
      fast: ['--effort', CLAUDE_PERFORMANCE_CLI_VALUES.fast],
      balanced: [],
      deep: ['--effort', CLAUDE_PERFORMANCE_CLI_VALUES.deep],
    },
  },
} as const satisfies Record<AiChatAgent, AgentCliConfig>

export function getAiChatAgentCommand(agent: AiChatAgent): string {
  return getAgentConfig(agent).command
}

export function getAiChatAgentBaseArgs(agent: AiChatAgent): string[] {
  return [...getAgentConfig(agent).baseArgs]
}

export function getAiChatModelArgs(agent: AiChatAgent, model: AiChatModel): string[] {
  const args = getAgentConfig(agent).modelArgs[model]

  if (!args) {
    throw new AiChatServerError('INTERNAL_ERROR')
  }

  return [...args]
}

export function getAiChatPerformanceArgs(
  agent: AiChatAgent,
  performance: AiChatPerformance,
): string[] {
  const args = getAgentConfig(agent).performanceArgs[performance]

  if (!args) {
    throw new AiChatServerError('INTERNAL_ERROR')
  }

  return [...args]
}

function getAgentConfig(agent: AiChatAgent): AgentCliConfig {
  const config = AI_CHAT_AGENT_CLI_CONFIG[agent]

  if (!config) {
    throw new AiChatServerError('INTERNAL_ERROR')
  }

  return config
}
