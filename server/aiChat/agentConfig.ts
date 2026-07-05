import type {
  AiChatAgent,
  AiChatModel,
  AiChatPerformance,
} from '../../src/aiChat/types.ts'
import { AiChatServerError } from './errors.ts'

export const CODEX_MODEL_CLI_VALUES = {
  'gpt-5.5': 'gpt-5.5',
  'gpt-5.4': 'gpt-5.4',
  'gpt-5.4-mini': 'gpt-5.4-mini',
  'gpt-5.3-codex-spark': 'gpt-5.3-codex-spark',
} as const

export const CLAUDE_MODEL_CLI_VALUES = {
  sonnet: 'sonnet',
  fable: 'fable',
  opus: 'opus',
  haiku: 'haiku',
} as const

export const CODEX_PERFORMANCE_CLI_VALUES = {
  low: 'model_reasoning_effort="low"',
  medium: 'model_reasoning_effort="medium"',
  high: 'model_reasoning_effort="high"',
  xhigh: 'model_reasoning_effort="xhigh"',
} as const

export const CLAUDE_PERFORMANCE_CLI_VALUES = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  max: 'max',
} as const

type AgentCliConfig = {
  command: string
  baseArgs: readonly string[]
  modelArgs: Partial<Record<AiChatModel, readonly string[]>>
  performanceArgs: Partial<Record<AiChatPerformance, readonly string[]>>
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
      'gpt-5.5': ['--model', CODEX_MODEL_CLI_VALUES['gpt-5.5']],
      'gpt-5.4': ['--model', CODEX_MODEL_CLI_VALUES['gpt-5.4']],
      'gpt-5.4-mini': ['--model', CODEX_MODEL_CLI_VALUES['gpt-5.4-mini']],
      'gpt-5.3-codex-spark': [
        '--model',
        CODEX_MODEL_CLI_VALUES['gpt-5.3-codex-spark'],
      ],
    },
    performanceArgs: {
      low: ['--config', CODEX_PERFORMANCE_CLI_VALUES.low],
      medium: ['--config', CODEX_PERFORMANCE_CLI_VALUES.medium],
      high: ['--config', CODEX_PERFORMANCE_CLI_VALUES.high],
      xhigh: ['--config', CODEX_PERFORMANCE_CLI_VALUES.xhigh],
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
      sonnet: ['--model', CLAUDE_MODEL_CLI_VALUES.sonnet],
      fable: ['--model', CLAUDE_MODEL_CLI_VALUES.fable],
      opus: ['--model', CLAUDE_MODEL_CLI_VALUES.opus],
      haiku: ['--model', CLAUDE_MODEL_CLI_VALUES.haiku],
    },
    performanceArgs: {
      default: [],
      low: ['--effort', CLAUDE_PERFORMANCE_CLI_VALUES.low],
      medium: ['--effort', CLAUDE_PERFORMANCE_CLI_VALUES.medium],
      high: ['--effort', CLAUDE_PERFORMANCE_CLI_VALUES.high],
      xhigh: ['--effort', CLAUDE_PERFORMANCE_CLI_VALUES.xhigh],
      max: ['--effort', CLAUDE_PERFORMANCE_CLI_VALUES.max],
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
