import { InvalidCodexResponseError } from './errors.ts'

export type ParsedCodexOutput = {
  message: string
  proposedCode: string | null
  notes: string[]
}

export function parseCodexOutput(rawOutput: string): ParsedCodexOutput {
  const withoutFence = stripWrappingCodeFence(rawOutput.trim())
  let parsed: unknown

  try {
    parsed = JSON.parse(withoutFence)
  } catch {
    throw new InvalidCodexResponseError()
  }

  if (!isObject(parsed)) {
    throw new InvalidCodexResponseError()
  }

  const message = parsed.message
  const proposedCode = parsed.proposedCode
  const notes = parsed.notes

  if (typeof message !== 'string') {
    throw new InvalidCodexResponseError()
  }

  if (!(typeof proposedCode === 'string' || proposedCode === null)) {
    throw new InvalidCodexResponseError()
  }

  if (proposedCode === '') {
    throw new InvalidCodexResponseError()
  }

  if (!Array.isArray(notes) || notes.some((note) => typeof note !== 'string')) {
    throw new InvalidCodexResponseError()
  }

  return { message, proposedCode, notes }
}

function stripWrappingCodeFence(output: string): string {
  const match = output.match(/^```(?:json)?[ \t]*\r?\n([\s\S]*)\r?\n```[ \t]*$/i)

  return match ? match[1] : output
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
