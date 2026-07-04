import { describe, expect, it } from 'vitest'
import { defaultShader } from '../constants/defaultShader'
import { wrapShader } from './shaderWrapper'

describe('wrapShader', () => {
  it('throws when user code is empty', () => {
    expect(() => wrapShader({ userCode: '   \n\t  ' })).toThrow('Shader code is empty')
  })

  it('throws when mainImage is missing', () => {
    expect(() => wrapShader({ userCode: 'fn helper() -> vec4f { return vec4f(1.0); }' })).toThrow(
      'mainImage function not found',
    )
  })

  it('returns complete WGSL with the spec wrapper for the default shader', () => {
    const { wgsl } = wrapShader({ userCode: defaultShader })

    expect(wgsl.startsWith(defaultShader)).toBe(true)
    expect(wgsl).toContain('struct VertexOutput')
    expect(wgsl).toContain('@vertex')
    expect(wgsl).toContain('fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput')
    expect(wgsl).toContain('@fragment')
    expect(wgsl).toContain('fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f')
    expect(wgsl).toContain('return mainImage(position.xy);')
  })

  it('keeps user code at the start of the generated WGSL', () => {
    const userCode = 'fn mainImage(fragCoord: vec2f) -> vec4f { return vec4f(fragCoord, 0.0, 1.0); }'

    expect(wrapShader({ userCode }).wgsl.startsWith(userCode)).toBe(true)
  })
})
