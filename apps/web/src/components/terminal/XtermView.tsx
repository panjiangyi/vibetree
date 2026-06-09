import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { logInputEvent } from '../../debug/input-event-logger.js'
import { terminalSocket } from '../../ws/terminal-socket.js'
import { useThemeStore } from '../../stores/theme.store.js'

type Props = {
  terminalId: string
  fontSize?: number
  onActionsChange?: (actions: TerminalViewActions | null) => void
}

type RecentInputTextChunk = {
  data: string
  timestamp: number
}

export type TerminalViewActions = {
  copySelection: () => void
  focus: () => void
}

const IME_ECHO_SUPPRESSION_MS = 500
const RECENT_XTERM_DATA_WINDOW_MS = 120
const RECENT_INPUT_TEXT_WINDOW_MS = 3000
const MAX_RECENT_INPUT_TEXT_LENGTH = 300

function copyText(text: string): boolean {
  if (!text) return false

  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text).catch(() => fallbackCopyText(text))
    return true
  }

  fallbackCopyText(text)
  return true
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

function consumePendingImeEcho(data: string, pending: string): string | null {
  if (!pending) return null

  if (pending.startsWith(data)) {
    return pending.slice(data.length)
  }

  if (data.startsWith(pending)) {
    return ''
  }

  if (pending.includes(data)) {
    return pending
  }

  return null
}

function getComposedText(textarea: HTMLTextAreaElement, startValue: string, fallback: string): string {
  if (textarea.value.startsWith(startValue)) {
    return textarea.value.slice(startValue.length)
  }

  return fallback
}

function isCommittedImeInput(event: InputEvent): boolean {
  return (
    event.inputType === 'insertText' ||
    event.inputType === 'insertFromComposition' ||
    (event.inputType !== 'insertCompositionText' && event.isComposing === false)
  )
}

function containsCommittedCjkText(data: string): boolean {
  return /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/u.test(data)
}

function getCodePoints(value: string | null | undefined): string[] {
  if (!value) return []

  return Array.from(value).map((char) => `U+${char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')}`)
}

function getCharacterLength(value: string): number {
  return Array.from(value).length
}

function countSuffixChunks(chunks: RecentInputTextChunk[], data: string): number {
  const recentText = chunks.map((chunk) => chunk.data).join('')
  if (!recentText.endsWith(data)) return 0

  const suffixStart = recentText.length - data.length
  let offset = 0
  let count = 0

  for (const chunk of chunks) {
    const chunkEnd = offset + chunk.data.length
    if (chunkEnd > suffixStart && offset < recentText.length) {
      count += 1
    }
    offset = chunkEnd
  }

  return count
}

function describeElement(element: EventTarget | Element | null | undefined): string | undefined {
  if (!(element instanceof Element)) return undefined

  const id = element.id ? `#${element.id}` : ''
  const classes = Array.from(element.classList).map((className) => `.${className}`).join('')
  return `${element.tagName.toLowerCase()}${id}${classes}`
}

