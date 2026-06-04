import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { terminalSocket } from '../../ws/terminal-socket.js'
import { useTerminalStore } from '../../stores/terminal.store.js'
import { useThemeStore } from '../../stores/theme.store.js'

type Props = {
  terminalId: string
}

export function XtermView({ terminalId }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)

  useEffect(() => {
    if (!containerRef.current) return

    const theme =
      resolvedTheme === 'dark'
        ? {
            background: '#090b0f',
            foreground: '#edf2f7',
            cursor: '#93c5fd',
          }
        : {
            background: '#f7f9fc',
            foreground: '#162031',
            cursor: '#2563eb',
          }

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
      theme,
      scrollback: 10000,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(containerRef.current)

    // Initial fit
    requestAnimationFrame(() => {
      fitAddon.fit()
      terminalSocket.attach({
        terminalId,
        cols: term.cols,
        rows: term.rows,
      })
    })

    // Handle input
    const disposable = term.onData((data) => {
      terminalSocket.input({ terminalId, data })
    })

    termRef.current = term
    fitAddonRef.current = fitAddon

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      terminalSocket.resize({
        terminalId,
        cols: term.cols,
        rows: term.rows,
      })
    })

    resizeObserver.observe(containerRef.current)

    // Handle messages
    const unsubscribe = terminalSocket.onMessage((message) => {
      if (message.terminalId !== terminalId) return

      if (message.type === 'output') {
        term.write(message.data)
      }

      if (message.type === 'exit') {
        term.writeln('')
        term.writeln(`\x1b[33mTerminal exited with code ${message.exitCode ?? ''}\x1b[0m`)
      }
    })

    term.focus()

    return () => {
      unsubscribe()
      resizeObserver.disconnect()
      disposable.dispose()
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
    }
  }, [resolvedTheme, terminalId])

  return <div ref={containerRef} className="h-full w-full" />
}
