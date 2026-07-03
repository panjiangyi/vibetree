import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ReactGridLayout } from 'react-grid-layout/legacy'
import type { LayoutItem } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CornerDownLeft, Plus, X } from 'lucide-react'
import { GRID_COLS, GRID_ROWS, useLayoutStore } from '../../stores/layout.store.js'
import { useTerminalStore } from '../../stores/terminal.store.js'
import { useMediaQuery } from '../../hooks/useMediaQuery.js'
import { terminalSocket } from '../../ws/terminal-socket.js'
import { TerminalPane } from './TerminalPane.js'
import type { TerminalViewActions } from './XtermView.js'

const MARGIN = 8
const KEYBOARD_KEYS_MARGIN_PX = 8
// position: fixed anchors to the layout viewport, which iOS/Android don't
// shrink when the virtual keyboard opens — only visualViewport does. Track it
// so fixed overlays can be pushed up above the keyboard instead of ending up
// hidden underneath it.
function useKeyboardBottomInset(): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const update = () => {
      const covered = window.innerHeight - (viewport.offsetTop + viewport.height)
      setInset(Math.max(0, Math.round(covered)))
    }

    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [])

  return inset
}

export function TerminalGrid() {
  const isMobile = useMediaQuery('(max-width: 767px)')
  if (isMobile) return <MobileTerminalFocus />
  return <DesktopTerminalGrid />
}

function DesktopTerminalGrid() {
  const activeScopeId = useLayoutStore((s) => s.activeScopeId)
  const layoutsByScopeId = useLayoutStore((s) => s.layoutsByScopeId)
  const setLayoutForScope = useLayoutStore((s) => s.setLayoutForScope)
  const terminalIdToTitle = useLayoutStore((s) => s.terminalIdToTitle)
  const closeTerminal = useTerminalStore((s) => s.closeTerminal)

  const [size, setSize] = useState({ width: 0, height: 0 })
  const observerRef = useRef<ResizeObserver | null>(null)

  const measureRef = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!el) return
    const rect = el.getBoundingClientRect()
    setSize({ width: rect.width, height: rect.height })
    const observer = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r) setSize({ width: r.width, height: r.height })
    })
    observer.observe(el)
    observerRef.current = observer
  }, [])

  // Render every open scope's grid and keep them all mounted, toggling
  // visibility with CSS. Unmounting a scope's terminals on tab switch would
  // force a re-attach and a full scrollback replay when switching back.
  const scopeIds = useMemo(
    () => Object.keys(layoutsByScopeId).filter((id) => (layoutsByScopeId[id]?.length ?? 0) > 0),
    [layoutsByScopeId]
  )

  const rowHeight = useMemo(() => {
    if (size.height <= 0) return 30
    const usable = size.height - (GRID_ROWS - 1) * MARGIN - 2 * MARGIN
    return Math.max(20, usable / GRID_ROWS)
  }, [size.height])

  const handleLayoutChange = useCallback(
    (scopeId: string, newLayout: readonly LayoutItem[]) => {
      if (newLayout.length > 0) {
        setLayoutForScope(scopeId, [...newLayout])
      }
    },
    [setLayoutForScope]
  )

  const handleClose = useCallback(
    (terminalId: string, e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      void closeTerminal(terminalId)
    },
    [closeTerminal]
  )

  if (scopeIds.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center app-subtle">
        <div className="text-center">
          <p className="text-lg mb-2">No terminal opened</p>
          <p className="text-sm">Select a worktree or open a directory terminal.</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={measureRef} className="relative flex-1 min-h-0 overflow-hidden">
      {size.width > 0 &&
        size.height > 0 &&
        scopeIds.map((scopeId) => {
          const scopeLayout = layoutsByScopeId[scopeId] ?? []
          const isActive = scopeId === activeScopeId
          return (
            <div
              key={scopeId}
              className="absolute inset-0"
              style={{ display: isActive ? 'block' : 'none' }}
              aria-hidden={!isActive}
            >
              <ReactGridLayout
                layout={scopeLayout}
                width={size.width}
                cols={GRID_COLS}
                maxRows={GRID_ROWS}
                rowHeight={rowHeight}
                margin={[MARGIN, MARGIN]}
                containerPadding={[MARGIN, MARGIN]}
                autoSize={false}
                style={{ height: size.height }}
                onLayoutChange={(newLayout) => handleLayoutChange(scopeId, newLayout)}
                draggableHandle=".drag-handle"
                resizeHandles={['se']}
                compactType="vertical"
                preventCollision={false}
                isBounded
              >
                {scopeLayout.map((item) => (
                  <div
                    key={item.i}
                    className="app-panel border rounded overflow-hidden flex flex-col"
                  >
                    <div className="drag-handle flex items-center justify-between px-2 py-1 app-panel-strong border-b cursor-move select-none">
                      <span className="text-xs app-muted truncate">
                        {terminalIdToTitle[item.i] || item.i}
                      </span>
                      <span
                        role="button"
                        onClick={(e) => handleClose(item.i, e)}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="p-0.5 rounded cursor-pointer app-hover"
                        title="Close terminal"
                      >
                        <X className="w-3 h-3 app-danger" />
                      </span>
                    </div>
                    <div className="flex flex-col flex-1 min-h-0">
                      <TerminalPane terminalId={item.i} />
                    </div>
                  </div>
                ))}
              </ReactGridLayout>
            </div>
          )
        })}
    </div>
  )
}

