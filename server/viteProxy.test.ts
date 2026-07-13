// @vitest-environment node

import { describe, expect, it } from 'vitest'
import config from '../vite.config.ts'

describe('Vite development API integration', () => {
  it('proxies AI chat requests to the standalone loopback server', () => {
    expect(config.server?.proxy).toMatchObject({
      '/api/ai-chat': {
        target: 'http://127.0.0.1:8787',
      },
    })
  })

  it('does not install the old AI chat middleware plugin', () => {
    expect(config.plugins).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'wgslpg-ai-chat' })]),
    )
  })
})
