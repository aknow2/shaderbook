import { spawn as defaultSpawn } from 'node:child_process'
import { AI_CHAT_SERVER_TIMEOUT_MS } from '../../src/aiChat/types.ts'
import type { NormalizedAiChatMessageRequest } from '../../src/aiChat/types.ts'
import {
  getAiChatAgentBaseArgs,
  getAiChatAgentCommand,
  getAiChatModelArgs,
  getAiChatPerformanceArgs,
} from './agentConfig.ts'
import { AiChatServerError } from './errors.ts'
import { parseAiOutput } from './parseAiOutput.ts'
import type { ParsedAiOutput } from './parseAiOutput.ts'
import { buildAiChatPrompt } from './promptBuilder.ts'
import type { RequestChildProcess, RequestRegistry } from './requestRegistry.ts'

export type ClaudeRunnerResult = ParsedAiOutput

type ClaudeChildProcess = RequestChildProcess & {
  stdin: {
    write: (chunk: string) => unknown
    end: () => unknown
  }
  stdout: {
    on: (event: 'data', listener: (chunk: Buffer | string) => void) => unknown
  }
  stderr: {
    on: (event: 'data', listener: (chunk: Buffer | string) => void) => unknown
  }
  on: {
    (event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown
    (event: 'error', listener: (error: NodeJS.ErrnoException) => void): unknown
  }
}

export type ClaudeSpawn = (
  command: string,
  args: string[],
  options: {
    cwd: string
    shell: false
    stdio: ['pipe', 'pipe', 'pipe']
  },
) => ClaudeChildProcess

export type ClaudeRunnerDependencies = {
  registry: RequestRegistry
  spawn?: ClaudeSpawn
  timeoutMs?: number
}

export async function runClaude(
  input: NormalizedAiChatMessageRequest,
  dependencies: ClaudeRunnerDependencies,
): Promise<ClaudeRunnerResult> {
  const spawn = dependencies.spawn ?? (defaultSpawn as unknown as ClaudeSpawn)
  const timeoutMs = dependencies.timeoutMs ?? AI_CHAT_SERVER_TIMEOUT_MS
  let child: ClaudeChildProcess | null = null
  let timeout: ReturnType<typeof setTimeout> | null = null

  try {
    const args = buildClaudeArgs(input)
    const prompt = buildAiChatPrompt(input)

    child = spawn(getAiChatAgentCommand('claude'), args, {
      cwd: process.cwd(),
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    if (!dependencies.registry.register(input.requestId, child)) {
      child.kill('SIGTERM')
      throw new AiChatServerError('INVALID_REQUEST')
    }

    const closeResultPromise = waitForClose(child)
    const stdoutChunks: string[] = []

    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(chunk.toString())
    })
    child.stderr.on('data', () => {})
    child.stdin.write(prompt)
    child.stdin.end()

    timeout = setTimeout(() => {
      if (child) {
        dependencies.registry.markTimedOut(input.requestId, child)
      }
    }, timeoutMs)

    const closeResult = await closeResultPromise

    if (timeout) {
      clearTimeout(timeout)
      timeout = null
    }

    const state = dependencies.registry.getState(input.requestId, child)

    if (state === 'timedOut') {
      throw new AiChatServerError('TIMEOUT')
    }

    if (state === 'canceling') {
      throw new AiChatServerError('CANCELED')
    }

    if (closeResult.error) {
      if (closeResult.error.code === 'ENOENT') {
        throw new AiChatServerError('CLAUDE_NOT_FOUND')
      }

      throw new AiChatServerError('AI_AGENT_FAILED')
    }

    if (closeResult.code !== 0) {
      throw new AiChatServerError('AI_AGENT_FAILED')
    }

    return parseAiOutput(stdoutChunks.join(''))
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }

    if (child) {
      dependencies.registry.unregister(input.requestId, child)
    }
  }
}

function buildClaudeArgs(input: NormalizedAiChatMessageRequest): string[] {
  return [
    ...getAiChatAgentBaseArgs('claude'),
    ...getAiChatModelArgs('claude', input.model),
    ...getAiChatPerformanceArgs('claude', input.performance),
  ]
}

function waitForClose(child: ClaudeChildProcess): Promise<{
  code: number | null
  error: NodeJS.ErrnoException | null
}> {
  return new Promise((resolve) => {
    let spawnError: NodeJS.ErrnoException | null = null
    let settled = false

    child.on('error', (error) => {
      if (settled) {
        return
      }

      settled = true
      spawnError = error
      resolve({ code: null, error: spawnError })
    })

    child.on('close', (code) => {
      if (settled) {
        return
      }

      settled = true
      resolve({ code, error: spawnError })
    })
  })
}
