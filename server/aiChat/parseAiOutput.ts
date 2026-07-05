import { InvalidAiResponseError } from './errors.ts'

export type ParsedAiOutput = {
  message: string
  proposedCode: string | null
  notes: string[]
}

export function parseAiOutput(rawOutput: string): ParsedAiOutput {
  const withoutFence = stripWrappingCodeFence(rawOutput.trim())
  let parsed: unknown

  try {
    parsed = JSON.parse(withoutFence)
  } catch {
    throw new InvalidAiResponseError()
  }

  if (!isObject(parsed)) {
    throw new InvalidAiResponseError()
  }

  const message = parsed.message
  const proposedCode = parsed.proposedCode
  const notes = parsed.notes

  if (typeof message !== 'string') {
    throw new InvalidAiResponseError()
  }

  if (!(typeof proposedCode === 'string' || proposedCode === null)) {
    throw new InvalidAiResponseError()
  }

  if (proposedCode === '') {
    throw new InvalidAiResponseError()
  }

  if (!Array.isArray(notes) || notes.some((note) => typeof note !== 'string')) {
    throw new InvalidAiResponseError()
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
