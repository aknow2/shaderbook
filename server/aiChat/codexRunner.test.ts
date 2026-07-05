// @vitest-environment node

import { EventEmitter } from 'node:events'
import { access, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedAiChatMessageRequest } from '../../src/aiChat/types.ts'
import {
  CODEX_MODEL_CLI_VALUES,
  CODEX_PERFORMANCE_CLI_VALUES,
} from './agentConfig.ts'
import { AiChatServerError } from './errors.ts'
import { createRequestRegistry } from './requestRegistry.ts'
import { runCodex } from './codexRunner.ts'

type FakeSignal = 'SIGTERM' | 'SIGKILL'

type SpawnCall = {
  command: string
  args: string[]
  startedAt: number
  options: {
    cwd?: string
    shell?: boolean
    stdio?: string[]
  }
}

class FakeChild extends EventEmitter {
  readonly stdin = {
    write: vi.fn<(prompt: string) => boolean>(() => true),
    end: vi.fn<() => void>(),
  }

  readonly stdout = new EventEmitter()
  readonly stderr = new EventEmitter()
  readonly kill = vi.fn<(signal: FakeSignal) => boolean>(() => true)

  close(code: number): void {
    this.emit('close', code, null)
  }

  fail(error: NodeJS.ErrnoException): void {
    this.emit('error', error)
  }
}

function normalizedRequest(
  overrides: Partial<NormalizedAiChatMessageRequest> = {},
): NormalizedAiChatMessageRequest {
  return {
    requestId: 'request-1',
    message: '改善して',
    code: '@fragment fn main() -> @location(0) vec4f { return vec4f(1); }',
    history: [],
    agent: 'codex',
    model: 'codex-default',
    performance: 'balanced',
    ...overrides,
  }
}

function createFakeSpawn() {
  const children: FakeChild[] = []
  const calls: SpawnCall[] = []
  const spawn = vi.fn((command: string, args: string[], options: SpawnCall['options']) => {
    const child = new FakeChild()

    children.push(child)
    calls.push({ command, args, startedAt: Date.now(), options })

    return child
  })

  return { spawn, children, calls }
}

async function runWithFakeSpawn(
  overrides: Partial<NormalizedAiChatMessageRequest> = {},
) {
  const registry = createRequestRegistry()
  const fake = createFakeSpawn()
  const promise = runCodex(normalizedRequest(overrides), {
    registry,
    spawn: fake.spawn,
  })

  await vi.waitFor(() => {
    expect(fake.children.length).toBe(1)
  })

  return { registry, fake, promise }
}

function getOutputFilePath(call: SpawnCall): string {
  const index = call.args.indexOf('--output-last-message')

  if (index === -1) {
    throw new Error('missing --output-last-message')
  }

  return call.args[index + 1]
}

async function writeValidOutput(outputFilePath: string): Promise<void> {
  await writeFile(
    outputFilePath,
    JSON.stringify({
      message: '回答',
      proposedCode: null,
      notes: [],
    }),
  )
}

async function expectPathRemoved(path: string): Promise<void> {
  await expect(access(path)).rejects.toThrow()
}

