import pty from 'node-pty'
import type { IPty } from 'node-pty'
import type WebSocket from 'ws'
import { buildShellLaunchConfig } from './compact-prompt.js'
import { OutputReplayBuffer } from './output-replay-buffer.js'
import type { PtyRuntimeSession, CreatePtyInput } from './pty.types.js'

const OUTPUT_REPLAY_BUFFER_BYTES = 16 * 1024 * 1024
const DEVICE_ATTRIBUTE_SEQUENCE_PATTERN = /\x1b(?:Z|\[(?:[?>]?[0-9;]*)?c)/g

function sendWs(ws: WebSocket, data: unknown): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data))
  }
}

function stripDeviceAttributeSequences(data: string): string {
  return data.replace(DEVICE_ATTRIBUTE_SEQUENCE_PATTERN, '')
}

export type PtyManager = ReturnType<typeof createPtyManager>

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
      const launchConfig =
        input.launch === 'shell'
          ? buildShellLaunchConfig(input.shell)
          : { shell: input.file, args: input.args, env: {} }

      const ptyProcess: IPty = pty.spawn(launchConfig.shell, launchConfig.args, {
        name: 'xterm-256color',
        cols: input.cols,
        rows: input.rows,
        cwd: input.cwd,
        env: {
          ...process.env,
          ...input.env,
          ...launchConfig.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          VIBETREE: '1',
          VIBETREE_TERMINAL_ID: input.terminalId,
        },
      })

      const outputBuffer = new OutputReplayBuffer(OUTPUT_REPLAY_BUFFER_BYTES)

      const runtime: PtyRuntimeSession = {
        terminalId: input.terminalId,
        pty: ptyProcess,
        outputBuffer,
        clients: new Set(),
        createdAt: new Date().toISOString(),
      }

      ptyProcess.onData((data) => {
        // Live clients get full raw data (DA responses are needed for the current xterm session)
        for (const client of runtime.clients) {
          sendWs(client, {
            type: 'output',
            terminalId: input.terminalId,
            data,
          })
        }
        // Strip device-attribute requests/responses before buffering. Replaying
        // old DA queries makes xterm answer them again on every tab mount, and
        // those stale answers can show up as literal "1;2c" in the shell.
        const replayData = stripDeviceAttributeSequences(data)
        if (replayData) outputBuffer.push(replayData)
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