function MobileTerminalFocus() {
  const activeScopeId = useLayoutStore((s) => s.activeScopeId)
  const layoutsByScopeId = useLayoutStore((s) => s.layoutsByScopeId)
  const terminalIdToTitle = useLayoutStore((s) => s.terminalIdToTitle)
  const createNewTerminalForScope = useTerminalStore((s) => s.createNewTerminalForScope)
  const closeTerminal = useTerminalStore((s) => s.closeTerminal)
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null)
  const [terminalActions, setTerminalActions] = useState<TerminalViewActions | null>(null)
  const previousLayoutLengthRef = useRef(0)
  const previousScopeIdRef = useRef<string | null>(null)

  const layout = useMemo(() => {
    if (!activeScopeId) return []
    return layoutsByScopeId[activeScopeId] ?? []
  }, [activeScopeId, layoutsByScopeId])

  useEffect(() => {
    if (layout.length === 0) {
      setActiveTerminalId(null)
      setTerminalActions(null)
      return
    }

    const scopeChanged = previousScopeIdRef.current !== activeScopeId
    const terminalAdded = layout.length > previousLayoutLengthRef.current
    previousLayoutLengthRef.current = layout.length
    previousScopeIdRef.current = activeScopeId

    setActiveTerminalId((current) => {
      if (!scopeChanged && !terminalAdded && current && layout.some((item) => item.i === current)) {
        return current
      }
      return layout[layout.length - 1]?.i ?? null
    })
  }, [activeScopeId, layout])

  useEffect(() => {
    setTerminalActions(null)
  }, [activeTerminalId])

  const sendKey = useCallback(
    (data: string) => {
      if (!activeTerminalId) return
      terminalSocket.input({ terminalId: activeTerminalId, data })
      terminalActions?.focus()
    },
    [activeTerminalId, terminalActions]
  )

  const keyboardBottomInset = useKeyboardBottomInset()
  const keyPadBottom = keyboardBottomInset + KEYBOARD_KEYS_MARGIN_PX

  const handleCloseTerminal = useCallback(
    (terminalId: string) => {
      if (terminalId === activeTerminalId) {
        const currentIndex = layout.findIndex((item) => item.i === terminalId)
        const fallbackId =
          layout[currentIndex + 1]?.i ?? layout[currentIndex - 1]?.i ?? null
        setActiveTerminalId(fallbackId)
      }
      void closeTerminal(terminalId)
    },
    [activeTerminalId, closeTerminal, layout]
  )

  const handleCreateTerminal = useCallback(() => {
    if (!activeScopeId) return
    void createNewTerminalForScope(activeScopeId)
  }, [activeScopeId, createNewTerminalForScope])

  if (!activeScopeId || layout.length === 0 || !activeTerminalId) {
    return (
      <div className="flex-1 flex items-center justify-center app-subtle px-6">
        <div className="text-center">
          <p className="text-lg mb-2">No terminal opened</p>
          <p className="text-sm">Open the projects menu or a directory terminal.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-1 border-b app-panel-strong overflow-x-auto px-1 py-1">
        {layout.map((item, index) => {
          const isActive = item.i === activeTerminalId
          return (
            <div
              key={item.i}
              className={`
                flex h-8 min-w-[7rem] max-w-[11rem] shrink-0 items-center gap-1 rounded border px-2 text-xs
                ${isActive ? 'app-panel' : 'app-panel-strong app-muted'}
              `}
            >
              <button
                type="button"
                onClick={() => {
                  setActiveTerminalId(item.i)
                  terminalActions?.focus()
                }}
                className="min-w-0 flex-1 truncate text-left"
                title={terminalIdToTitle[item.i] || item.i}
              >
                {terminalIdToTitle[item.i] || `Terminal ${index + 1}`}
              </button>
              <button
                type="button"
                aria-label="Close terminal"
                title="Close terminal"
                onClick={() => handleCloseTerminal(item.i)}
                className="app-icon-button flex h-6 w-6 shrink-0 items-center justify-center p-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
        <button
          type="button"
          aria-label="New terminal"
          title="New terminal"
          onClick={handleCreateTerminal}
          className="app-icon-button flex h-8 w-8 shrink-0 items-center justify-center border p-0"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="relative flex-1 min-h-0 app-panel flex flex-col overflow-hidden">
        {layout.map((item) => {
          const isActive = item.i === activeTerminalId
          return (
            <div
              key={item.i}
              className="absolute inset-0 flex min-h-0 flex-col"
              style={{ display: isActive ? 'flex' : 'none' }}
              aria-hidden={!isActive}
            >
              <TerminalPane
                terminalId={item.i}
                fontSize={12}
                onActionsChange={isActive ? setTerminalActions : undefined}
              />
            </div>
          )
        })}
      </div>

      {createPortal(
        <>
          {/* Floating arrow-key pad — fixed to the page, tracks the visual
              viewport so it rides up above the virtual keyboard. */}
          <div
            className="fixed left-2 z-30 grid grid-cols-3 grid-rows-3 gap-1 pointer-events-none"
            style={{ bottom: keyPadBottom }}
          >
            <div />
            <FloatingKeyButton label="Up arrow" onPress={() => sendKey('\x1b[A')}>
              <ArrowUp className="w-4 h-4" />
            </FloatingKeyButton>
            <div />
            <FloatingKeyButton label="Left arrow" onPress={() => sendKey('\x1b[D')}>
              <ArrowLeft className="w-4 h-4" />
            </FloatingKeyButton>
            <div />
            <FloatingKeyButton label="Right arrow" onPress={() => sendKey('\x1b[C')}>
              <ArrowRight className="w-4 h-4" />
            </FloatingKeyButton>
            <div />
            <FloatingKeyButton label="Down arrow" onPress={() => sendKey('\x1b[B')}>
              <ArrowDown className="w-4 h-4" />
            </FloatingKeyButton>
            <div />
          </div>

          {/* Floating Enter key — fixed to the page, right side */}
          <div className="fixed right-2 z-30 pointer-events-none" style={{ bottom: keyPadBottom }}>
            <FloatingKeyButton label="Enter" onPress={() => sendKey('\r')}>
              <CornerDownLeft className="w-4 h-4" />
            </FloatingKeyButton>
          </div>
        </>,
        document.body
      )}

    </div>
  )
}

function FloatingKeyButton({
  label,
  onPress,
  children,
}: {
  label: string
  onPress: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={(e) => {
        e.preventDefault()
        onPress()
      }}
      className="pointer-events-auto w-8 h-8 flex items-center justify-center rounded-full shadow-lg border opacity-60 active:opacity-100 app-panel-strong"
    >
      {children}
    </button>
  )
}
