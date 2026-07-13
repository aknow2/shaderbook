import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'

type StartedProcess = ReturnType<typeof spawn>

const startedProcesses: StartedProcess[] = []

afterEach(async () => {
  await Promise.all(startedProcesses.splice(0).map(stopProcess))
})

describe('built Shaderbook server', () => {
  it('serves the frontend and AI chat API from one process', async () => {
    const port = await findAvailablePort()
    const process = spawn('npm', ['run', 'start'], {
      cwd: globalThis.process.cwd(),
      env: {
        ...globalThis.process.env,
        AI_CHAT_PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    startedProcesses.push(process)

    const origin = `http://127.0.0.1:${port}`
    await waitForServer(origin, process)

    const pageResponse = await fetch(`${origin}/`)
    expect(pageResponse.status).toBe(200)
    expect(pageResponse.headers.get('content-type')).toContain('text/html')
    expect(await pageResponse.text()).toContain('<div id="root"></div>')

    const cancelResponse = await fetch(`${origin}/api/ai-chat/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: 'e2e-request' }),
    })

    expect(cancelResponse.status).toBe(200)
    expect(await cancelResponse.json()).toEqual({
      requestId: 'e2e-request',
      canceled: true,
    })

    await stopTrackedProcess(process)
    await waitForServerToStop(origin)
  })

  it('reaches the standalone API through the Vite development proxy', async () => {
    const apiPort = await findAvailablePort()
    const apiProcess = startNpmProcess(['run', 'start'], { AI_CHAT_PORT: String(apiPort) })
    const apiOrigin = `http://127.0.0.1:${apiPort}`
    await waitForServer(apiOrigin, apiProcess)

    const webPort = await findAvailablePort()
    const webProcess = startNpmProcess(
      [
        'run',
        'dev:web',
        '--',
        '--host',
        '127.0.0.1',
        '--port',
        String(webPort),
        '--strictPort',
      ],
      { AI_CHAT_PORT: String(apiPort) },
    )
    const webOrigin = `http://127.0.0.1:${webPort}`
    await waitForServer(webOrigin, webProcess)

    const response = await fetch(`${webOrigin}/api/ai-chat/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: 'proxy-request' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      requestId: 'proxy-request',
      canceled: true,
    })

    await stopTrackedProcess(webProcess)
    await stopTrackedProcess(apiProcess)
    await waitForServerToStop(apiOrigin)
  })
})

function startNpmProcess(args: string[], environment: NodeJS.ProcessEnv): StartedProcess {
  const child = spawn('npm', args, {
    cwd: globalThis.process.cwd(),
    env: {
      ...globalThis.process.env,
      ...environment,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  startedProcesses.push(child)
  return child
}

async function findAvailablePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Could not allocate an E2E port.'))
        return
      }

      const { port } = address
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve(port)
      })
    })
  })
}

async function waitForServer(origin: string, child: StartedProcess): Promise<void> {
  let output = ''
  child.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString()
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    output += chunk.toString()
  })

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited before becoming ready.\n${output}`)
    }

    try {
      const response = await fetch(`${origin}/`)
      await response.body?.cancel()
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  throw new Error(`Server did not become ready.\n${output}`)
}

async function stopProcess(child: StartedProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }

  child.kill('SIGTERM')
  await Promise.race([
    new Promise<void>((resolve) => child.once('exit', () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
  ])

  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
  }
}

async function stopTrackedProcess(child: StartedProcess): Promise<void> {
  const index = startedProcesses.indexOf(child)
  if (index >= 0) {
    startedProcesses.splice(index, 1)
  }
  await stopProcess(child)
}

async function waitForServerToStop(origin: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${origin}/`)
      await response.body?.cancel()
      await new Promise((resolve) => setTimeout(resolve, 50))
    } catch {
      return
    }
  }

  throw new Error(`Server at ${origin} remained reachable after shutdown.`)
}