describe('runCodex spawn / stdin / cleanup', () => {
  it('calls spawn with command codex and shell false', async () => {
    const { fake, promise } = await runWithFakeSpawn()
    const child = fake.children[0]
    await writeValidOutput(getOutputFilePath(fake.calls[0]))

    child.close(0)

    await promise
    expect(fake.calls[0].command).toBe('codex')
    expect(fake.calls[0].options.shell).toBe(false)
  })

  it('includes the fixed codex exec base args', async () => {
    const { fake, promise } = await runWithFakeSpawn()
    const child = fake.children[0]
    const outputFilePath = getOutputFilePath(fake.calls[0])
    await writeValidOutput(outputFilePath)

    child.close(0)

    await promise
    expect(fake.calls[0].args).toEqual(
      expect.arrayContaining([
        'exec',
        '--sandbox',
        'read-only',
        '--skip-git-repo-check',
        '--output-last-message',
        outputFilePath,
      ]),
    )
  })

  it('does not add --model for codex-default', async () => {
    const { fake, promise } = await runWithFakeSpawn()
    const child = fake.children[0]
    await writeValidOutput(getOutputFilePath(fake.calls[0]))

    child.close(0)

    await promise
    expect(fake.calls[0].args).not.toContain('--model')
  })

  it('adds the codex-fast model mapping', async () => {
    const { fake, promise } = await runWithFakeSpawn({ model: 'codex-fast' })
    const child = fake.children[0]
    await writeValidOutput(getOutputFilePath(fake.calls[0]))

    child.close(0)

    await promise
    expect(fake.calls[0].args).toEqual(
      expect.arrayContaining(['--model', CODEX_MODEL_CLI_VALUES['codex-fast']]),
    )
  })

  it('adds the codex-deep model mapping', async () => {
    const { fake, promise } = await runWithFakeSpawn({ model: 'codex-deep' })
    const child = fake.children[0]
    await writeValidOutput(getOutputFilePath(fake.calls[0]))

    child.close(0)

    await promise
    expect(fake.calls[0].args).toEqual(
      expect.arrayContaining(['--model', CODEX_MODEL_CLI_VALUES['codex-deep']]),
    )
  })

  it('does not add performance args for balanced', async () => {
    const { fake, promise } = await runWithFakeSpawn({ performance: 'balanced' })
    const child = fake.children[0]
    await writeValidOutput(getOutputFilePath(fake.calls[0]))

    child.close(0)

    await promise
    expect(fake.calls[0].args).not.toContain('--config')
  })

  it('adds the codex fast performance mapping', async () => {
    const { fake, promise } = await runWithFakeSpawn({ performance: 'fast' })
    const child = fake.children[0]
    await writeValidOutput(getOutputFilePath(fake.calls[0]))

    child.close(0)

    await promise
    expect(fake.calls[0].args).toEqual(
      expect.arrayContaining(['--config', CODEX_PERFORMANCE_CLI_VALUES.fast]),
    )
  })

  it('adds the codex deep performance mapping', async () => {
    const { fake, promise } = await runWithFakeSpawn({ performance: 'deep' })
    const child = fake.children[0]
    await writeValidOutput(getOutputFilePath(fake.calls[0]))

    child.close(0)

    await promise
    expect(fake.calls[0].args).toEqual(
      expect.arrayContaining(['--config', CODEX_PERFORMANCE_CLI_VALUES.deep]),
    )
  })

  it('passes message, code, and history through stdin rather than argv', async () => {
    const historyContent = '前回の説明を踏まえて'
    const { fake, promise } = await runWithFakeSpawn({
      message: 'unique message for stdin',
      code: 'unique code for stdin',
      history: [{ role: 'user', content: historyContent }],
    })
    const child = fake.children[0]
    await writeValidOutput(getOutputFilePath(fake.calls[0]))

    child.close(0)

    await promise
    expect(fake.calls[0].args).not.toContain('unique message for stdin')
    expect(fake.calls[0].args).not.toContain('unique code for stdin')
    expect(fake.calls[0].args).not.toContain(historyContent)
    expect(child.stdin.write).toHaveBeenCalledWith(
      expect.stringContaining('unique message for stdin'),
    )
    expect(child.stdin.write).toHaveBeenCalledWith(
      expect.stringContaining('unique code for stdin'),
    )
    expect(child.stdin.write).toHaveBeenCalledWith(expect.stringContaining(historyContent))
  })

  it('ends stdin after writing the prompt', async () => {
    const { fake, promise } = await runWithFakeSpawn()
    const child = fake.children[0]
    await writeValidOutput(getOutputFilePath(fake.calls[0]))

    child.close(0)

    await promise
    expect(child.stdin.end).toHaveBeenCalledTimes(1)
    expect(child.stdin.write.mock.invocationCallOrder[0]).toBeLessThan(
      child.stdin.end.mock.invocationCallOrder[0],
    )
  })

  it('creates the temporary directory under os.tmpdir()', async () => {
    const { fake, promise } = await runWithFakeSpawn()
    const child = fake.children[0]
    const outputFilePath = getOutputFilePath(fake.calls[0])
    await writeValidOutput(outputFilePath)

    child.close(0)

    await promise
    expect(dirname(outputFilePath).startsWith(tmpdir())).toBe(true)
  })

  it('returns output file JSON on exit code 0', async () => {
    const { fake, promise } = await runWithFakeSpawn()
    const child = fake.children[0]
    await writeValidOutput(getOutputFilePath(fake.calls[0]))

    child.close(0)

    await expect(promise).resolves.toEqual({
      message: '回答',
      proposedCode: null,
      notes: [],
    })
  })

  it('does not parse stdout or stderr as JSON', async () => {
    const { fake, promise } = await runWithFakeSpawn()
    const child = fake.children[0]
    await writeValidOutput(getOutputFilePath(fake.calls[0]))
    child.stdout.emit('data', Buffer.from('{"message":"stdout","proposedCode":null,"notes":[]}'))
    child.stderr.emit('data', Buffer.from('{"message":"stderr","proposedCode":null,"notes":[]}'))

    child.close(0)

    await expect(promise).resolves.toEqual({
      message: '回答',
      proposedCode: null,
      notes: [],
    })
  })

  it('removes the temporary file and directory on success', async () => {
    const { fake, promise } = await runWithFakeSpawn()
    const child = fake.children[0]
    const outputFilePath = getOutputFilePath(fake.calls[0])
    const tempDirectory = dirname(outputFilePath)
    await writeValidOutput(outputFilePath)

    child.close(0)

    await promise
    await expectPathRemoved(outputFilePath)
    await expectPathRemoved(tempDirectory)
  })

  it('removes the temporary file and directory on non-zero exit', async () => {
    const { fake, promise } = await runWithFakeSpawn()
    const child = fake.children[0]
    const outputFilePath = getOutputFilePath(fake.calls[0])
    const tempDirectory = dirname(outputFilePath)

    child.close(1)

    await expect(promise).rejects.toMatchObject({ code: 'AI_AGENT_FAILED' })
    await expectPathRemoved(outputFilePath)
    await expectPathRemoved(tempDirectory)
  })
})

