import { useEffect, useRef } from 'react'

const KEYBOARD_OPEN_DELTA_PX = 120
const SCROLL_PADDING = 16
const DEBOUNCE_MS = 150

let isAdjusting = false

function getViewportHeight(): number {
  return window.visualViewport?.height ?? window.innerHeight
}

function isKeyboardOpen(): boolean {
  const viewport = window.visualViewport
  if (!viewport) return false
  return window.innerHeight - Math.round(viewport.height) > KEYBOARD_OPEN_DELTA_PX
}

function scrollXtermCursorIntoView(viewportHeight: number) {
  const activeElement = document.activeElement
  if (!activeElement?.classList.contains('xterm-helper-textarea')) return

  const xtermRoot = activeElement.closest('.xterm')
  if (!(xtermRoot instanceof HTMLElement)) return

  const cursor =
    xtermRoot.querySelector('.xterm-cursor-layer .xterm-cursor') ??
    xtermRoot.querySelector('.xterm-screen')
  if (!(cursor instanceof HTMLElement)) return

  const rect = cursor.getBoundingClientRect()
  const visibleBottom = viewportHeight - SCROLL_PADDING

  if (rect.top < SCROLL_PADDING) {
    window.scrollBy({ top: rect.top - SCROLL_PADDING, behavior: 'auto' })
    return
  }

  if (rect.bottom > visibleBottom) {
    window.scrollBy({ top: rect.bottom - visibleBottom + SCROLL_PADDING, behavior: 'auto' })
  }
}

function scrollFocusedElementIntoView(viewportHeight: number) {
  const activeElement = document.activeElement
  if (!activeElement) return

  if (activeElement.classList.contains('xterm-helper-textarea')) {
    scrollXtermCursorIntoView(viewportHeight)
    return
  }

  const isInputLike =
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement instanceof HTMLSelectElement ||
    (activeElement instanceof HTMLElement && activeElement.isContentEditable)

  if (!isInputLike) return

  const rect = activeElement.getBoundingClientRect()
  const visibleBottom = viewportHeight - SCROLL_PADDING

  if (rect.top < SCROLL_PADDING) {
    window.scrollBy({ top: rect.top - SCROLL_PADDING, behavior: 'auto' })
    return
  }

  if (rect.bottom > visibleBottom) {
    window.scrollBy({ top: rect.bottom - visibleBottom + SCROLL_PADDING, behavior: 'auto' })
  }
}

function adjustForKeyboard() {
  if (isAdjusting) return
  isAdjusting = true

  requestAnimationFrame(() => {
    if (document.body.scrollTop > 0) {
      document.body.scrollTop = 0
    }
    if (document.documentElement.scrollTop > 0) {
      document.documentElement.scrollTop = 0
    }

    if (isKeyboardOpen()) {
      scrollFocusedElementIntoView(getViewportHeight())
    }

    isAdjusting = false
  })
}

export function useMobileViewportGuard() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasKeyboardOpenRef = useRef(false)

  useEffect(() => {
    const debouncedAdjust = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(adjustForKeyboard, DEBOUNCE_MS)
    }

    const handleViewportResize = () => {
      const keyboardOpen = isKeyboardOpen()

      if (keyboardOpen !== wasKeyboardOpenRef.current) {
        wasKeyboardOpenRef.current = keyboardOpen
        debouncedAdjust()
      }
    }

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return

      const isInputLike =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable ||
        target.classList.contains('xterm-helper-textarea')

      if (isInputLike && isKeyboardOpen()) {
        debouncedAdjust()
      }
    }

    window.visualViewport?.addEventListener('resize', handleViewportResize)
    document.addEventListener('focusin', handleFocusIn)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      window.visualViewport?.removeEventListener('resize', handleViewportResize)
      document.removeEventListener('focusin', handleFocusIn)
    }
  }, [])
}
