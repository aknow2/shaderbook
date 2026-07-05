// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { InvalidCodexResponseError } from './errors.ts'
import { parseCodexOutput } from './parseCodexOutput.ts'

describe('parseCodexOutput', () => {
  it('parses plain JSON', () => {
    expect(
      parseCodexOutput('{"message":"回答","proposedCode":"fn main() {}","notes":[]}'),
    ).toEqual({
      message: '回答',
      proposedCode: 'fn main() {}',
      notes: [],
    })
  })

  it('strips a json code fence wrapping the whole response', () => {
    expect(
      parseCodexOutput('```json\n{"message":"回答","proposedCode":null,"notes":[]}\n```'),
    ).toEqual({
      message: '回答',
      proposedCode: null,
      notes: [],
    })
  })

  it('strips an unlabeled code fence wrapping the whole response', () => {
    expect(parseCodexOutput('```\n{"message":"回答","proposedCode":null,"notes":[]}\n```')).toEqual({
      message: '回答',
      proposedCode: null,
      notes: [],
    })
  })

  it('does not strip code fences inside the response body', () => {
    const parsed = parseCodexOutput(
      '{"message":"本文中の```wgsl\\\\nfn main() {}\\\\n```は残す","proposedCode":null,"notes":[]}',
    )

    expect(parsed.message).toBe('本文中の```wgsl\\nfn main() {}\\n```は残す')
  })

  it('returns a response with an empty message as valid', () => {
    expect(parseCodexOutput('{"message":"","proposedCode":null,"notes":[]}')).toEqual({
      message: '',
      proposedCode: null,
      notes: [],
    })
  })

  it('returns a response with proposedCode null as valid', () => {
    expect(parseCodexOutput('{"message":"回答","proposedCode":null,"notes":[]}')).toEqual({
      message: '回答',
      proposedCode: null,
      notes: [],
    })
  })

  it('returns a response with a string notes array as valid', () => {
    expect(
      parseCodexOutput('{"message":"回答","proposedCode":null,"notes":["補足1","補足2"]}'),
    ).toEqual({
      message: '回答',
      proposedCode: null,
      notes: ['補足1', '補足2'],
    })
  })

  it('rejects a missing message', () => {
    expect(() => parseCodexOutput('{"proposedCode":null,"notes":[]}')).toThrow(
      InvalidCodexResponseError,
    )
  })

  it('rejects an invalid proposedCode type', () => {
    expect(() =>
      parseCodexOutput('{"message":"回答","proposedCode":123,"notes":[]}'),
    ).toThrow(InvalidCodexResponseError)
  })

  it('rejects an empty proposedCode string', () => {
    expect(() => parseCodexOutput('{"message":"回答","proposedCode":"","notes":[]}')).toThrow(
      InvalidCodexResponseError,
    )
  })

  it('rejects an invalid notes type', () => {
    expect(() =>
      parseCodexOutput('{"message":"回答","proposedCode":null,"notes":"補足"}'),
    ).toThrow(InvalidCodexResponseError)
  })

  it('rejects non-JSON output', () => {
    expect(() => parseCodexOutput('JSONではない応答')).toThrow(InvalidCodexResponseError)
  })
})
