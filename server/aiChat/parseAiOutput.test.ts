// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { InvalidAiResponseError } from './errors.ts'
import { parseAiOutput } from './parseAiOutput.ts'

describe('parseAiOutput', () => {
  it('parses plain JSON', () => {
    expect(parseAiOutput('{"message":"回答","proposedCode":"fn main() {}","notes":[]}')).toEqual({
      message: '回答',
      proposedCode: 'fn main() {}',
      notes: [],
    })
  })

  it('strips a json code fence wrapping the whole response', () => {
    expect(parseAiOutput('```json\n{"message":"回答","proposedCode":null,"notes":[]}\n```')).toEqual({
      message: '回答',
      proposedCode: null,
      notes: [],
    })
  })

  it('strips an unlabeled code fence wrapping the whole response', () => {
    expect(parseAiOutput('```\n{"message":"回答","proposedCode":null,"notes":[]}\n```')).toEqual({
      message: '回答',
      proposedCode: null,
      notes: [],
    })
  })

  it('does not strip code fences inside the response body', () => {
    const parsed = parseAiOutput(
      '{"message":"本文中の```wgsl\\\\nfn main() {}\\\\n```は残す","proposedCode":null,"notes":[]}',
    )

    expect(parsed.message).toBe('本文中の```wgsl\\nfn main() {}\\n```は残す')
  })

  it('returns a response with an empty message as valid', () => {
    expect(parseAiOutput('{"message":"","proposedCode":null,"notes":[]}')).toEqual({
      message: '',
      proposedCode: null,
      notes: [],
    })
  })

  it('returns a response with proposedCode null as valid', () => {
    expect(parseAiOutput('{"message":"回答","proposedCode":null,"notes":[]}')).toEqual({
      message: '回答',
      proposedCode: null,
      notes: [],
    })
  })

  it('returns a response with a string notes array as valid', () => {
    expect(parseAiOutput('{"message":"回答","proposedCode":null,"notes":["補足1","補足2"]}')).toEqual({
      message: '回答',
      proposedCode: null,
      notes: ['補足1', '補足2'],
    })
  })

  it('rejects a missing message', () => {
    expect(() => parseAiOutput('{"proposedCode":null,"notes":[]}')).toThrow(InvalidAiResponseError)
  })

  it('rejects an invalid proposedCode type', () => {
    expect(() => parseAiOutput('{"message":"回答","proposedCode":123,"notes":[]}')).toThrow(
      InvalidAiResponseError,
    )
  })

  it('rejects an empty proposedCode string', () => {
    expect(() => parseAiOutput('{"message":"回答","proposedCode":"","notes":[]}')).toThrow(
      InvalidAiResponseError,
    )
  })

  it('rejects an invalid notes type', () => {
    expect(() => parseAiOutput('{"message":"回答","proposedCode":null,"notes":"補足"}')).toThrow(
      InvalidAiResponseError,
    )
  })

  it('rejects a non-string notes item', () => {
    expect(() => parseAiOutput('{"message":"回答","proposedCode":null,"notes":["補足",123]}')).toThrow(
      InvalidAiResponseError,
    )
  })

  it('rejects output with explanatory text outside JSON', () => {
    expect(() =>
      parseAiOutput('以下が回答です。\n{"message":"回答","proposedCode":null,"notes":[]}'),
    ).toThrow(InvalidAiResponseError)
  })

  it('rejects non-JSON output', () => {
    expect(() => parseAiOutput('JSONではない応答')).toThrow(InvalidAiResponseError)
  })
})
