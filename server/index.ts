import { createShaderbookServer } from './app.ts'
import {
  getShaderbookServerPort,
  SHADERBOOK_SERVER_HOST,
} from './config.ts'

const port = getShaderbookServerPort()
const { httpServer, registry } = createShaderbookServer()
let shuttingDown = false

httpServer.on('error', (error) => {
  console.error('Shaderbook server failed.', error)
  process.exitCode = 1
})

httpServer.listen(port, SHADERBOOK_SERVER_HOST, () => {
  console.log(`Shaderbook server listening on http://${SHADERBOOK_SERVER_HOST}:${port}`)
})

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) {
    return
  }

  shuttingDown = true
  console.log(`Received ${signal}; shutting down Shaderbook server.`)
  registry.cancelAll()
  httpServer.close((error) => {
    if (error) {
      console.error('Shaderbook server shutdown failed.', error)
      process.exit(1)
    }

    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
