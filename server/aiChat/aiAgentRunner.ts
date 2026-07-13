import type { NormalizedAiChatMessageRequest } from '../../src/aiChat/types.ts'
import { runClaude } from './claudeRunner.ts'
import { runCodex } from './codexRunner.ts'
import {
  getAiChatAgentCommand,
  getAiChatModelArgs,
  getAiChatPerformanceArgs,
} from './agentConfig.ts'
import type { RequestRegistry } from './requestRegistry.ts'

export type AiChatRunnerResult = {
  message: string
  proposedCode: string | null
  notes: string[]
  sessionId?: string
}

export type AiChatAgentRunner = (
  request: NormalizedAiChatMessageRequest,
  dependencies: AiChatRunnerDependencies,
) => Promise<AiChatRunnerResult>

export type AiChatRunnerDependencies = {
  registry: RequestRegistry
  codexRunner?: AiChatAgentRunner
  claudeRunner?: AiChatAgentRunner
}

export async function runAiChatAgent(
  request: NormalizedAiChatMessageRequest,
  dependencies: AiChatRunnerDependencies,
): Promise<AiChatRunnerResult> {
  assertAgentMappingExists(request)

  switch (request.agent) {
    case 'codex':
      return getCodexRunner(dependencies)(request, dependencies)
    case 'claude':
      return getClaudeRunner(dependencies)(request, dependencies)
  }
}

function assertAgentMappingExists(request: NormalizedAiChatMessageRequest): void {
  getAiChatAgentCommand(request.agent)
  getAiChatModelArgs(request.agent, request.model)
  getAiChatPerformanceArgs(request.agent, request.performance)
}

function getCodexRunner(dependencies: AiChatRunnerDependencies): AiChatAgentRunner {
  return (
    dependencies.codexRunner ??
    ((request, runnerDependencies) =>
      runCodex(request, {
        registry: runnerDependencies.registry,
      }))
  )
}

function getClaudeRunner(dependencies: AiChatRunnerDependencies): AiChatAgentRunner {
  return (
    dependencies.claudeRunner ??
    ((request, runnerDependencies) =>
      runClaude(request, {
        registry: runnerDependencies.registry,
      }))
  )
}
