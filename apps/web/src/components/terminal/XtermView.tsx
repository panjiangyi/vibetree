import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { isInputEventLoggingEnabled, logInputEvent } from '../../debug/input-event-logger.js'
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
  scrollLines: (delta: number) => void
}

const IME_ECHO_SUPPRESSION_MS = 500
const RECENT_XTERM_DATA_WINDOW_MS = 120
const RECENT_INPUT_TEXT_WINDOW_MS = 3000
const MAX_RECENT_INPUT_TEXT_LENGTH = 300
const MAX_OUTPUT_CHARS_PER_FRAME = 64 * 1024
const TOUCH_TAP_MOVE_THRESHOLD_PX = 8
const USER_SCROLL_IDLE_MS = 150

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const commaIndex = result.indexOf(',')
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read clipboard image'))
    reader.readAsDataURL(file)
  })
}

function getClipboardImageFile(event: ClipboardEvent): File | null {
  const files = Array.from(event.clipboardData?.files ?? [])
  const file = files.find((item) => item.type.startsWith('image/'))
  if (file) return file

  const items = Array.from(event.clipboardData?.items ?? [])
  const imageItem = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'))
  return imageItem?.getAsFile() ?? null
}

function copyText(text: string): boolean {
  if (!text) return false

  const copiedWithFallback = fallbackCopyText(text)
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text).catch(() => undefined)
  }

  return copiedWithFallback || Boolean(navigator.clipboard?.writeText)
}

