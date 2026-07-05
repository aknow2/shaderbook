import { spawn as defaultSpawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AI_CHAT_SERVER_TIMEOUT_MS } from '../../src/aiChat/types.ts'
import type { AiChatMessageRequest } from '../../src/aiChat/types.ts'
import { AiChatServerError } from './errors.ts'
import { parseCodexOutput } from './parseCodexOutput.ts'
import type { ParsedCodexOutput } from './parseCodexOutput.ts'
import { buildCodexPrompt } from './promptBuilder.ts'
import type { RequestChildProcess, RequestRegistry } from './requestRegistry.ts'

export type CodexRunnerResult = ParsedCodexOutput

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
  input: AiChatMessageRequest,
  dependencies: CodexRunnerDependencies,
): Promise<CodexRunnerResult> {
  const spawn = dependencies.spawn ?? (defaultSpawn as unknown as CodexSpawn)
  const timeoutMs = dependencies.timeoutMs ?? AI_CHAT_SERVER_TIMEOUT_MS
  const tempDirectory = await mkdtemp(join(tmpdir(), TEMP_DIRECTORY_PREFIX))
  const outputFilePath = join(tempDirectory, OUTPUT_FILE_NAME)
  let child: CodexChildProcess | null = null
  let timeout: ReturnType<typeof setTimeout> | null = null

  try {
    const args = [
      'exec',
      '--sandbox',
      'read-only',
      '--skip-git-repo-check',
      '--output-last-message',
      outputFilePath,
      '-',
    ]
    const prompt = buildCodexPrompt(input)

    child = spawn('codex', args, {
      cwd: process.cwd(),
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    if (!dependencies.registry.register(input.requestId, child)) {
      child.kill('SIGTERM')
      throw new AiChatServerError('INVALID_REQUEST')
    }

    const closeResultPromise = waitForClose(child)

    child.stdout.on('data', () => {})
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

      throw new AiChatServerError('CODEX_FAILED')
    }

    if (closeResult.code !== 0) {
      throw new AiChatServerError('CODEX_FAILED')
    }

    let rawOutput: string

    try {
      rawOutput = await readFile(outputFilePath, 'utf8')
    } catch {
      throw new AiChatServerError('INVALID_CODEX_RESPONSE')
    }

    return parseCodexOutput(rawOutput)
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
