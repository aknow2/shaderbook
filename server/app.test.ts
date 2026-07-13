// @vitest-environment node

import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiChatMessageRequest } from '../src/aiChat/types.ts'
import { createShaderbookServer } from './app.ts'
import type { ShaderbookServer } from './app.ts'

const startedServers: ShaderbookServer[] = []

afterEach(async () => {
  await Promise.all(
    startedServers.splice(0).map(async ({ httpServer, registry }) => {
      registry.cancelAll()
      httpServer.close()
      await once(httpServer, 'close')
    }),
  )
})

describe('createShaderbookServer', () => {
  it('mounts the current cancel contract at the full public API path', async () => {
    const origin = await startServer()
    const response = await fetch(`${origin}/api/ai-chat/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: 'request-1' }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(
      'application/json; charset=utf-8',
    )
    expect(await response.json()).toEqual({
      requestId: 'request-1',
      canceled: true,
    })
  })

  it('passes message requests to the injected runner without changing the contract', async () => {
    const runAiChatAgent = vi.fn(async () => ({
      message: '回答',
      proposedCode: null,
      notes: ['補足'],
    }))
    const origin = await startServer({ runAiChatAgent })
    const response = await fetch(`${origin}/api/ai-chat/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validMessageRequest()),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      requestId: 'request-1',
      message: {
        role: 'assistant',
        content: '回答',
        proposedCode: null,
        notes: ['補足'],
      },
    })
    expect(runAiChatAgent).toHaveBeenCalledOnce()
  })

  it('returns the current JSON 404 for unknown AI routes and methods', async () => {
    const origin = await startServer()
    const [unknownPath, wrongMethod] = await Promise.all([
      fetch(`${origin}/api/ai-chat/unknown`, { method: 'POST' }),
      fetch(`${origin}/api/ai-chat/messages`),
    ])

    expect(unknownPath.status).toBe(404)
    expect(await unknownPath.json()).toMatchObject({ error: { code: 'NOT_FOUND' } })
    expect(wrongMethod.status).toBe(404)
    expect(await wrongMethod.json()).toMatchObject({ error: { code: 'NOT_FOUND' } })
  })

  it('does not expose the Express implementation header', async () => {
    const origin = await startServer()
    const response = await fetch(`${origin}/missing`)

    expect(response.headers.has('x-powered-by')).toBe(false)
  })
})

async function startServer(
  options: Parameters<typeof createShaderbookServer>[0] = {},
): Promise<string> {
  const server = createShaderbookServer(options)
  startedServers.push(server)
  server.httpServer.listen(0, '127.0.0.1')
  await once(server.httpServer, 'listening')
  const address = server.httpServer.address() as AddressInfo
  return `http://127.0.0.1:${address.port}`
}

function validMessageRequest(): AiChatMessageRequest {
  return {
    requestId: 'request-1',
    message: '改善して',
    code: '@fragment fn main() -> @location(0) vec4f { return vec4f(1); }',
    history: [],
  }
}
