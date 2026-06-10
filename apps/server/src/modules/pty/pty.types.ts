import type { IPty } from 'node-pty'
import type WebSocket from 'ws'
import type { OutputReplayBuffer } from './output-replay-buffer.js'

export type PtyRuntimeSession = {
  terminalId: string
  pty: IPty
  outputBuffer: OutputReplayBuffer
  clients: Set<WebSocket>
  createdAt: string
}

export type CreatePtyInput = {
  terminalId: string
  shell: string
  cwd: string
  cols: number
  rows: number
  env: Record<string, string>
}
