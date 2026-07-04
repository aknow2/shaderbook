import { describe, expect, it } from 'vitest'
import { defaultShader } from './defaultShader'

describe('defaultShader', () => {
  it('matches the spec initial shader and documents the required uniform declarations', () => {
    expect(defaultShader).toContain('struct Uniforms {')
    expect(defaultShader).toContain('@group(0) @binding(0)')
    expect(defaultShader).toContain('var<uniform> uniforms: Uniforms;')
    expect(defaultShader).toContain('fn mainImage(fragCoord: vec2f) -> vec4f {')
    expect(defaultShader).toContain('let color = palette(r + wave * 0.1 + uniforms.time * 0.05);')
    expect(defaultShader).toContain('return vec4f(color * vignette, 1.0);')
    expect(defaultShader.split('\n').slice(0, 5).join('\n')).toMatch(/uniform/i)
    expect(defaultShader.split('\n').slice(0, 5).join('\n')).toMatch(/struct Uniforms/)
    expect(defaultShader.split('\n').slice(0, 5).join('\n')).toMatch(/@group\(0\) @binding\(0\)/)
  })
})
