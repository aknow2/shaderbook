export const SHADERBOOK_SERVER_HOST = '127.0.0.1'
export const SHADERBOOK_SERVER_DEFAULT_PORT = 8787

export function getShaderbookServerPort(
  environment: NodeJS.ProcessEnv = process.env,
): number {
  const rawPort = environment.AI_CHAT_PORT

  if (rawPort === undefined || rawPort === '') {
    return SHADERBOOK_SERVER_DEFAULT_PORT
  }

  const port = Number(rawPort)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('AI_CHAT_PORT must be an integer between 1 and 65535.')
  }

  return port
}

export function getShaderbookServerOrigin(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  return `http://${SHADERBOOK_SERVER_HOST}:${getShaderbookServerPort(environment)}`
}
