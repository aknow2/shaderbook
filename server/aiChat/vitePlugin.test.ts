// @vitest-environment node

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, ViteDevServer } from 'vite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { aiChatVitePlugin } from './vitePlugin.ts'

const mocks = vi.hoisted(() => {
  const handler = vi.fn()
  const registry = { kind: 'registry' }

  return {
    handler,
    registry,
    createAiChatHandler: vi.fn(() => handler),
    createRequestRegistry: vi.fn(() => registry),
  }
})

vi.mock('./handler.ts', () => ({
  createAiChatHandler: mocks.createAiChatHandler,
}))

vi.mock('./requestRegistry.ts', () => ({
  createRequestRegistry: mocks.createRequestRegistry,
}))

type RegisteredMiddleware = {
  path: string
  handler: Connect.NextHandleFunction
}

function configureServer(plugin: ReturnType<typeof aiChatVitePlugin>, server: ViteDevServer): void {
  if (typeof plugin.configureServer !== 'function') {
    throw new Error('Expected function configureServer hook')
  }

  const hook = plugin.configureServer as (server: ViteDevServer) => void
  hook(server)
}

function createFakeServer(): {
  server: ViteDevServer
  use: ReturnType<typeof vi.fn>
  registered: RegisteredMiddleware[]
} {
  const registered: RegisteredMiddleware[] = []
  const use = vi.fn((path: string, middleware: Connect.NextHandleFunction) => {
    registered.push({ path, handler: middleware })
  })

  return {
    server: {
      middlewares: {
        use,
      },
    } as unknown as ViteDevServer,
    use,
    registered,
  }
}

describe('aiChatVitePlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('has Vite plugin name wgslpg-ai-chat', () => {
    expect(aiChatVitePlugin().name).toBe('wgslpg-ai-chat')
  })

  it("has apply set to 'serve'", () => {
    expect(aiChatVitePlugin().apply).toBe('serve')
  })

  it('registers /api/ai-chat middleware in configureServer', () => {
    const plugin = aiChatVitePlugin()
    const { server, use } = createFakeServer()

    configureServer(plugin, server)

    expect(use).toHaveBeenCalledOnce()
    expect(use).toHaveBeenCalledWith('/api/ai-chat', expect.any(Function))
  })

  it('passes request, response, and next to the handler', () => {
    const plugin = aiChatVitePlugin()
    const { server, registered } = createFakeServer()
    const request = { url: '/messages' } as IncomingMessage
    const response = {} as ServerResponse
    const next = vi.fn()

    configureServer(plugin, server)
    registered[0].handler(request, response, next)

    expect(mocks.createRequestRegistry).toHaveBeenCalledOnce()
    expect(mocks.createAiChatHandler).toHaveBeenCalledWith({ registry: mocks.registry })
    expect(mocks.handler).toHaveBeenCalledWith(request, response, next)
  })

  it('uses a mounted /api/ai-chat middleware so other paths remain Vite middleware traffic', () => {
    const plugin = aiChatVitePlugin()
    const { server, registered } = createFakeServer()

    configureServer(plugin, server)

    expect(registered).toHaveLength(1)
    expect(registered[0].path).toBe('/api/ai-chat')
  })
})