function fallbackCopyText(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  return copied
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

function shouldUseNativeTouchScrollLayer(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window
}

function createNativeTouchScrollLayer(container: HTMLElement, term: Terminal) {
  if (!shouldUseNativeTouchScrollLayer()) {
    return {
      refresh: () => undefined,
      dispose: () => undefined,
    }
  }

  const overlay = document.createElement('div')
  const spacer = document.createElement('div')
  let syncFrameId: number | null = null
  let tapStart: { x: number; y: number } | null = null
  let tapMoved = false
  let touchActive = false
  let lastUserScrollAt = 0
  let programmaticScrollTop: number | null = null
  let idleRefreshTimeout: ReturnType<typeof setTimeout> | null = null

  // Writing scrollTop on a scrolling element cancels the browser's momentum
  // fling, so viewport→overlay sync must never run while the user's gesture
  // (touch or its inertia tail) owns the overlay.
  const isUserScrolling = () =>
    touchActive || performance.now() - lastUserScrollAt < USER_SCROLL_IDLE_MS

  // Programmatic viewport moves that land mid-gesture are skipped by refresh,
  // and nothing fires once the gesture goes quiet — reconcile on a trailing
  // timer instead.
  const scheduleIdleRefresh = () => {
    if (idleRefreshTimeout != null) clearTimeout(idleRefreshTimeout)
    idleRefreshTimeout = setTimeout(() => {
      idleRefreshTimeout = null
      refresh()
    }, USER_SCROLL_IDLE_MS + 50)
  }

  overlay.className = 'xterm-native-touch-scroll'
  overlay.setAttribute('aria-hidden', 'true')
  overlay.style.position = 'absolute'
  overlay.style.inset = '0'
  overlay.style.zIndex = '4'
  overlay.style.overflowX = 'hidden'
  overlay.style.overflowY = 'auto'
  overlay.style.background = 'transparent'
  overlay.style.touchAction = 'pan-y'
  overlay.style.overscrollBehavior = 'contain'
  ;(overlay.style as CSSStyleDeclaration & { WebkitOverflowScrolling?: string }).WebkitOverflowScrolling = 'touch'

  spacer.style.width = '1px'
  overlay.appendChild(spacer)
  container.appendChild(overlay)

  const getViewport = () => term.element?.querySelector('.xterm-viewport') as HTMLElement | null

  const refresh = () => {
    if (syncFrameId != null) return

    syncFrameId = requestAnimationFrame(() => {
      syncFrameId = null
      const viewport = getViewport()
      if (!viewport || term.buffer.active !== term.buffer.normal) {
        overlay.style.display = 'none'
        return
      }

      overlay.style.display = viewport.scrollHeight > viewport.clientHeight ? 'block' : 'none'
      overlay.style.height = `${viewport.clientHeight}px`
      spacer.style.height = `${viewport.scrollHeight}px`
      if (!isUserScrolling() && Math.abs(overlay.scrollTop - viewport.scrollTop) > 1) {
        programmaticScrollTop = viewport.scrollTop
        overlay.scrollTop = viewport.scrollTop
      }
    })
  }

  const handleOverlayScroll = () => {
    if (programmaticScrollTop != null && Math.abs(overlay.scrollTop - programmaticScrollTop) <= 1) {
      programmaticScrollTop = null
      return
    }
    programmaticScrollTop = null
    lastUserScrollAt = performance.now()
    scheduleIdleRefresh()

    const viewport = getViewport()
    if (!viewport || term.buffer.active !== term.buffer.normal) return
    if (Math.abs(viewport.scrollTop - overlay.scrollTop) > 0.5) {
      viewport.scrollTop = overlay.scrollTop
    }
  }

  const handleTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0]
    tapStart = touch ? { x: touch.clientX, y: touch.clientY } : null
    tapMoved = false
    touchActive = true
  }

  const handleTouchMove = (event: TouchEvent) => {
    const touch = event.touches[0]
    if (!touch || !tapStart) return
    if (
      Math.abs(touch.clientX - tapStart.x) > TOUCH_TAP_MOVE_THRESHOLD_PX ||
      Math.abs(touch.clientY - tapStart.y) > TOUCH_TAP_MOVE_THRESHOLD_PX
    ) {
      tapMoved = true
    }
  }

  const handleTouchEnd = (event: TouchEvent) => {
    if (!tapMoved) {
      // Suppress the browser's synthetic mouse events for this tap. They fire
      // ~300ms later on whatever sits at the same coordinates (this overlay,
      // or — after the keyboard resize shifts layout — some other element),
      // and a mousedown on a non-focusable element blurs the xterm textarea,
      // which instantly dismisses the virtual keyboard we just opened.
      if (event.cancelable) {
        event.preventDefault()
      }
      term.focus()
    }
    tapStart = null
    tapMoved = false
    touchActive = false
    lastUserScrollAt = performance.now()
    scheduleIdleRefresh()
  }

  // Backstop for any mousedown that still reaches the overlay (stray synthetic
  // events, touch-capable laptops): keep it from stealing focus.
  const handleMouseDown = (event: MouseEvent) => {
    event.preventDefault()
  }

  overlay.addEventListener('scroll', handleOverlayScroll, { passive: true })
  overlay.addEventListener('touchstart', handleTouchStart, { passive: true })
  overlay.addEventListener('touchmove', handleTouchMove, { passive: true })
  overlay.addEventListener('touchend', handleTouchEnd)
  overlay.addEventListener('touchcancel', handleTouchEnd)
  overlay.addEventListener('mousedown', handleMouseDown)
  refresh()

  return {
    refresh,
    dispose: () => {
      if (syncFrameId != null) {
        cancelAnimationFrame(syncFrameId)
      }
      if (idleRefreshTimeout != null) {
        clearTimeout(idleRefreshTimeout)
      }
      overlay.removeEventListener('scroll', handleOverlayScroll)
      overlay.removeEventListener('touchstart', handleTouchStart)
      overlay.removeEventListener('touchmove', handleTouchMove)
      overlay.removeEventListener('touchend', handleTouchEnd)
      overlay.removeEventListener('touchcancel', handleTouchEnd)
      overlay.removeEventListener('mousedown', handleMouseDown)
      overlay.remove()
    },
  }
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
    const container = containerRef.current

    // TUIs like Claude Code enable mouse reporting, which makes xterm.js send
    // drags to the app instead of selecting text (breaking copy). Force
    // left-button drags to keep selecting locally; other buttons and wheel
    // events still reach the app. Uses a private xterm.js API (no public one).
    const xtermCore = (
      term as unknown as {
        _core?: {
          _selectionService?: {
            shouldForceSelection(event: MouseEvent): boolean
            disable(): void
          }
          coreService?: { triggerDataEvent(data: string, wasUserInput?: boolean): void }
          coreMouseService?: { triggerMouseEvent(event: unknown): boolean }
        }
      }
    )._core
    const selectionService = xtermCore?._selectionService
    if (selectionService) {
      const shouldForceSelection = selectionService.shouldForceSelection.bind(selectionService)
      selectionService.shouldForceSelection = (event) => event.button === 0 || shouldForceSelection(event)
      // Apps re-assert mouse-tracking modes on every render, and each DECSET
      // calls disable() -> clearSelection(), wiping the selection right after
      // mouseup. Selection is forced above, so keep the service enabled.
      selectionService.disable = () => {}
    }
    // Mouse reports (motion/wheel forwarded to the app) are sent as "user
    // input", which SelectionService listens to and clears the selection on —
    // so moving the mouse over a TUI with any-motion tracking wipes it.
    // Unflag mouse reports as user input; keystrokes still clear as usual.
    const coreService = xtermCore?.coreService
    const coreMouseService = xtermCore?.coreMouseService
    if (coreService && coreMouseService) {
      const triggerDataEvent = coreService.triggerDataEvent.bind(coreService)
      const triggerMouseEvent = coreMouseService.triggerMouseEvent.bind(coreMouseService)
      let inMouseReport = false
      coreService.triggerDataEvent = (data, wasUserInput) => {
        triggerDataEvent(data, wasUserInput && !inMouseReport)
      }
      coreMouseService.triggerMouseEvent = (event) => {
        inMouseReport = true
        try {
          return triggerMouseEvent(event)
        } finally {
          inMouseReport = false
        }
      }
    }
    const nativeTouchScrollLayer = createNativeTouchScrollLayer(container, term)
    const sendScroll = (up: boolean, lines: number) => {
      term.scrollLines(up ? -lines : lines)
      const buf = term.buffer.active
      atBottomRef.current = buf.viewportY >= buf.baseY
      nativeTouchScrollLayer.refresh()
    }

    let mouseSelectionStart: { x: number; y: number } | null = null
    let mouseSelectionMoved = false
    let cachedSelectionText = ''
    let cachedSelectionTimeoutId: ReturnType<typeof setTimeout> | null = null

    const clearCachedSelectionLater = () => {
      if (cachedSelectionTimeoutId) {
        clearTimeout(cachedSelectionTimeoutId)
      }
      cachedSelectionTimeoutId = setTimeout(() => {
        cachedSelectionText = ''
        cachedSelectionTimeoutId = null
      }, 8000)
    }

    const rememberSelectionText = (text: string) => {
      if (!text.trim()) return
      cachedSelectionText = text
      clearCachedSelectionLater()
    }

    const getNativeSelectionText = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return ''

      const range = selection.getRangeAt(0)
      const ancestor = range.commonAncestorContainer
      const element = ancestor.nodeType === Node.ELEMENT_NODE ? ancestor : ancestor.parentElement
      if (!(element instanceof Element) || !container.contains(element)) return ''

      return selection.toString()
    }

    const getTerminalSelectionText = () => term.getSelection() || getNativeSelectionText() || cachedSelectionText

    const updateCachedSelectionText = () => {
      rememberSelectionText(term.getSelection() || getNativeSelectionText())
    }

    const handleMouseDownForCopy = (event: MouseEvent) => {
      if (event.button !== 0) {
        mouseSelectionStart = null
        mouseSelectionMoved = false
        return
      }

      mouseSelectionStart = { x: event.clientX, y: event.clientY }
      mouseSelectionMoved = false
    }

    const handleMouseMoveForCopy = (event: MouseEvent) => {
      if (!mouseSelectionStart) return
      const dx = Math.abs(event.clientX - mouseSelectionStart.x)
      const dy = Math.abs(event.clientY - mouseSelectionStart.y)
      if (dx > 3 || dy > 3) {
        mouseSelectionMoved = true
      }
      updateCachedSelectionText()
    }

    const handleMouseUpForCopy = (event: MouseEvent) => {
      if (event.button !== 0 || !mouseSelectionStart) return

      if (mouseSelectionMoved) {
        updateCachedSelectionText()
      }

      mouseSelectionStart = null
      mouseSelectionMoved = false
    }

    container.addEventListener('mousedown', handleMouseDownForCopy, true)
    container.addEventListener('mousemove', handleMouseMoveForCopy, true)
    container.addEventListener('mouseup', handleMouseUpForCopy, true)
    document.addEventListener('selectionchange', updateCachedSelectionText)

    const scrollToBottom = () => {
      term.scrollToBottom()
      atBottomRef.current = true
      nativeTouchScrollLayer.refresh()
    }

    const attachTerminal = () => {
      fitAddon.fit()
      terminalSocket.attach({
        terminalId,
        cols: term.cols,
        rows: term.rows,
      })
    }

    let resizeFrameId: number | null = null
    let scrollAfterResize = false

    const fitResizeAndMaybeScroll = (forceScroll = false) => {
      scrollAfterResize = scrollAfterResize || forceScroll || atBottomRef.current
      if (resizeFrameId != null) return

      resizeFrameId = requestAnimationFrame(() => {
        resizeFrameId = null
        const shouldScroll = scrollAfterResize
        scrollAfterResize = false

        fitAddon.fit()
        terminalSocket.resize({
          terminalId,
          cols: term.cols,
          rows: term.rows,
        })

        if (shouldScroll) {
          requestAnimationFrame(scrollToBottom)
        }
        nativeTouchScrollLayer.refresh()
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
      copyText(getTerminalSelectionText())
      return false
    })

    let initialAttachFrameId: number | null = requestAnimationFrame(() => {
      initialAttachFrameId = null
      attachTerminal()
      requestAnimationFrame(scrollToBottom)
    })

    const textarea = term.textarea
    if (!textarea) {
      return
    }
    const debugInputEventsEnabled = isInputEventLoggingEnabled()

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
      if (!debugInputEventsEnabled) return

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
      if (!debugInputEventsEnabled) return

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

    const handleClipboardPaste = (event: ClipboardEvent) => {
      const imageFile = getClipboardImageFile(event)
      if (!imageFile) return

      event.preventDefault()
      event.stopPropagation()
      void readFileAsBase64(imageFile)
        .then((dataBase64) => {
          terminalSocket.send({
            type: 'paste-image',
            terminalId,
            mimeType: imageFile.type,
            dataBase64,
          })
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'Failed to paste clipboard image'
          logInputEvent({
            terminalId,
            source: 'app.clipboardImagePaste',
            type: 'paste-image-error',
            target: describeElement(textarea),
            activeElement: describeElement(document.activeElement),
            value: textarea.value,
            valueLength: textarea.value.length,
            selectionStart: textarea.selectionStart,
            selectionEnd: textarea.selectionEnd,
            data: message,
            appState: getDebugState(),
          })
        })
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

    textarea.addEventListener('paste', handleClipboardPaste, true)
    textarea.addEventListener('beforeinput', handleBeforeInput, true)
    textarea.addEventListener('compositionstart', handleCompositionStart)
    textarea.addEventListener('compositionupdate', handleCompositionUpdate)
    textarea.addEventListener('compositionend', handleCompositionEnd)
    textarea.addEventListener('input', handleTextInput)
    if (debugInputEventsEnabled) {
      addPassiveLogger(textarea, 'textarea.capture', inputEventNames, { capture: true })
      addPassiveLogger(textarea, 'textarea.bubble', inputEventNames)
      if (term.element) {
        addPassiveLogger(term.element, 'xterm.element.capture', inputEventNames, { capture: true })
        addPassiveLogger(term.element, 'xterm.element.bubble', inputEventNames)
      }
      addPassiveLogger(containerRef.current, 'container.capture', inputEventNames, { capture: true })
      addPassiveLogger(document, 'document.capture', [...inputEventNames, 'selectionchange'], { capture: true })
    }

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
      copySelection: () => copyText(getTerminalSelectionText()),
      focus: () => term.focus(),
      scrollLines: (delta: number) => {
        // delta < 0 = scroll up (older), delta > 0 = scroll down (newer)
        sendScroll(delta < 0, Math.abs(delta))
      },
    })

    const resizeObserver = new ResizeObserver(() => {
      fitResizeAndMaybeScroll()
    })

    resizeObserver.observe(containerRef.current)

    const scrollDisposable = term.onScroll(() => {
      const buffer = term.buffer.active
      atBottomRef.current = buffer.viewportY >= buffer.baseY
      nativeTouchScrollLayer.refresh()
    })

    // xterm already keeps the viewport pinned while it is at the bottom and
    // holds position when scrolled up. Forcing scrollToBottom here raced with
    // user scrolls during streaming output and yanked the viewport back down,
    // so only keep the touch-scroll layer's size in sync.
    const writeParsedDisposable = term.onWriteParsed(() => {
      nativeTouchScrollLayer.refresh()
    })

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fitResizeAndMaybeScroll()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    let pendingOutput = ''
    let outputWriteFrameId: number | null = null
    let outputWriteInProgress = false

    const scheduleOutputWrite = () => {
      if (outputWriteFrameId != null || outputWriteInProgress) return
      outputWriteFrameId = requestAnimationFrame(writePendingOutput)
    }

    function writePendingOutput() {
      outputWriteFrameId = null
      if (outputWriteInProgress || !pendingOutput) return

      const data = pendingOutput.slice(0, MAX_OUTPUT_CHARS_PER_FRAME)
      pendingOutput = pendingOutput.slice(data.length)
      outputWriteInProgress = true

      term.write(data, () => {
        outputWriteInProgress = false
        if (pendingOutput) {
          scheduleOutputWrite()
        }
      })
    }

    const enqueueOutput = (data: string) => {
      pendingOutput += data
      scheduleOutputWrite()
    }

    // Handle messages
    const unsubscribe = terminalSocket.onMessage((message) => {
      if (
        message.type !== 'attached' &&
        message.type !== 'output' &&
        message.type !== 'exit' &&
        message.type !== 'error'
      ) {
        return
      }
      if (message.terminalId !== terminalId) return

      if (message.type === 'attached') {
        // The server replays its full output buffer after every attach. Reset
        // in-band through the write queue so a reconnect replay replaces the
        // existing content instead of appending a duplicate copy.
        pendingOutput = ''
        enqueueOutput('\x1bc')
        return
      }

      if (message.type === 'output') {
        enqueueOutput(message.data)
      }

      if (message.type === 'exit') {
        enqueueOutput(`\r\n\x1b[33mTerminal exited with code ${message.exitCode ?? ''}\x1b[0m\r\n`)
      }

      if (message.type === 'error' && message.code === 'PTY_NOT_FOUND') {
        enqueueOutput('\r\n\x1b[31mTerminal session is no longer available. Reopen or restart the terminal.\x1b[0m\r\n')
      }
    })
    const unsubscribeReconnect = terminalSocket.onReconnect(() => {
      attachTerminal()
      requestAnimationFrame(scrollToBottom)
    })

    const keepMobileKeyboardOpen = shouldUseNativeTouchScrollLayer()
    const refocusTerminal = () => {
      if (!keepMobileKeyboardOpen || document.hidden) return
      requestAnimationFrame(() => term.focus())
    }
    if (keepMobileKeyboardOpen) {
      textarea.addEventListener('blur', refocusTerminal)
    }

    term.focus()

    return () => {
      unsubscribe()
      unsubscribeReconnect()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      textarea.removeEventListener('paste', handleClipboardPaste, true)
      textarea.removeEventListener('beforeinput', handleBeforeInput, true)
      textarea.removeEventListener('compositionstart', handleCompositionStart)
      textarea.removeEventListener('compositionupdate', handleCompositionUpdate)
      textarea.removeEventListener('compositionend', handleCompositionEnd)
      textarea.removeEventListener('input', handleTextInput)
      textarea.removeEventListener('blur', refocusTerminal)
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
      if (cachedSelectionTimeoutId) {
        clearTimeout(cachedSelectionTimeoutId)
      }
      if (initialAttachFrameId != null) {
        cancelAnimationFrame(initialAttachFrameId)
      }
      if (resizeFrameId != null) {
        cancelAnimationFrame(resizeFrameId)
      }
      if (outputWriteFrameId != null) {
        cancelAnimationFrame(outputWriteFrameId)
      }
      pendingOutput = ''
      container.removeEventListener('mousedown', handleMouseDownForCopy, true)
      container.removeEventListener('mousemove', handleMouseMoveForCopy, true)
      container.removeEventListener('mouseup', handleMouseUpForCopy, true)
      document.removeEventListener('selectionchange', updateCachedSelectionText)
      nativeTouchScrollLayer.dispose()
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

  return <div ref={containerRef} className="relative h-full min-h-0 w-full overflow-hidden" />
}
