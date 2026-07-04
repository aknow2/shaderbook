import { StreamLanguage, StringStream } from '@codemirror/language'
import { describe, expect, it } from 'vitest'
import { wgslLanguage, wgslStreamParser } from './wgslLanguage'

function tokenizeLine(line: string) {
  const state = wgslStreamParser.startState?.(2) ?? {}
  const stream = new StringStream(line, 4, 2)
  const tokens: Array<{ text: string; style: string }> = []

  while (!stream.eol()) {
    stream.start = stream.pos
    const style = wgslStreamParser.token(stream, state)
    const text = stream.current()

    if (style) {
      tokens.push({ text, style })
    }
  }

  return tokens
}

describe('wgslLanguage', () => {
  it('is exposed as a CodeMirror StreamLanguage', () => {
    expect(wgslLanguage).toBeInstanceOf(StreamLanguage)
  })

  it('returns distinct token styles for WGSL keywords, types, attributes, comments, and numbers', () => {
    const tokens = tokenizeLine('@fragment fn main() -> vec4f { return vec4f(1.0); } // color')

    expect(tokens).toEqual(
      expect.arrayContaining([
        { text: '@fragment', style: 'attribute' },
        { text: 'fn', style: 'keyword' },
        { text: 'vec4f', style: 'type' },
        { text: 'return', style: 'keyword' },
        { text: '1.0', style: 'number' },
        { text: '// color', style: 'comment' },
      ]),
    )
  })

  it('recognizes block comments and integer suffix numeric literals', () => {
    const tokens = tokenizeLine('/* uniforms */ let index: u32 = 12u;')

    expect(tokens).toEqual(
      expect.arrayContaining([
        { text: '/* uniforms */', style: 'comment' },
        { text: 'let', style: 'keyword' },
        { text: 'u32', style: 'type' },
        { text: '12u', style: 'number' },
      ]),
    )
  })
})
