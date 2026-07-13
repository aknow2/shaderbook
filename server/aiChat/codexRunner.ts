import { spawn as defaultSpawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

export type CodexRunnerResult = ParsedAiOutput & { sessionId?: string }

type CodexChildProcess = RequestChildProcess & {
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

export type CodexSpawn = (
  command: string,
  args: string[],
  options: {
    cwd: string
    shell: false
    stdio: ['pipe', 'pipe', 'pipe']
  },
) => CodexChildProcess

export type CodexRunnerDependencies = {
  registry: RequestRegistry
  spawn?: CodexSpawn
  timeoutMs?: number
}

const OUTPUT_FILE_NAME = 'last-message.txt'
const TEMP_DIRECTORY_PREFIX = 'wgslpg-ai-chat-'

export async function runCodex(
  input: NormalizedAiChatMessageRequest,
  dependencies: CodexRunnerDependencies,
): Promise<CodexRunnerResult> {
  const spawn = dependencies.spawn ?? (defaultSpawn as unknown as CodexSpawn)
  const timeoutMs = dependencies.timeoutMs ?? AI_CHAT_SERVER_TIMEOUT_MS
  const tempDirectory = await mkdtemp(join(tmpdir(), TEMP_DIRECTORY_PREFIX))
  const outputFilePath = join(tempDirectory, OUTPUT_FILE_NAME)
  let child: CodexChildProcess | null = null
  let timeout: ReturnType<typeof setTimeout> | null = null
  const sessionIdCollector = createCodexSessionIdCollector()

  try {
    const args = buildCodexArgs(input, outputFilePath)
    const prompt = buildAiChatPrompt(input)

    child = spawn(getAiChatAgentCommand('codex'), args, {
      cwd: process.cwd(),
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    if (!dependencies.registry.register(input.requestId, child)) {
      child.kill('SIGTERM')
      throw new AiChatServerError('INVALID_REQUEST')
    }

    const closeResultPromise = waitForClose(child)

    child.stdout.on('data', (chunk) => sessionIdCollector.push(chunk))
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
        throw new AiChatServerError('CODEX_NOT_FOUND')
      }

      throw new AiChatServerError('AI_AGENT_FAILED')
    }

    if (closeResult.code !== 0) {
      throw new AiChatServerError('AI_AGENT_FAILED')
    }

    let rawOutput: string

    try {
      rawOutput = await readFile(outputFilePath, 'utf8')
    } catch {
      throw new AiChatServerError('INVALID_AI_RESPONSE')
    }

    const parsedOutput = parseAiOutput(rawOutput)
    const sessionId = input.sessionId ?? sessionIdCollector.getSessionId()

    return {
      ...parsedOutput,
      ...(sessionId ? { sessionId } : {}),
    }
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }

    if (child) {
      dependencies.registry.unregister(input.requestId, child)
    }

    await rm(tempDirectory, { recursive: true, force: true })
  }
}

function buildCodexArgs(
  input: NormalizedAiChatMessageRequest,
  outputFilePath: string,
): string[] {
  if (input.sessionId) {
    return [
      'exec',
      'resume',
      '--skip-git-repo-check',
      '--json',
      '--output-last-message',
      outputFilePath,
      ...getAiChatModelArgs('codex', input.model),
      ...getAiChatPerformanceArgs('codex', input.performance),
      input.sessionId,
      '-',
    ]
  }

  return [
    ...getAiChatAgentBaseArgs('codex'),
    outputFilePath,
    ...getAiChatModelArgs('codex', input.model),
    ...getAiChatPerformanceArgs('codex', input.performance),
    '-',
  ]
}

function createCodexSessionIdCollector(): {
  push: (chunk: Buffer | string) => void
  getSessionId: () => string | null
} {
  let pending = ''
  let sessionId: string | null = null

  const parseLine = (line: string) => {
    if (sessionId || line.trim().length === 0) {
      return
    }

    try {
      const event: unknown = JSON.parse(line)

      if (
        typeof event === 'object' &&
        event !== null &&
        'type' in event &&
        event.type === 'thread.started' &&
        'thread_id' in event &&
        typeof event.thread_id === 'string'
      ) {
        sessionId = event.thread_id
      }
    } catch {
      // Ignore non-JSON diagnostic output and continue collecting JSONL events.
    }
  }

  return {
    push(chunk) {
      pending += chunk.toString()
      const lines = pending.split(/\r?\n/)
      pending = lines.pop() ?? ''
      lines.forEach(parseLine)
    },
    getSessionId() {
      parseLine(pending)
      return sessionId
    },
  }
}

function waitForClose(child: CodexChildProcess): Promise<{
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