export function XtermView({ terminalId, fontSize = 14, onActionsChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const atBottomRef = useRef(true)
  const isComposingRef = useRef(false)
  const compositionStartValueRef = useRef('')
  const compositionTextRef = useRef('')
  const imeEchoDataRef = useRef('')
  const imeEchoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const compositionEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recentXtermDataRef = useRef('')
  const recentXtermDataTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recentInputTextChunksRef = useRef<RecentInputTextChunk[]>([])
  const recentInputTextTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
      fontSize,
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

    const textarea = term.textarea
    if (!textarea) {
      return
    }

    const clearImeEchoData = () => {
      imeEchoDataRef.current = ''
      if (imeEchoTimeoutRef.current) {
        clearTimeout(imeEchoTimeoutRef.current)
        imeEchoTimeoutRef.current = null
      }
    }

    const suppressImeEchoData = (data: string) => {
      imeEchoDataRef.current = data
      if (imeEchoTimeoutRef.current) {
        clearTimeout(imeEchoTimeoutRef.current)
      }
      imeEchoTimeoutRef.current = setTimeout(clearImeEchoData, IME_ECHO_SUPPRESSION_MS)
    }

    const clearRecentXtermData = () => {
      recentXtermDataRef.current = ''
      if (recentXtermDataTimeoutRef.current) {
        clearTimeout(recentXtermDataTimeoutRef.current)
        recentXtermDataTimeoutRef.current = null
      }
    }

    const rememberRecentXtermData = (data: string) => {
      recentXtermDataRef.current += data
      if (recentXtermDataTimeoutRef.current) {
        clearTimeout(recentXtermDataTimeoutRef.current)
      }
      recentXtermDataTimeoutRef.current = setTimeout(clearRecentXtermData, RECENT_XTERM_DATA_WINDOW_MS)
    }

    const consumeRecentXtermData = (data: string): boolean => {
      const remaining = consumePendingImeEcho(data, recentXtermDataRef.current)
      if (remaining == null) return false
      recentXtermDataRef.current = remaining
      return true
    }

    const clearRecentInputText = () => {
      recentInputTextChunksRef.current = []
      if (recentInputTextTimeoutRef.current) {
        clearTimeout(recentInputTextTimeoutRef.current)
        recentInputTextTimeoutRef.current = null
      }
    }

    const pruneRecentInputText = () => {
      const cutoff = Date.now() - RECENT_INPUT_TEXT_WINDOW_MS
      const freshChunks = recentInputTextChunksRef.current.filter((chunk) => chunk.timestamp >= cutoff && chunk.data)
      const trimmedChunks: RecentInputTextChunk[] = []
      let remainingLength = MAX_RECENT_INPUT_TEXT_LENGTH

      for (let index = freshChunks.length - 1; index >= 0 && remainingLength > 0; index -= 1) {
        const chunk = freshChunks[index]
        const chars = Array.from(chunk.data)
        const data =
          chars.length > remainingLength
            ? chars.slice(chars.length - remainingLength).join('')
            : chunk.data

        trimmedChunks.unshift({
          data,
          timestamp: chunk.timestamp,
        })
        remainingLength -= Math.min(chars.length, remainingLength)
      }

      recentInputTextChunksRef.current = trimmedChunks
    }

    const rememberInputText = (data: string) => {
      if (!containsCommittedCjkText(data)) return

      pruneRecentInputText()
      recentInputTextChunksRef.current.push({
        data,
        timestamp: Date.now(),
      })
      pruneRecentInputText()

      if (recentInputTextTimeoutRef.current) {
        clearTimeout(recentInputTextTimeoutRef.current)
      }
      recentInputTextTimeoutRef.current = setTimeout(clearRecentInputText, RECENT_INPUT_TEXT_WINDOW_MS)
    }

    const getReplayedInputTextReason = (data: string): string | null => {
      if (!data || !containsCommittedCjkText(data)) return null

      pruneRecentInputText()
      const chunks = recentInputTextChunksRef.current
      if (!chunks.length) return null

      const suffixChunkCount = countSuffixChunks(chunks, data)
      if (suffixChunkCount > 1) {
        return `recent-suffix-spans-${suffixChunkCount}-chunks`
      }

      const lastChunk = chunks.at(-1)
      if (
        lastChunk &&
        getCharacterLength(data) >= 4 &&
        getCharacterLength(data) > getCharacterLength(lastChunk.data) &&
        chunks.map((chunk) => chunk.data).join('').endsWith(data)
      ) {
        return 'recent-suffix-larger-than-last-chunk'
      }

      return null
    }

    const getDebugState = () => ({
      isComposing: isComposingRef.current,
      compositionStartValue: compositionStartValueRef.current,
      compositionText: compositionTextRef.current,
      imeEchoData: imeEchoDataRef.current,
      recentInputText: recentInputTextChunksRef.current.map((chunk) => chunk.data).join(''),
    })

    const logEvent = (source: string, event: Event) => {
      const inputEvent = event instanceof InputEvent ? event : null
      const keyboardEvent = event instanceof KeyboardEvent ? event : null
      const compositionEvent = event instanceof CompositionEvent ? event : null
      const clipboardEvent = event instanceof ClipboardEvent ? event : null
      const data = inputEvent?.data ?? compositionEvent?.data ?? clipboardEvent?.clipboardData?.getData('text/plain') ?? null

      logInputEvent({
        terminalId,
        source,
        type: event.type,
        phase: event.eventPhase === Event.CAPTURING_PHASE ? 'capture' : event.eventPhase === Event.BUBBLING_PHASE ? 'bubble' : 'target',
        target: describeElement(event.target),
        activeElement: describeElement(document.activeElement),
        timeStamp: event.timeStamp,
        value: textarea.value,
        valueLength: textarea.value.length,
        selectionStart: textarea.selectionStart,
        selectionEnd: textarea.selectionEnd,
        data,
        dataCodePoints: getCodePoints(data),
        inputType: inputEvent?.inputType,
        isComposing: inputEvent?.isComposing ?? keyboardEvent?.isComposing,
        key: keyboardEvent?.key,
        code: keyboardEvent?.code,
        keyCode: keyboardEvent?.keyCode,
        which: keyboardEvent?.which,
        charCode: keyboardEvent?.charCode,
        repeat: keyboardEvent?.repeat,
        ctrlKey: keyboardEvent?.ctrlKey,
        altKey: keyboardEvent?.altKey,
        shiftKey: keyboardEvent?.shiftKey,
        metaKey: keyboardEvent?.metaKey,
        bubbles: event.bubbles,
        cancelable: event.cancelable,
        composed: event.composed,
        defaultPrevented: event.defaultPrevented,
        appState: getDebugState(),
      })
    }

    const logAppData = (source: string, data: string) => {
      logInputEvent({
        terminalId,
        source,
        type: 'app-data',
        target: 'terminal',
        activeElement: describeElement(document.activeElement),
        value: textarea.value,
        valueLength: textarea.value.length,
        selectionStart: textarea.selectionStart,
        selectionEnd: textarea.selectionEnd,
        data,
        dataCodePoints: getCodePoints(data),
        appState: getDebugState(),
      })
    }

    const sendCommittedImeText = (data: string) => {
      if (!data) return

      if (compositionEndTimeoutRef.current) {
        clearTimeout(compositionEndTimeoutRef.current)
        compositionEndTimeoutRef.current = null
      }

      logAppData('app.sendCommittedImeText', data)
      terminalSocket.input({ terminalId, data })
      rememberInputText(data)
      suppressImeEchoData(data)
      compositionStartValueRef.current = textarea.value
      compositionTextRef.current = ''
      isComposingRef.current = false
    }

    const sendInputEventText = (data: string) => {
      if (!data || consumeRecentXtermData(data)) return

      const replayReason = getReplayedInputTextReason(data)
      if (replayReason) {
        logInputEvent({
          terminalId,
          source: 'app.inputEventText',
          type: 'replay-suppressed',
          target: 'terminal',
          activeElement: describeElement(document.activeElement),
          value: textarea.value,
          valueLength: textarea.value.length,
          selectionStart: textarea.selectionStart,
          selectionEnd: textarea.selectionEnd,
          data,
          dataCodePoints: getCodePoints(data),
          appState: {
            ...getDebugState(),
            replayReason,
          },
        })
        suppressImeEchoData(data)
        return
      }

      logAppData('app.inputEventText', data)
      terminalSocket.input({ terminalId, data })
      rememberInputText(data)
      suppressImeEchoData(data)
    }

    const handleBeforeInput = (event: Event) => {
      logEvent('textarea', event)
      const inputEvent = event as InputEvent
      if (
        !isComposingRef.current &&
        (inputEvent.isComposing || inputEvent.inputType === 'insertCompositionText')
      ) {
        isComposingRef.current = true
        compositionStartValueRef.current = textarea.value
        compositionTextRef.current = ''
        clearImeEchoData()
        clearRecentInputText()
        return
      }

      if (!isComposingRef.current && inputEvent.inputType === 'insertText' && inputEvent.data) {
        const replayReason = getReplayedInputTextReason(inputEvent.data)
        if (replayReason) {
          logInputEvent({
            terminalId,
            source: 'app.inputEventText',
            type: 'replay-beforeinput-prevented',
            target: describeElement(textarea),
            activeElement: describeElement(document.activeElement),
            value: textarea.value,
            valueLength: textarea.value.length,
            selectionStart: textarea.selectionStart,
            selectionEnd: textarea.selectionEnd,
            data: inputEvent.data,
            dataCodePoints: getCodePoints(inputEvent.data),
            inputType: inputEvent.inputType,
            isComposing: inputEvent.isComposing,
            cancelable: event.cancelable,
            defaultPrevented: event.defaultPrevented,
            appState: {
              ...getDebugState(),
              replayReason,
            },
          })
          if (event.cancelable) {
            event.preventDefault()
          }
        }
      }
    }

    const handleCompositionStart = () => {
      logInputEvent({
        terminalId,
        source: 'textarea',
        type: 'compositionstart-handler-before',
        target: describeElement(textarea),
        value: textarea.value,
        valueLength: textarea.value.length,
        selectionStart: textarea.selectionStart,
        selectionEnd: textarea.selectionEnd,
        appState: getDebugState(),
      })
      isComposingRef.current = true
      compositionStartValueRef.current = textarea.value
      compositionTextRef.current = ''
      if (compositionEndTimeoutRef.current) {
        clearTimeout(compositionEndTimeoutRef.current)
        compositionEndTimeoutRef.current = null
      }
      clearImeEchoData()
      clearRecentInputText()
      logInputEvent({
        terminalId,
        source: 'textarea',
        type: 'compositionstart-handler-after',
        target: describeElement(textarea),
        value: textarea.value,
        valueLength: textarea.value.length,
        selectionStart: textarea.selectionStart,
        selectionEnd: textarea.selectionEnd,
        appState: getDebugState(),
      })
    }

    const handleCompositionUpdate = (event: CompositionEvent) => {
      logEvent('textarea', event)
      compositionTextRef.current = getComposedText(textarea, compositionStartValueRef.current, event.data)
    }

    const handleCompositionEnd = (event: CompositionEvent) => {
      logEvent('textarea', event)
      compositionTextRef.current = getComposedText(
        textarea,
        compositionStartValueRef.current,
        event.data || compositionTextRef.current
      )

      // xterm finalizes composition with a queued textarea substring. On mobile
      // IMEs that substring can be truncated, so keep our gate closed for that
      // queued send and emit the textarea diff ourselves afterwards.
      compositionEndTimeoutRef.current = setTimeout(() => {
        compositionEndTimeoutRef.current = null
        const data = getComposedText(textarea, compositionStartValueRef.current, compositionTextRef.current)
        isComposingRef.current = false
        compositionStartValueRef.current = ''
        compositionTextRef.current = ''

        sendCommittedImeText(data)
      }, 0)
    }

    const handleTextInput = (event: Event) => {
      const inputEvent = event as InputEvent
      logEvent('textarea', event)

      if (!isComposingRef.current) {
        if (inputEvent.inputType === 'insertText' && inputEvent.data) {
          sendInputEventText(inputEvent.data)
        }
        return
      }

      compositionTextRef.current = getComposedText(
        textarea,
        compositionStartValueRef.current,
        inputEvent.data || compositionTextRef.current
      )

      if (isCommittedImeInput(inputEvent)) {
        sendCommittedImeText(compositionTextRef.current)
        return
      }

      if (containsCommittedCjkText(compositionTextRef.current)) {
        sendCommittedImeText(compositionTextRef.current)
      }
    }

    const inputEventNames = [
      'keydown',
      'keypress',
      'keyup',
      'beforeinput',
      'input',
      'textInput',
      'compositionstart',
      'compositionupdate',
      'compositionend',
      'paste',
      'copy',
      'cut',
      'change',
      'select',
      'focus',
      'blur',
      'focusin',
      'focusout',
      'mousedown',
      'mouseup',
      'click',
      'touchstart',
      'touchend',
      'touchcancel',
      'pointerdown',
      'pointerup',
      'pointercancel',
    ]

    const passiveLoggers: Array<{
      target: EventTarget
      name: string
      listener: EventListener
      options?: AddEventListenerOptions
    }> = []

    const addPassiveLogger = (
      target: EventTarget,
      source: string,
      names: string[],
      options?: AddEventListenerOptions
    ) => {
      for (const name of names) {
        const listener = ((event: Event) => logEvent(source, event)) as EventListener
        target.addEventListener(name, listener, options)
        passiveLoggers.push({ target, name, listener, options })
      }
    }

    textarea.addEventListener('beforeinput', handleBeforeInput, true)
    textarea.addEventListener('compositionstart', handleCompositionStart)
    textarea.addEventListener('compositionupdate', handleCompositionUpdate)
    textarea.addEventListener('compositionend', handleCompositionEnd)
    textarea.addEventListener('input', handleTextInput)
    addPassiveLogger(textarea, 'textarea.capture', inputEventNames, { capture: true })
    addPassiveLogger(textarea, 'textarea.bubble', inputEventNames)
    if (term.element) {
      addPassiveLogger(term.element, 'xterm.element.capture', inputEventNames, { capture: true })
      addPassiveLogger(term.element, 'xterm.element.bubble', inputEventNames)
    }
    addPassiveLogger(containerRef.current, 'container.capture', inputEventNames, { capture: true })
    addPassiveLogger(document, 'document.capture', [...inputEventNames, 'selectionchange'], { capture: true })

    // Handle input
    const disposable = term.onData((data) => {
      logAppData('xterm.onData', data)
      if (isComposingRef.current) {
        return
      }

      const remainingEcho = consumePendingImeEcho(data, imeEchoDataRef.current)
      if (remainingEcho != null) {
        imeEchoDataRef.current = remainingEcho
        return
      }

      rememberRecentXtermData(data)
      logAppData('app.terminalSocket.input', data)
      terminalSocket.input({ terminalId, data })
      rememberInputText(data)
    })

    termRef.current = term
    fitAddonRef.current = fitAddon
    onActionsChange?.({
      copySelection: () => copyText(term.getSelection()),
      focus: () => term.focus(),
    })

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
      if (message.type !== 'output' && message.type !== 'exit') return
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
      textarea.removeEventListener('beforeinput', handleBeforeInput, true)
      textarea.removeEventListener('compositionstart', handleCompositionStart)
      textarea.removeEventListener('compositionupdate', handleCompositionUpdate)
      textarea.removeEventListener('compositionend', handleCompositionEnd)
      textarea.removeEventListener('input', handleTextInput)
      for (const logger of passiveLoggers) {
        logger.target.removeEventListener(logger.name, logger.listener, logger.options)
      }
      if (compositionEndTimeoutRef.current) {
        clearTimeout(compositionEndTimeoutRef.current)
        compositionEndTimeoutRef.current = null
      }
      clearImeEchoData()
      clearRecentXtermData()
      clearRecentInputText()
      resizeObserver.disconnect()
      scrollDisposable.dispose()
      writeParsedDisposable.dispose()
      disposable.dispose()
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
      onActionsChange?.(null)
    }
  }, [fontSize, onActionsChange, resolvedTheme, terminalId])

  return <div ref={containerRef} className="h-full min-h-0 w-full overflow-hidden" />
}
