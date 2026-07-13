import type { ChildProcessWithoutNullStreams } from 'node:child_process'

export type RegisteredRequestState = 'running' | 'canceling' | 'timedOut'

export type RequestChildProcess = Pick<ChildProcessWithoutNullStreams, 'kill'>

export type RegisteredRequest = {
  requestId: string
  child: RequestChildProcess
  state: RegisteredRequestState
  forceKillTimer: ReturnType<typeof setTimeout> | null
}

export type RequestRegistry = {
  register: (requestId: string, child: RequestChildProcess) => boolean
  getState: (requestId: string, child: RequestChildProcess) => RegisteredRequestState | null
  markTimedOut: (requestId: string, child: RequestChildProcess) => void
  cancel: (requestId: string) => boolean
  cancelAll: () => void
  unregister: (requestId: string, child: RequestChildProcess) => void
}

const FORCE_KILL_DELAY_MS = 2000

export function createRequestRegistry(): RequestRegistry {
  const requests = new Map<string, RegisteredRequest>()

  const beginForcedShutdown = (
    entry: RegisteredRequest,
    nextState: Exclude<RegisteredRequestState, 'running'>,
  ) => {
    if (entry.state !== 'running') {
      return
    }

    entry.state = nextState
    entry.child.kill('SIGTERM')
    entry.forceKillTimer = setTimeout(() => {
      entry.child.kill('SIGKILL')
      entry.forceKillTimer = null
    }, FORCE_KILL_DELAY_MS)
  }

  return {
    register(requestId, child) {
      if (requests.has(requestId)) {
        return false
      }

      requests.set(requestId, {
        requestId,
        child,
        state: 'running',
        forceKillTimer: null,
      })

      return true
    },

    getState(requestId, child) {
      const entry = requests.get(requestId)

      if (!entry || entry.child !== child) {
        return null
      }

      return entry.state
    },

    markTimedOut(requestId, child) {
      const entry = requests.get(requestId)

      if (!entry || entry.child !== child) {
        return
      }

      beginForcedShutdown(entry, 'timedOut')
    },

    cancel(requestId) {
      const entry = requests.get(requestId)

      if (!entry) {
        return true
      }

      beginForcedShutdown(entry, 'canceling')

      return true
    },

    cancelAll() {
      for (const entry of requests.values()) {
        beginForcedShutdown(entry, 'canceling')
      }
    },

    unregister(requestId, child) {
      const entry = requests.get(requestId)

      if (!entry || entry.child !== child) {
        return
      }

      if (entry.forceKillTimer) {
        clearTimeout(entry.forceKillTimer)
      }

      requests.delete(requestId)
    },
  }
}
