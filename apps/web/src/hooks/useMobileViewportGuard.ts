import { useEffect } from 'react'

const EDITABLE_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '.xterm-helper-textarea',
].join(',')

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

function syncViewportCssVars() {
  const viewport = window.visualViewport
  const height = Math.round(viewport?.height ?? window.innerHeight)
  const top = Math.round(viewport?.offsetTop ?? 0)

  document.documentElement.style.setProperty('--app-viewport-height', `${height}px`)
  document.documentElement.style.setProperty('--app-viewport-offset-top', `${top}px`)
}

function ensureActiveTargetVisible() {
  const target = getActiveTarget()
  if (!target) return

  const viewport = window.visualViewport
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

    const handleViewportChange = () => {
      scheduleViewportGuard()
    }

    const handleFocusIn = () => {
      scheduleViewportGuard()
    }

    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('orientationchange', handleViewportChange)
    window.visualViewport?.addEventListener('resize', handleViewportChange)
    window.visualViewport?.addEventListener('scroll', handleViewportChange)
    document.addEventListener('focusin', handleFocusIn)

    return () => {
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('orientationchange', handleViewportChange)
      window.visualViewport?.removeEventListener('resize', handleViewportChange)
      window.visualViewport?.removeEventListener('scroll', handleViewportChange)
      document.removeEventListener('focusin', handleFocusIn)
    }
  }, [])
}
