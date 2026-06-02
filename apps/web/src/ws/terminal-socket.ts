import type { TerminalClientMessage, TerminalServerMessage } from '@vibetree/shared'

type Listener = (message: TerminalServerMessage) => void

class TerminalSocket {
  private ws: WebSocket | null = null
  private listeners = new Set<Listener>()
  private queue: TerminalClientMessage[] = []
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return

    const wsBase = import.meta.env.VITE_API_BASE?.replace('http', 'ws') ?? 'ws://127.0.0.1:3767'
    const url = `${wsBase}/ws/terminal`

    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      for (const message of this.queue) {
        this.send(message)
      }
      this.queue = []
    }

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as TerminalServerMessage
      for (const listener of this.listeners) {
        listener(message)
      }
    }

    this.ws.onclose = () => {
      this.ws = null
      this.reconnectTimeout = setTimeout(() => this.connect(), 1000)
    }

    this.ws.onerror = () => {
      this.ws?.close()
    }
  }

  send(message: TerminalClientMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.queue.push(message)
      this.connect()
      return
    }

    this.ws.send(JSON.stringify(message))
  }

  attach(input: { terminalId: string; cols: number; rows: number }) {
    this.send({ type: 'attach', ...input })
  }

  input(input: { terminalId: string; data: string }) {
    this.send({ type: 'input', ...input })
  }

  resize(input: { terminalId: string; cols: number; rows: number }) {
    this.send({ type: 'resize', ...input })
  }

  close(terminalId: string) {
    this.send({ type: 'close', terminalId })
  }

  onMessage(listener: Listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
    }
    this.ws?.close()
    this.ws = null
  }
}

export const terminalSocket = new TerminalSocket()
