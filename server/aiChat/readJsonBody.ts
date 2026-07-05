import type { IncomingMessage } from 'node:http'
import { AiChatServerError } from './errors.ts'

export const AI_CHAT_BODY_MAX_BYTES = 8 * 1024 * 1024

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const body = await readBody(request)

  try {
    return JSON.parse(body) as unknown
  } catch {
    throw new AiChatServerError('INVALID_REQUEST')
  }
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let totalBytes = 0
    let rejected = false

    request.on('data', (chunk: Buffer | string) => {
      if (rejected) {
        return
      }

      const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
      totalBytes += buffer.byteLength

      if (totalBytes > AI_CHAT_BODY_MAX_BYTES) {
        rejected = true
        reject(new AiChatServerError('INVALID_REQUEST'))
        request.destroy()
        return
      }

      chunks.push(buffer)
    })

    request.on('end', () => {
      if (!rejected) {
        resolve(Buffer.concat(chunks).toString('utf8'))
      }
    })

    request.on('error', () => {
      if (!rejected) {
        reject(new AiChatServerError('INVALID_REQUEST'))
      }
    })
  })
}
