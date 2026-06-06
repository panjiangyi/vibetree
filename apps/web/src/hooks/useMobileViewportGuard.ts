import { useEffect } from 'react'

const KEYBOARD_OPEN_DELTA_PX = 120

function isKeyboardOpen(): boolean {
  const viewport = window.visualViewport
  if (!viewport) return false
  return window.innerHeight - Math.round(viewport.height) > KEYBOARD_OPEN_DELTA_PX
}

/**
 * After the browser auto-scrolls to show the focused element when the
 * virtual keyboard opens, check whether the xterm cursor actually ended
 * up visible. If the browser scrolled too far (cursor above the screen),
 * nudge the scroll back just enough to reveal it.
 */
function ensureCursorVisible() {
  if (!isKeyboardOpen()) return

  const activeElement = document.activeElement
  if (
    !activeElement ||
    !activeElement.classList.contains('xterm-helper-textarea')
  ) {
    return
  }

  // Find the xterm cursor/screen element (the visual representation of
  // the cursor position), not the hidden textarea itself.
  const xtermRoot = activeElement.closest('.xterm')
  if (!(xtermRoot instanceof HTMLElement)) return

  const cursor =
    xtermRoot.querySelector('.xterm-cursor-layer .xterm-cursor') ??
    xtermRoot.querySelector('.xterm-screen')
  if (!(cursor instanceof HTMLElement)) return

  const rect = cursor.getBoundingClientRect()
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight

  // Cursor is above the visible area — scroll down to reveal it
  if (rect.top < 8) {
    window.scrollBy({ top: rect.top - 8, behavior: 'auto' })
    return
  }

  // Cursor is below the visible area — scroll up to reveal it
  if (rect.bottom > viewportHeight - 8) {
    window.scrollBy({ top: rect.bottom - viewportHeight + 8, behavior: 'auto' })
  }
}

function scheduleViewportGuard() {
  window.requestAnimationFrame(() => {
    ensureCursorVisible()

    // Re-check at 120ms and 320ms to catch late layout shifts after
    // the keyboard animation finishes.
    window.setTimeout(ensureCursorVisible, 120)
    window.setTimeout(ensureCursorVisible, 320)
  })
}

export function useMobileViewportGuard() {
  useEffect(() => {
    const handleViewportChange = () => {
      scheduleViewportGuard()
    }

    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('orientationchange', handleViewportChange)
    window.visualViewport?.addEventListener('resize', handleViewportChange)
    window.visualViewport?.addEventListener('scroll', handleViewportChange)
    document.addEventListener('focusin', handleViewportChange)

    return () => {
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('orientationchange', handleViewportChange)
      window.visualViewport?.removeEventListener('resize', handleViewportChange)
      window.visualViewport?.removeEventListener('scroll', handleViewportChange)
      document.removeEventListener('focusin', handleViewportChange)
    }
  }, [])
}
