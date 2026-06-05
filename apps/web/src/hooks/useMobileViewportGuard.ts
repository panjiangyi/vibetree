import { useEffect } from 'react'

const EDITABLE_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '.xterm-helper-textarea',
].join(',')

const KEYBOARD_OPEN_DELTA_PX = 120

function isEditableElement(element: Element | null): element is HTMLElement {
  return element instanceof HTMLElement && element.matches(EDITABLE_SELECTOR)
}

function getActiveTarget(): HTMLElement | null {
  const activeElement = document.activeElement
  if (!isEditableElement(activeElement)) {
    return null
  }

  if (!activeElement.classList.contains('xterm-helper-textarea')) {
    return activeElement
  }

  const xtermRoot = activeElement.closest('.xterm')
  if (!(xtermRoot instanceof HTMLElement)) {
    return activeElement
  }

  const cursor =
    xtermRoot.querySelector('.xterm-cursor-layer .xterm-cursor') ??
    xtermRoot.querySelector('.xterm-screen')

  return cursor instanceof HTMLElement ? cursor : activeElement
}

function getViewportMetrics() {
  const viewport = window.visualViewport
  const height = Math.round(viewport?.height ?? window.innerHeight)
  const offsetTop = Math.round(viewport?.offsetTop ?? 0)
  const keyboardOpen = window.innerHeight - height > KEYBOARD_OPEN_DELTA_PX

  return {
    height,
    offsetTop,
    keyboardOpen,
  }
}

function syncViewportCssVars() {
  const viewport = getViewportMetrics()

  document.documentElement.style.setProperty('--app-viewport-height', `${viewport.height}px`)
  document.documentElement.style.setProperty(
    '--app-viewport-offset-top',
    viewport.keyboardOpen ? `${viewport.offsetTop}px` : '0px'
  )
}

function ensureActiveTargetVisible() {
  const target = getActiveTarget()
  if (!target) return

  const viewport = window.visualViewport
  const viewportMetrics = getViewportMetrics()
  if (!viewportMetrics.keyboardOpen) {
    return
  }

  const scrollTop = window.scrollY
  const viewportTop = scrollTop + (viewport?.offsetTop ?? 0) + 12
  const viewportHeight = viewport?.height ?? window.innerHeight
  const viewportBottom = scrollTop + (viewport?.offsetTop ?? 0) + viewportHeight - 20
  const targetRect = target.getBoundingClientRect()
  const absoluteTop = targetRect.top + scrollTop
  const absoluteBottom = targetRect.bottom + scrollTop

  target.scrollIntoView({
    block: 'nearest',
    inline: 'nearest',
  })

  if (absoluteTop < viewportTop) {
    window.scrollTo({
      top: Math.max(0, absoluteTop - 20),
      behavior: 'auto',
    })
    return
  }

  if (absoluteBottom > viewportBottom) {
    window.scrollTo({
      top: Math.max(0, scrollTop + (absoluteBottom - viewportBottom) + 20),
      behavior: 'auto',
    })
  }
}

function scheduleViewportGuard() {
  syncViewportCssVars()

  window.requestAnimationFrame(() => {
    ensureActiveTargetVisible()

    window.setTimeout(() => {
      syncViewportCssVars()
      ensureActiveTargetVisible()
    }, 120)

    window.setTimeout(() => {
      syncViewportCssVars()
      ensureActiveTargetVisible()
    }, 320)
  })
}

export function useMobileViewportGuard() {
  useEffect(() => {
    syncViewportCssVars()

    const handleViewportResize = () => {
      scheduleViewportGuard()
    }

    const handleFocusIn = () => {
      scheduleViewportGuard()
    }

    const handleFocusOut = () => {
      syncViewportCssVars()
    }

    window.addEventListener('resize', handleViewportResize)
    window.addEventListener('orientationchange', handleViewportResize)
    window.visualViewport?.addEventListener('resize', handleViewportResize)
    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)

    return () => {
      window.removeEventListener('resize', handleViewportResize)
      window.removeEventListener('orientationchange', handleViewportResize)
      window.visualViewport?.removeEventListener('resize', handleViewportResize)
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
    }
  }, [])
}
