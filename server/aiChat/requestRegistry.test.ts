// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequestRegistry } from './requestRegistry.ts'

type FakeSignal = 'SIGTERM' | 'SIGKILL'

type FakeChild = {
  kill: ReturnType<typeof vi.fn<(signal: FakeSignal) => boolean>>
}

function createFakeChild(): FakeChild {
  return {
    kill: vi.fn(() => true),
  }
}

describe('createRequestRegistry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('updates the registry map through register and unregister', () => {
    const registry = createRequestRegistry()
    const child = createFakeChild()

    expect(registry.register('request-1', child)).toBe(true)
    expect(registry.getState('request-1', child)).toBe('running')

    registry.unregister('request-1', child)

    expect(registry.getState('request-1', child)).toBeNull()
  })

  it('returns false when registering the same requestId twice', () => {
    const registry = createRequestRegistry()
    const child = createFakeChild()
    const duplicateChild = createFakeChild()

    expect(registry.register('request-1', child)).toBe(true)
    expect(registry.register('request-1', duplicateChild)).toBe(false)
    expect(registry.getState('request-1', child)).toBe('running')
  })

  it('sends SIGTERM to the target child on cancel', () => {
    const registry = createRequestRegistry()
    const child = createFakeChild()

    registry.register('request-1', child)
    expect(registry.cancel('request-1')).toBe(true)

    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(registry.getState('request-1', child)).toBe('canceling')
  })

  it('sends SIGKILL to a canceled child that has not closed after 2000ms', () => {
    const registry = createRequestRegistry()
    const child = createFakeChild()

    registry.register('request-1', child)
    registry.cancel('request-1')
    vi.advanceTimersByTime(1999)
    expect(child.kill).not.toHaveBeenCalledWith('SIGKILL')

    vi.advanceTimersByTime(1)

    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
  })

  it('does not add another kill timer on a second cancel', () => {
    const registry = createRequestRegistry()
    const child = createFakeChild()

    registry.register('request-1', child)
    registry.cancel('request-1')
    registry.cancel('request-1')
    vi.advanceTimersByTime(2000)

    expect(child.kill).toHaveBeenCalledTimes(2)
    expect(child.kill).toHaveBeenNthCalledWith(1, 'SIGTERM')
    expect(child.kill).toHaveBeenNthCalledWith(2, 'SIGKILL')
  })

  it('treats cancel after completion as successful', () => {
    const registry = createRequestRegistry()
    const child = createFakeChild()

    registry.register('request-1', child)
    registry.unregister('request-1', child)

    expect(registry.cancel('request-1')).toBe(true)
    expect(child.kill).not.toHaveBeenCalled()
  })

  it('cancels every running child during server shutdown', () => {
    const registry = createRequestRegistry()
    const firstChild = createFakeChild()
    const secondChild = createFakeChild()

    registry.register('request-1', firstChild)
    registry.register('request-2', secondChild)
    registry.cancelAll()

    expect(firstChild.kill).toHaveBeenCalledWith('SIGTERM')
    expect(secondChild.kill).toHaveBeenCalledWith('SIGTERM')
    expect(registry.getState('request-1', firstChild)).toBe('canceling')
    expect(registry.getState('request-2', secondChild)).toBe('canceling')
  })

  it('does not schedule duplicate forced kills when cancelAll follows cancel', () => {
    const registry = createRequestRegistry()
    const child = createFakeChild()

    registry.register('request-1', child)
    registry.cancel('request-1')
    registry.cancelAll()
    vi.advanceTimersByTime(2000)

    expect(child.kill).toHaveBeenCalledTimes(2)
    expect(child.kill).toHaveBeenNthCalledWith(1, 'SIGTERM')
    expect(child.kill).toHaveBeenNthCalledWith(2, 'SIGKILL')
  })

  it('sends SIGTERM to the target child on markTimedOut', () => {
    const registry = createRequestRegistry()
    const child = createFakeChild()

    registry.register('request-1', child)
    registry.markTimedOut('request-1', child)

    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(registry.getState('request-1', child)).toBe('timedOut')
  })

  it('sends SIGKILL to a timed-out child that has not closed after 2000ms', () => {
    const registry = createRequestRegistry()
    const child = createFakeChild()

    registry.register('request-1', child)
    registry.markTimedOut('request-1', child)
    vi.advanceTimersByTime(2000)

    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
  })

  it('clears the force kill timer on unregister', () => {
    const registry = createRequestRegistry()
    const child = createFakeChild()

    registry.register('request-1', child)
    registry.cancel('request-1')
    registry.unregister('request-1', child)
    vi.advanceTimersByTime(2000)

    expect(child.kill).toHaveBeenCalledTimes(1)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('does not let an old child unregister a newer entry', () => {
    const registry = createRequestRegistry()
    const oldChild = createFakeChild()
    const newChild = createFakeChild()

    registry.register('request-1', oldChild)
    registry.unregister('request-1', oldChild)
    registry.register('request-1', newChild)
    registry.unregister('request-1', oldChild)

    expect(registry.getState('request-1', newChild)).toBe('running')
  })
})
