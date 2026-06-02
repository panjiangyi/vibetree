import pty from 'node-pty'
import type { IPty } from 'node-pty'
import type WebSocket from 'ws'
import { RingBuffer } from './ring-buffer.js'
import type { PtyRuntimeSession, CreatePtyInput } from './pty.types.js'

function sendWs(ws: WebSocket, data: unknown): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data))
  }
}

export function createPtyManager() {
  const sessions = new Map<string, PtyRuntimeSession>()

  return {
    has(terminalId: string): boolean {
      return sessions.has(terminalId)
    },

    get(terminalId: string): PtyRuntimeSession | undefined {
      return sessions.get(terminalId)
    },

    create(input: CreatePtyInput): PtyRuntimeSession {
      const ptyProcess: IPty = pty.spawn(input.shell, [], {
        name: 'xterm-256color',
        cols: input.cols,
        rows: input.rows,
        cwd: input.cwd,
        env: {
          ...process.env,
          ...input.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          VIBETREE: '1',
          VIBETREE_TERMINAL_ID: input.terminalId,
        },
      })

      const outputBuffer = new RingBuffer<string>(5000)

      const runtime: PtyRuntimeSession = {
        terminalId: input.terminalId,
        pty: ptyProcess,
        outputBuffer,
        clients: new Set(),
        createdAt: new Date().toISOString(),
      }

      ptyProcess.onData((data) => {
        outputBuffer.push(data)
        for (const client of runtime.clients) {
          sendWs(client, {
            type: 'output',
            terminalId: input.terminalId,
            data,
          })
        }
      })

      sessions.set(input.terminalId, runtime)

      return runtime
    },

    write(terminalId: string, data: string): void {
      const runtime = sessions.get(terminalId)
      if (runtime) {
        runtime.pty.write(data)
      }
    },

    resize(terminalId: string, cols: number, rows: number): void {
      const runtime = sessions.get(terminalId)
      if (runtime) {
        runtime.pty.resize(cols, rows)
      }
    },

    kill(terminalId: string): void {
      const runtime = sessions.get(terminalId)
      if (runtime) {
        runtime.pty.kill()
        sessions.delete(terminalId)
      }
    },

    attachClient(terminalId: string, ws: WebSocket): void {
      const runtime = sessions.get(terminalId)
      if (runtime) {
        runtime.clients.add(ws)
      }
    },

    detachClient(terminalId: string, ws: WebSocket): void {
      const runtime = sessions.get(terminalId)
      if (runtime) {
        runtime.clients.delete(ws)
      }
    },

    detachClientFromAll(ws: WebSocket): void {
      for (const runtime of sessions.values()) {
        runtime.clients.delete(ws)
      }
    },

    onExit(terminalId: string, callback: (exitCode: number) => void): void {
      const runtime = sessions.get(terminalId)
      if (runtime) {
        runtime.pty.onExit(({ exitCode }) => {
          sessions.delete(terminalId)
          callback(exitCode)
        })
      }
    },
  }
}
