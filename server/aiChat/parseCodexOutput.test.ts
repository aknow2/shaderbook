// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { InvalidAiResponseError, InvalidCodexResponseError } from './errors.ts'
import { parseAiOutput, type ParsedAiOutput } from './parseAiOutput.ts'
import { parseCodexOutput, type ParsedCodexOutput } from './parseCodexOutput.ts'

describe('parseCodexOutput', () => {
  it('returns the same parsed result as parseAiOutput', () => {
    const rawOutput = '```json\n{"message":"回答","proposedCode":"fn main() {}","notes":["補足"]}\n```'

    expect(parseCodexOutput(rawOutput)).toEqual(parseAiOutput(rawOutput))
  })

  it('throws the compatible invalid response error alias', () => {
    expect(() => parseCodexOutput('JSONではない応答')).toThrow(InvalidAiResponseError)
    expect(() => parseCodexOutput('JSONではない応答')).toThrow(InvalidCodexResponseError)
  })

  it('keeps ParsedCodexOutput as a compatible type alias', () => {
    const parsedAiOutput: ParsedAiOutput = {
      message: '回答',
      proposedCode: null,
      notes: [],
    }
    const parsedCodexOutput: ParsedCodexOutput = parsedAiOutput

    expect(parsedCodexOutput).toEqual(parsedAiOutput)
  })
})
