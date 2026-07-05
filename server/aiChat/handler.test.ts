// @vitest-environment node

import { PassThrough } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import type { AiChatMessageRequest } from '../../src/aiChat/types.ts'
import { AiChatServerError } from './errors.ts'
import { createAiChatHandler } from './handler.ts'
import type { RequestRegistry } from './requestRegistry.ts'
import { createRequestRegistry } from './requestRegistry.ts'
import type { CodexRunnerResult } from './codexRunner.ts'

type TestResponse = ServerResponse & {
  body: string
  headers: Record<string, string | number | readonly string[]>
}

type TestRequest = PassThrough & Pick<IncomingMessage, 'method' | 'url'>

type RunCodexContext = {
  registry: RequestRegistry
}

function createJsonRequest(url: string, body: unknown, method = 'POST'): TestRequest {
  return createRequest(url, JSON.stringify(body), method)
}

function createRequest(url: string, body: string, method = 'POST'): TestRequest {
  const request = new PassThrough() as TestRequest
  request.method = method
  request.url = url
  queueMicrotask(() => {
    request.end(body)
  })
  return request
}

function createResponse(): TestResponse {
  return {
    statusCode: 200,
    body: '',
    headers: {},
    setHeader(name: string, value: string | number | readonly string[]) {
      this.headers[name] = value
      return this
    },
    end(chunk?: unknown) {
      this.body = typeof chunk === 'string' ? chunk : chunk ? String(chunk) : ''
      return this
    },
  } as TestResponse
}

function validMessageRequest(overrides: Partial<AiChatMessageRequest> = {}): AiChatMessageRequest {
  return {
    requestId: 'request-1',
    message: '改善して',
    code: '@fragment fn main() -> @location(0) vec4f { return vec4f(1); }',
    history: [],
    ...overrides,
  }
}

async function send(
  options: {
    url: string
    body: unknown
    method?: string
    registry?: RequestRegistry
    runCodex?: (request: AiChatMessageRequest, context: RunCodexContext) => Promise<CodexRunnerResult>
    rawBody?: string
  },
) {
  const registry = options.registry ?? createRequestRegistry()
  const runCodex =
    options.runCodex ??
    vi.fn(async () => ({
      message: '回答',
      proposedCode: null,
      notes: [],
    }))
  const handler = createAiChatHandler({ registry, runCodex })
  const request =
    options.rawBody === undefined
      ? createJsonRequest(options.url, options.body, options.method)
      : createRequest(options.url, options.rawBody, options.method)
  const response = createResponse()

  await handler(request as unknown as IncomingMessage, response, vi.fn())

  return {
    registry,
    response,
    runCodex,
    json: response.body ? (JSON.parse(response.body) as unknown) : null,
  }
}

function expectInvalidRequest(response: TestResponse): void {
  expect(response.statusCode).toBe(400)
  expect(JSON.parse(response.body)).toMatchObject({
    error: {
      code: 'INVALID_REQUEST',
    },
  })
}

