// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  getShaderbookServerOrigin,
  getShaderbookServerPort,
  SHADERBOOK_SERVER_DEFAULT_PORT,
} from './config.ts'

describe('Shaderbook server config', () => {
  it('uses the loopback default origin', () => {
    expect(getShaderbookServerPort({})).toBe(SHADERBOOK_SERVER_DEFAULT_PORT)
    expect(getShaderbookServerOrigin({})).toBe('http://127.0.0.1:8787')
  })

  it('accepts a valid AI_CHAT_PORT without making the host configurable', () => {
    expect(getShaderbookServerOrigin({ AI_CHAT_PORT: '4321' })).toBe(
      'http://127.0.0.1:4321',
    )
  })

  it.each(['0', '65536', '1.5', 'abc'])('rejects invalid port %s', (port) => {
    expect(() => getShaderbookServerPort({ AI_CHAT_PORT: port })).toThrow(
      'AI_CHAT_PORT must be an integer between 1 and 65535.',
    )
  })
})
