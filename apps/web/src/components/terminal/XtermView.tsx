import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { terminalSocket } from '../../ws/terminal-socket.js'
import { useThemeStore } from '../../stores/theme.store.js'

type Props = {
  terminalId: string
}

function copyText(text: string): void {
  if (!text) return

  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text).catch(() => fallbackCopyText(text))
    return
  }

  fallbackCopyText(text)
}

function fallbackCopyText(text: string): void {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

export function XtermView({ terminalId }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const atBottomRef = useRef(true)
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)

  useEffect(() => {
    if (!containerRef.current) return

    const theme =
      resolvedTheme === 'dark'
        ? {
            background: '#090b0f',
            foreground: '#edf2f7',
            cursor: '#93c5fd',
            selectionBackground: '#2563eb',
            selectionForeground: '#ffffff',
            selectionInactiveBackground: '#1d4ed8',
          }
        : {
            background: '#f7f9fc',
            foreground: '#162031',
            cursor: '#2563eb',
            selectionBackground: '#93c5fd',
            selectionForeground: '#08111f',
            selectionInactiveBackground: '#bfdbfe',
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

    const scrollToBottom = () => {
      term.scrollToBottom()
      atBottomRef.current = true
    }

    const fitResizeAndMaybeScroll = (forceScroll = false) => {
      const shouldScroll = forceScroll || atBottomRef.current
      requestAnimationFrame(() => {
        fitAddon.fit()
        terminalSocket.resize({
          terminalId,
          cols: term.cols,
          rows: term.rows,
        })

        if (shouldScroll) {
          requestAnimationFrame(scrollToBottom)
        }
      })
    }

    term.attachCustomKeyEventHandler((event) => {
      const key = event.key.toLowerCase()
      const isCopyShortcut =
        event.type === 'keydown' &&
        key === 'c' &&
        ((event.ctrlKey && event.shiftKey && !event.altKey) ||
          (event.altKey && !event.ctrlKey && !event.metaKey))

      if (!isCopyShortcut) {
        return true
      }

      event.preventDefault()
      event.stopPropagation()
      copyText(term.getSelection())
      return false
    })

    requestAnimationFrame(() => {
      fitAddon.fit()
      terminalSocket.attach({
        terminalId,
        cols: term.cols,
        rows: term.rows,
      })
      requestAnimationFrame(scrollToBottom)
    })

    // Handle input
    const disposable = term.onData((data) => {
      terminalSocket.input({ terminalId, data })
    })

    termRef.current = term
    fitAddonRef.current = fitAddon

    const resizeObserver = new ResizeObserver(() => {
      fitResizeAndMaybeScroll()
    })

    resizeObserver.observe(containerRef.current)

    const scrollDisposable = term.onScroll(() => {
      const buffer = term.buffer.active
      atBottomRef.current = buffer.baseY - buffer.viewportY <= 1
    })

    const writeParsedDisposable = term.onWriteParsed(() => {
      if (atBottomRef.current) {
        requestAnimationFrame(scrollToBottom)
      }
    })

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fitResizeAndMaybeScroll()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

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
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      resizeObserver.disconnect()
      scrollDisposable.dispose()
      writeParsedDisposable.dispose()
      disposable.dispose()
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
    }
  }, [resolvedTheme, terminalId])

  return <div ref={containerRef} className="h-full w-full" />
}