describe('runCodex timeout / cancel / error mapping', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('maps ENOENT spawn errors to CODEX_NOT_FOUND', async () => {
    const { fake, promise } = await runWithFakeSpawn()
    const error = new Error('not found') as NodeJS.ErrnoException
    error.code = 'ENOENT'

    fake.children[0].fail(error)

    await expect(promise).rejects.toMatchObject({ code: 'CODEX_NOT_FOUND' })
  })

  it('maps non-zero exit to AI_AGENT_FAILED', async () => {
    const { fake, promise } = await runWithFakeSpawn()

    fake.children[0].close(1)

    await expect(promise).rejects.toMatchObject({ code: 'AI_AGENT_FAILED' })
  })

  it('maps unreadable output file to INVALID_AI_RESPONSE', async () => {
    const { fake, promise } = await runWithFakeSpawn()

    fake.children[0].close(0)

    await expect(promise).rejects.toMatchObject({ code: 'INVALID_AI_RESPONSE' })
  })

  it('maps output file JSON parse failure to INVALID_AI_RESPONSE', async () => {
    const { fake, promise } = await runWithFakeSpawn()
    await writeFile(getOutputFilePath(fake.calls[0]), 'not json')

    fake.children[0].close(0)

    await expect(promise).rejects.toMatchObject({ code: 'INVALID_AI_RESPONSE' })
  })

  it('marks registry state as timedOut on timeout', async () => {
    const { registry, fake, promise } = await runWithFakeSpawn()
    const child = fake.children[0]

    vi.advanceTimersByTime(120000)

    expect(registry.getState('request-1', child)).toBe('timedOut')
    child.close(0)
    await expect(promise).rejects.toBeInstanceOf(AiChatServerError)
  })

  it('sends SIGTERM on timeout and SIGKILL 2000ms later', async () => {
    const { fake, promise } = await runWithFakeSpawn()
    const child = fake.children[0]

    const elapsedSinceSpawn = Date.now() - fake.calls[0].startedAt
    vi.advanceTimersByTime(120000 - elapsedSinceSpawn)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(child.kill).not.toHaveBeenCalledWith('SIGKILL')
    child.kill.mockClear()
    vi.advanceTimersByTime(1999)
    expect(child.kill).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')

    child.close(0)
    await expect(promise).rejects.toMatchObject({ code: 'TIMEOUT' })
  })

  it('sends SIGTERM on cancel and SIGKILL 2000ms later', async () => {
    const { registry, fake, promise } = await runWithFakeSpawn()
    const child = fake.children[0]

    registry.cancel('request-1')
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(child.kill).not.toHaveBeenCalledWith('SIGKILL')
    child.kill.mockClear()
    vi.advanceTimersByTime(1999)
    expect(child.kill).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')

    child.close(0)
    await expect(promise).rejects.toMatchObject({ code: 'CANCELED' })
  })

  it('maps close after timeout to a TIMEOUT error', async () => {
    const { fake, promise } = await runWithFakeSpawn()

    vi.advanceTimersByTime(120000)
    fake.children[0].close(0)

    await expect(promise).rejects.toMatchObject({ code: 'TIMEOUT' })
  })

  it('maps close in canceling state to a CANCELED error', async () => {
    const { registry, fake, promise } = await runWithFakeSpawn()

    registry.cancel('request-1')
    fake.children[0].close(0)

    await expect(promise).rejects.toMatchObject({ code: 'CANCELED' })
  })

  it('removes the temporary file and directory on timeout', async () => {
    const { fake, promise } = await runWithFakeSpawn()
    const outputFilePath = getOutputFilePath(fake.calls[0])
    const tempDirectory = dirname(outputFilePath)

    vi.advanceTimersByTime(120000)
    fake.children[0].close(0)

    await expect(promise).rejects.toMatchObject({ code: 'TIMEOUT' })
    await expectPathRemoved(outputFilePath)
    await expectPathRemoved(tempDirectory)
  })

  it('removes the temporary file and directory on cancel', async () => {
    const { registry, fake, promise } = await runWithFakeSpawn()
    const outputFilePath = getOutputFilePath(fake.calls[0])
    const tempDirectory = dirname(outputFilePath)

    registry.cancel('request-1')
    fake.children[0].close(0)

    await expect(promise).rejects.toMatchObject({ code: 'CANCELED' })
    await expectPathRemoved(outputFilePath)
    await expectPathRemoved(tempDirectory)
  })
})
