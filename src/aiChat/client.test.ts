import { afterEach, describe, expect, it, vi } from 'vitest'
import { AI_CHAT_CLIENT_TIMEOUT_MS } from './types'
import { AiChatClientError, cancelAiChatRequest, sendAiChatMessage } from './client'
import type {
  AiChatCancelResponse,
  AiChatErrorCode,
  AiChatMessageRequest,
  AiChatMessageResponse,
} from './types'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('AI chat fetch client', () => {
  it('returns a successful response as AiChatMessageResponse', async () => {
    const responseBody: AiChatMessageResponse = {
      requestId: 'request-1',
      message: {
        role: 'assistant',
        content: 'Done',
        proposedCode: null,
        notes: [],
      },
    }
    stubFetch(jsonResponse(200, responseBody))

    await expect(sendAiChatMessage(messageRequest())).resolves.toEqual(responseBody)
  })

  it('returns a successful response with a session id', async () => {
    const responseBody: AiChatMessageResponse = {
      requestId: 'request-1',
      sessionId: '123e4567-e89b-42d3-a456-426614174000',
      message: {
        role: 'assistant',
        content: 'Done',
        proposedCode: null,
        notes: [],
      },
    }
    stubFetch(jsonResponse(200, responseBody))

    await expect(sendAiChatMessage(messageRequest())).resolves.toEqual(responseBody)
  })

  it('maps 400 INVALID_REQUEST to the server message display error', async () => {
    stubFetch(errorResponse(400, 'INVALID_REQUEST', 'Message is required.'))

    await expectDisplayError(
      sendAiChatMessage(messageRequest()),
      'Message is required.',
    )
  })

  it('maps 408 TIMEOUT to AI chat request timed out.', async () => {
    stubFetch(errorResponse(408, 'TIMEOUT', 'server timeout'))

    await expectDisplayError(sendAiChatMessage(messageRequest()), 'AI chat request timed out.')
  })

  it('maps 499 CANCELED to Request canceled.', async () => {
    stubFetch(errorResponse(499, 'CANCELED', 'server canceled'))

    await expectDisplayError(sendAiChatMessage(messageRequest()), 'Request canceled.')
  })

  it('maps 500 CODEX_NOT_FOUND to Codex CLI is not installed or not found in PATH.', async () => {
    stubFetch(errorResponse(500, 'CODEX_NOT_FOUND', 'server missing codex'))

    await expectDisplayError(
      sendAiChatMessage(messageRequest()),
      'Codex CLI is not installed or not found in PATH.',
    )
  })

  it('maps 500 CLAUDE_NOT_FOUND to Claude CLI is not installed or not found in PATH.', async () => {
    stubFetch(errorResponse(500, 'CLAUDE_NOT_FOUND', 'server missing claude'))

    await expectDisplayError(
      sendAiChatMessage(messageRequest()),
      'Claude CLI is not installed or not found in PATH.',
    )
  })

  it('maps 500 INVALID_AI_RESPONSE to AI returned an invalid response.', async () => {
    stubFetch(errorResponse(500, 'INVALID_AI_RESPONSE', 'server invalid ai'))

    await expectDisplayError(
      sendAiChatMessage(messageRequest()),
      'AI returned an invalid response.',
    )
  })

  it('maps 500 INVALID_CODEX_RESPONSE to AI returned an invalid response.', async () => {
    stubFetch(errorResponse(500, 'INVALID_CODEX_RESPONSE', 'server invalid codex'))

    await expectDisplayError(
      sendAiChatMessage(messageRequest()),
      'AI returned an invalid response.',
    )
  })

  it('maps 500 AI_AGENT_FAILED to AI chat request failed.', async () => {
    stubFetch(errorResponse(500, 'AI_AGENT_FAILED', 'server failed ai'))

    await expectDisplayError(sendAiChatMessage(messageRequest()), 'AI chat request failed.')
  })

  it('maps 500 CODEX_FAILED to AI chat request failed.', async () => {
    stubFetch(errorResponse(500, 'CODEX_FAILED', 'server failed codex'))

    await expectDisplayError(sendAiChatMessage(messageRequest()), 'AI chat request failed.')
  })

  it('maps response JSON parse failure to AI chat request failed.', async () => {
    stubFetch(new Response('{', { status: 200 }))

    await expectDisplayError(sendAiChatMessage(messageRequest()), 'AI chat request failed.')
  })

  it('maps response schema mismatch to AI chat request failed.', async () => {
    stubFetch(jsonResponse(200, { requestId: 'request-1', message: { role: 'user' } }))

    await expectDisplayError(sendAiChatMessage(messageRequest()), 'AI chat request failed.')
  })

  it('maps fetch reject to AI chat server is not running.', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))

    await expectDisplayError(
      sendAiChatMessage(messageRequest()),
      'AI chat server is not running.',
    )
  })

  it('calls AbortController.abort() on HTTP timeout', async () => {
    vi.useFakeTimers()
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort')
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      }),
    )

    const promise = sendAiChatMessage(messageRequest())
    const rejection = promise.catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(AI_CHAT_CLIENT_TIMEOUT_MS)

    expect(abortSpy).toHaveBeenCalledOnce()
    expect(await rejection).toMatchObject({
      displayMessage: 'AI chat server is not running.',
    } satisfies Partial<AiChatClientError>)
  })

  it('maps client timeout abort reject to AI chat server is not running.', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      }),
    )

    const promise = sendAiChatMessage(messageRequest())
    const rejection = promise.catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(AI_CHAT_CLIENT_TIMEOUT_MS)

    expect(await rejection).toMatchObject({
      displayMessage: 'AI chat server is not running.',
    } satisfies Partial<AiChatClientError>)
  })

  it('returns { canceled: true } from the cancel API', async () => {
    const responseBody: AiChatCancelResponse = { requestId: 'request-1', canceled: true }
    stubFetch(jsonResponse(200, responseBody))

    await expect(cancelAiChatRequest({ requestId: 'request-1' })).resolves.toEqual(responseBody)
  })
})

function messageRequest(): AiChatMessageRequest {
  return {
    requestId: 'request-1',
    message: 'Help',
    code: '@fragment fn main() -> @location(0) vec4f { return vec4f(1); }',
    history: [],
  }
}

function stubFetch(response: Response): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(() => Promise.resolve(response))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function errorResponse(status: number, code: AiChatErrorCode, message: string): Response {
  return jsonResponse(status, { error: { code, message } })
}

async function expectDisplayError(promise: Promise<unknown>, displayMessage: string) {
  await expect(promise).rejects.toMatchObject({
    displayMessage,
  } satisfies Partial<AiChatClientError>)
}
