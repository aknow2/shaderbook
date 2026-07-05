// @vitest-environment node

import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { NormalizedAiChatMessageRequest } from '../../src/aiChat/types.ts'
import {
  getAiChatAgentBaseArgs,
  getAiChatAgentCommand,
  getAiChatModelArgs,
  getAiChatPerformanceArgs,
} from './agentConfig.ts'
import { runAiChatAgent } from './aiAgentRunner.ts'
import { createRequestRegistry } from './requestRegistry.ts'

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}))

class DefaultDispatchFakeChild extends EventEmitter {
  readonly stdin = {
    write: vi.fn<(prompt: string) => boolean>(() => true),
    end: vi.fn<() => void>(),
  }

  readonly stdout = new EventEmitter()
  readonly stderr = new EventEmitter()
  readonly kill = vi.fn<() => boolean>(() => true)

  close(code: number): void {
    this.emit('close', code, null)
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

describe('runAiChatAgent', () => {
  it('selects the Codex runner for agent codex', async () => {
    const registry = createRequestRegistry()
    const codexRunner = vi.fn(async () => ({
      message: 'codex answer',
      proposedCode: null,
      notes: [],
    }))
    const claudeRunner = vi.fn(async () => ({
      message: 'claude answer',
      proposedCode: null,
      notes: [],
    }))

    await expect(
      runAiChatAgent(normalizedRequest({ agent: 'codex' }), {
        registry,
        codexRunner,
        claudeRunner,
      }),
    ).resolves.toEqual({
      message: 'codex answer',
      proposedCode: null,
      notes: [],
    })

    expect(codexRunner).toHaveBeenCalledTimes(1)
    expect(claudeRunner).not.toHaveBeenCalled()
  })

  it('selects the Claude runner for agent claude', async () => {
    const registry = createRequestRegistry()
    const codexRunner = vi.fn(async () => ({
      message: 'codex answer',
      proposedCode: null,
      notes: [],
    }))
    const claudeRunner = vi.fn(async () => ({
      message: 'claude answer',
      proposedCode: null,
      notes: [],
    }))

    await expect(
      runAiChatAgent(
        normalizedRequest({
          agent: 'claude',
          model: 'claude-default',
        }),
        {
          registry,
          codexRunner,
          claudeRunner,
        },
      ),
    ).resolves.toEqual({
      message: 'claude answer',
      proposedCode: null,
      notes: [],
    })

    expect(codexRunner).not.toHaveBeenCalled()
    expect(claudeRunner).toHaveBeenCalledTimes(1)
  })

  it('dispatches agent claude to the default Claude runner', async () => {
    const child = new DefaultDispatchFakeChild()
    spawnMock.mockReturnValueOnce(child)

    const promise = runAiChatAgent(
      normalizedRequest({
        agent: 'claude',
        model: 'claude-default',
      }),
      {
        registry: createRequestRegistry(),
      },
    )

    await vi.waitFor(() => {
      expect(spawnMock).toHaveBeenCalledTimes(1)
    })

    child.stdout.emit(
      'data',
      JSON.stringify({
        message: 'claude answer',
        proposedCode: null,
        notes: [],
      }),
    )
    child.close(0)

    await expect(promise).resolves.toEqual({
      message: 'claude answer',
      proposedCode: null,
      notes: [],
    })
    expect(spawnMock).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['--print']),
      expect.objectContaining({ shell: false }),
    )
  })

  it('throws INTERNAL_ERROR when a validated-looking value has no mapping', async () => {
    const codexRunner = vi.fn(async () => ({
      message: 'codex answer',
      proposedCode: null,
      notes: [],
    }))

    await expect(
      runAiChatAgent(
        normalizedRequest({
          model: 'codex-missing' as NormalizedAiChatMessageRequest['model'],
        }),
        {
          registry: createRequestRegistry(),
          codexRunner,
        },
      ),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    })

    expect(codexRunner).not.toHaveBeenCalled()
  })
})

describe('agentConfig', () => {
  it('keeps CLI commands and base args per agent', () => {
    expect(getAiChatAgentCommand('codex')).toBe('codex')
    expect(getAiChatAgentCommand('claude')).toBe('claude')
    expect(getAiChatAgentBaseArgs('codex')).toContain('exec')
    expect(getAiChatAgentBaseArgs('claude')).toContain('--print')
  })

  it('does not add --model for default models', () => {
    expect(getAiChatModelArgs('codex', 'codex-default')).toEqual([])
    expect(getAiChatModelArgs('claude', 'claude-default')).toEqual([])
  })

  it('does not add performance args for balanced', () => {
    expect(getAiChatPerformanceArgs('codex', 'balanced')).toEqual([])
    expect(getAiChatPerformanceArgs('claude', 'balanced')).toEqual([])
  })

  it('defines explicit fast and deep performance argv fragments for each agent', () => {
    expect(getAiChatPerformanceArgs('codex', 'fast')).toEqual([
      '--config',
      expect.any(String),
    ])
    expect(getAiChatPerformanceArgs('codex', 'deep')).toEqual([
      '--config',
      expect.any(String),
    ])
    expect(getAiChatPerformanceArgs('claude', 'fast')).toEqual([
      '--effort',
      expect.any(String),
    ])
    expect(getAiChatPerformanceArgs('claude', 'deep')).toEqual([
      '--effort',
      expect.any(String),
    ])
  })
})
