// @vitest-environment node

import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedAiChatMessageRequest } from '../../src/aiChat/types.ts'
import {
  CLAUDE_MODEL_CLI_VALUES,
  CLAUDE_PERFORMANCE_CLI_VALUES,
} from './agentConfig.ts'
import { AiChatServerError } from './errors.ts'
import { createRequestRegistry } from './requestRegistry.ts'
import { runClaude } from './claudeRunner.ts'

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
    agent: 'claude',
    model: 'claude-default',
    performance: 'default',
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
  const promise = runClaude(normalizedRequest(overrides), {
    registry,
    spawn: fake.spawn,
  })

  await vi.waitFor(() => {
    expect(fake.children.length).toBe(1)
  })

  return { registry, fake, promise }
}

function emitValidStdout(child: FakeChild): void {
  child.stdout.emit(
    'data',
    JSON.stringify({
      message: '回答',
      proposedCode: null,
      notes: [],
    }),
  )
}

describe('runClaude spawn / stdin / stdout parse', () => {
  it('calls spawn with command claude and shell false', async () => {
    const { fake, promise } = await runWithFakeSpawn()
    const child = fake.children[0]

    emitValidStdout(child)
    child.close(0)

    await promise
    expect(fake.calls[0].command).toBe('claude')
    expect(fake.calls[0].options.shell).toBe(false)
  })

  it('includes the fixed claude base args and safety constraints', async () => {
    const { fake, promise } = await runWithFakeSpawn()
    const child = fake.children[0]

    emitValidStdout(child)
    child.close(0)

    await promise
    expect(fake.calls[0].args).toEqual(
      expect.arrayContaining([
        '--print',
        '--output-format',
        'text',
        '--no-session-persistence',
        '--safe-mode',
        '--tools',
        '',
      ]),
    )
    expect(fake.calls[0].args[fake.calls[0].args.indexOf('--tools') + 1]).toBe('')
  })

  it('does not add --model for claude-default', async () => {
    const { fake, promise } = await runWithFakeSpawn()
    const child = fake.children[0]

    emitValidStdout(child)
    child.close(0)

    await promise
    expect(fake.calls[0].args).not.toContain('--model')
  })

  it('adds the sonnet model mapping', async () => {
    const { fake, promise } = await runWithFakeSpawn({ model: 'sonnet' })
    const child = fake.children[0]

    emitValidStdout(child)
    child.close(0)

    await promise
    expect(fake.calls[0].args).toEqual(
      expect.arrayContaining(['--model', CLAUDE_MODEL_CLI_VALUES.sonnet]),
    )
  })

  it('adds the fable model mapping', async () => {
    const { fake, promise } = await runWithFakeSpawn({ model: 'fable' })
    const child = fake.children[0]

    emitValidStdout(child)
    child.close(0)

    await promise
    expect(fake.calls[0].args).toEqual(
      expect.arrayContaining(['--model', CLAUDE_MODEL_CLI_VALUES.fable]),
    )
  })

  it('adds the opus model mapping', async () => {
    const { fake, promise } = await runWithFakeSpawn({ model: 'opus' })
    const child = fake.children[0]

    emitValidStdout(child)
    child.close(0)

    await promise
    expect(fake.calls[0].args).toEqual(
      expect.arrayContaining(['--model', CLAUDE_MODEL_CLI_VALUES.opus]),
    )
  })

  it('adds the haiku model mapping', async () => {
    const { fake, promise } = await runWithFakeSpawn({ model: 'haiku' })
    const child = fake.children[0]

    emitValidStdout(child)
    child.close(0)

    await promise
    expect(fake.calls[0].args).toEqual(
      expect.arrayContaining(['--model', CLAUDE_MODEL_CLI_VALUES.haiku]),
    )
  })

  it('does not add performance args for default', async () => {
    const { fake, promise } = await runWithFakeSpawn({ performance: 'default' })
    const child = fake.children[0]

    emitValidStdout(child)
    child.close(0)

    await promise
    expect(fake.calls[0].args).not.toContain('--effort')
  })

  it('adds the claude low performance mapping', async () => {
    const { fake, promise } = await runWithFakeSpawn({ performance: 'low' })
    const child = fake.children[0]

    emitValidStdout(child)
    child.close(0)

    await promise
    expect(fake.calls[0].args).toEqual(
      expect.arrayContaining(['--effort', CLAUDE_PERFORMANCE_CLI_VALUES.low]),
    )
  })

  it('adds the claude medium performance mapping', async () => {
    const { fake, promise } = await runWithFakeSpawn({ performance: 'medium' })
    const child = fake.children[0]

    emitValidStdout(child)
    child.close(0)

    await promise
    expect(fake.calls[0].args).toEqual(
      expect.arrayContaining(['--effort', CLAUDE_PERFORMANCE_CLI_VALUES.medium]),
    )
  })

  it('adds the claude high performance mapping', async () => {
    const { fake, promise } = await runWithFakeSpawn({ performance: 'high' })
    const child = fake.children[0]

    emitValidStdout(child)
    child.close(0)

    await promise
    expect(fake.calls[0].args).toEqual(
      expect.arrayContaining(['--effort', CLAUDE_PERFORMANCE_CLI_VALUES.high]),
    )
  })

  it('adds the claude xhigh performance mapping', async () => {
    const { fake, promise } = await runWithFakeSpawn({ performance: 'xhigh' })
    const child = fake.children[0]

    emitValidStdout(child)
    child.close(0)

    await promise
    expect(fake.calls[0].args).toEqual(
      expect.arrayContaining(['--effort', CLAUDE_PERFORMANCE_CLI_VALUES.xhigh]),
    )
  })

  it('adds the claude max performance mapping', async () => {
    const { fake, promise } = await runWithFakeSpawn({ performance: 'max' })
    const child = fake.children[0]

    emitValidStdout(child)
    child.close(0)

    await promise
    expect(fake.calls[0].args).toEqual(
      expect.arrayContaining(['--effort', CLAUDE_PERFORMANCE_CLI_VALUES.max]),
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

    emitValidStdout(child)
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

    emitValidStdout(child)
    child.close(0)

    await promise
    expect(child.stdin.end).toHaveBeenCalledTimes(1)
    expect(child.stdin.write.mock.invocationCallOrder[0]).toBeLessThan(
      child.stdin.end.mock.invocationCallOrder[0],
    )
  })

  it('returns parsed stdout JSON on exit code 0', async () => {
    const { fake, promise } = await runWithFakeSpawn()
    const child = fake.children[0]

    child.stdout.emit(
      'data',
      '{"message":"stdout answer","proposedCode":null,"notes":[]}',
    )
    child.close(0)

    await expect(promise).resolves.toEqual({
      message: 'stdout answer',
      proposedCode: null,
      notes: [],
    })
  })

  it('does not parse stderr as the AI response', async () => {
    const { fake, promise } = await runWithFakeSpawn()
    const child = fake.children[0]

    child.stderr.emit(
      'data',
      '{"message":"stderr answer","proposedCode":null,"notes":[]}',
    )
    child.close(0)

    await expect(promise).rejects.toMatchObject({ code: 'INVALID_AI_RESPONSE' })
  })
})

describe('runClaude timeout / cancel / error mapping', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('maps ENOENT spawn errors to CLAUDE_NOT_FOUND', async () => {
    const { fake, promise } = await runWithFakeSpawn()
    const error = new Error('not found') as NodeJS.ErrnoException
    error.code = 'ENOENT'

    fake.children[0].fail(error)

    await expect(promise).rejects.toMatchObject({ code: 'CLAUDE_NOT_FOUND' })
  })

  it('maps non-zero exit to AI_AGENT_FAILED', async () => {
    const { fake, promise } = await runWithFakeSpawn()

    fake.children[0].close(1)

    await expect(promise).rejects.toMatchObject({ code: 'AI_AGENT_FAILED' })
  })

  it('maps stdout parse failure to INVALID_AI_RESPONSE', async () => {
    const { fake, promise } = await runWithFakeSpawn()

    fake.children[0].stdout.emit('data', 'not json')
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

  it('cancels by requestId without agent information', async () => {
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
})