describe('createAiChatHandler', () => {
  it('returns the requestId and assistant message for /messages success', async () => {
    const result = await send({
      url: '/messages',
      body: validMessageRequest(),
      runCodex: vi.fn(async () => ({
        message: '回答',
        proposedCode: 'fn main() {}',
        notes: ['補足'],
      })),
    })

    expect(result.response.statusCode).toBe(200)
    expect(result.json).toEqual({
      requestId: 'request-1',
      message: {
        role: 'assistant',
        content: '回答',
        proposedCode: 'fn main() {}',
        notes: ['補足'],
      },
    })
  })

  it('returns 400 INVALID_REQUEST when request body JSON parsing fails', async () => {
    const { response } = await send({
      url: '/messages',
      body: null,
      rawBody: '{',
    })

    expectInvalidRequest(response)
  })

  it('returns 400 INVALID_REQUEST when requestId is empty', async () => {
    const { response } = await send({
      url: '/messages',
      body: validMessageRequest({ requestId: '' }),
    })

    expectInvalidRequest(response)
  })

  it('returns 400 INVALID_REQUEST when requestId is 129 characters', async () => {
    const { response } = await send({
      url: '/messages',
      body: validMessageRequest({ requestId: 'a'.repeat(129) }),
    })

    expectInvalidRequest(response)
  })

  it('returns 400 INVALID_REQUEST when message is empty', async () => {
    const { response } = await send({
      url: '/messages',
      body: validMessageRequest({ message: '' }),
    })

    expectInvalidRequest(response)
  })

  it('returns 400 INVALID_REQUEST when message is whitespace only', async () => {
    const { response } = await send({
      url: '/messages',
      body: validMessageRequest({ message: '   \n\t' }),
    })

    expectInvalidRequest(response)
  })

  it('returns 400 INVALID_REQUEST when message is 4001 characters', async () => {
    const { response } = await send({
      url: '/messages',
      body: validMessageRequest({ message: 'a'.repeat(4001) }),
    })

    expectInvalidRequest(response)
  })

  it('returns 400 INVALID_REQUEST when code is empty', async () => {
    const { response } = await send({
      url: '/messages',
      body: validMessageRequest({ code: '' }),
    })

    expectInvalidRequest(response)
  })

  it('returns 400 INVALID_REQUEST when code is 200001 characters', async () => {
    const { response } = await send({
      url: '/messages',
      body: validMessageRequest({ code: 'a'.repeat(200001) }),
    })

    expectInvalidRequest(response)
  })

  it('returns 400 INVALID_REQUEST when history has 21 items', async () => {
    const { response } = await send({
      url: '/messages',
      body: validMessageRequest({
        history: Array.from({ length: 21 }, () => ({
          role: 'user',
          content: '履歴',
        })),
      }),
    })

    expectInvalidRequest(response)
  })

  it('returns 400 INVALID_REQUEST when the same requestId is already running', async () => {
    const registry = createRequestRegistry()
    const child = { kill: vi.fn(() => true) }
    registry.register('request-1', child)
    const { response } = await send({
      url: '/messages',
      body: validMessageRequest(),
      registry,
      runCodex: vi.fn(async (_request, context) => {
        if (!context.registry.register('request-1', { kill: vi.fn(() => true) })) {
          throw new AiChatServerError('INVALID_REQUEST')
        }

        return {
          message: '回答',
          proposedCode: null,
          notes: [],
        }
      }),
    })

    expectInvalidRequest(response)
  })

  it('calls registry.cancel for /cancel', async () => {
    const registry = createRequestRegistry()
    const cancel = vi.spyOn(registry, 'cancel')
    const { response } = await send({
      url: '/cancel',
      body: { requestId: 'request-1' },
      registry,
    })

    expect(response.statusCode).toBe(200)
    expect(cancel).toHaveBeenCalledWith('request-1')
  })

  it('returns canceled true from /cancel even when the requestId is missing from the registry', async () => {
    const { response, json } = await send({
      url: '/cancel',
      body: { requestId: 'missing-request' },
    })

    expect(response.statusCode).toBe(200)
    expect(json).toEqual({
      requestId: 'missing-request',
      canceled: true,
    })
  })

  it('returns 404 NOT_FOUND for an unknown path', async () => {
    const { response } = await send({
      url: '/unknown',
      body: {},
    })

    expect(response.statusCode).toBe(404)
    expect(JSON.parse(response.body)).toMatchObject({
      error: {
        code: 'NOT_FOUND',
      },
    })
  })

  it('returns 404 NOT_FOUND for non-POST methods', async () => {
    const { response } = await send({
      url: '/messages',
      body: validMessageRequest(),
      method: 'GET',
    })

    expect(response.statusCode).toBe(404)
    expect(JSON.parse(response.body)).toMatchObject({
      error: {
        code: 'NOT_FOUND',
      },
    })
  })
})
