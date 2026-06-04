import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ReactGridLayout } from 'react-grid-layout/legacy'
import type { LayoutItem } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import { ChevronDown, ChevronUp, Clipboard, Copy, Eraser, Plus, Send, SkipBack, Square, X } from 'lucide-react'
import { GRID_COLS, GRID_ROWS, useLayoutStore } from '../../stores/layout.store.js'
import { useTerminalStore } from '../../stores/terminal.store.js'
import { terminalSocket } from '../../ws/terminal-socket.js'
import { useMediaQuery } from '../../hooks/useMediaQuery.js'
import { TerminalPane } from './TerminalPane.js'
import type { TerminalViewActions } from './XtermView.js'

const MARGIN = 8

export function TerminalGrid() {
  const isMobile = useMediaQuery('(max-width: 767px)')
  if (isMobile) return <MobileTerminalFocus />
  return <DesktopTerminalGrid />
}

function DesktopTerminalGrid() {
  const activeWorktreeId = useLayoutStore((s) => s.activeWorktreeId)
  const layoutsByWorktreeId = useLayoutStore((s) => s.layoutsByWorktreeId)
  const setLayoutForWorktree = useLayoutStore((s) => s.setLayoutForWorktree)
  const terminalIdToTitle = useLayoutStore((s) => s.terminalIdToTitle)
  const closeTerminal = useTerminalStore((s) => s.closeTerminal)

  const [size, setSize] = useState({ width: 0, height: 0 })
  const observerRef = useRef<ResizeObserver | null>(null)

  // Callback ref so measurement attaches whenever the container mounts. A plain
  // mount effect would miss the case where the grid starts empty (container not
  // rendered) and panes are added later — the observer would never attach and
  // `size` would stay 0, leaving the grid invisible.
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

  const layout = useMemo(() => {
    if (!activeWorktreeId) return []
    return layoutsByWorktreeId[activeWorktreeId] ?? []
  }, [activeWorktreeId, layoutsByWorktreeId])

  // Size a row so that exactly GRID_ROWS rows + margins fill the height, so the
  // grid stays flush with the workspace (no overflow / scrolling).
  const rowHeight = useMemo(() => {
    if (size.height <= 0) return 30
    const usable = size.height - (GRID_ROWS - 1) * MARGIN - 2 * MARGIN
    return Math.max(20, usable / GRID_ROWS)
  }, [size.height])

  const handleLayoutChange = useCallback(
    (newLayout: readonly LayoutItem[]) => {
      if (activeWorktreeId && newLayout.length > 0) {
        setLayoutForWorktree(activeWorktreeId, [...newLayout])
      }
    },
    [activeWorktreeId, setLayoutForWorktree]
  )

  const handleClose = useCallback(
    (terminalId: string, e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      closeTerminal(terminalId)
    },
    [closeTerminal]
  )

  if (!activeWorktreeId || layout.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center app-subtle">
        <div className="text-center">
          <p className="text-lg mb-2">No terminal opened</p>
          <p className="text-sm">Select a worktree from the left sidebar to open a terminal.</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={measureRef} className="flex-1 min-h-0 overflow-hidden">
      {size.width > 0 && size.height > 0 && (
        <ReactGridLayout
          layout={layout}
          width={size.width}
          cols={GRID_COLS}
          maxRows={GRID_ROWS}
          rowHeight={rowHeight}
          margin={[MARGIN, MARGIN]}
          containerPadding={[MARGIN, MARGIN]}
          autoSize={false}
          style={{ height: size.height }}
          onLayoutChange={handleLayoutChange}
          draggableHandle=".drag-handle"
          resizeHandles={['se']}
          compactType="vertical"
          preventCollision={false}
          isBounded
        >
          {layout.map((item) => (
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
      )}
    </div>
  )
}

function MobileTerminalFocus() {
  const activeWorktreeId = useLayoutStore((s) => s.activeWorktreeId)
  const layoutsByWorktreeId = useLayoutStore((s) => s.layoutsByWorktreeId)
  const terminalIdToTitle = useLayoutStore((s) => s.terminalIdToTitle)
  const closeTerminal = useTerminalStore((s) => s.closeTerminal)
  const createNewTerminalForWorktree = useTerminalStore((s) => s.createNewTerminalForWorktree)
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null)
  const [terminalActions, setTerminalActions] = useState<TerminalViewActions | null>(null)
  const previousLayoutLengthRef = useRef(0)
  const previousWorktreeIdRef = useRef<string | null>(null)

  const layout = useMemo(() => {
    if (!activeWorktreeId) return []
    return layoutsByWorktreeId[activeWorktreeId] ?? []
  }, [activeWorktreeId, layoutsByWorktreeId])

  useEffect(() => {
    if (layout.length === 0) {
      setActiveTerminalId(null)
      setTerminalActions(null)
      return
    }

    const worktreeChanged = previousWorktreeIdRef.current !== activeWorktreeId
    const terminalAdded = layout.length > previousLayoutLengthRef.current
    previousLayoutLengthRef.current = layout.length
    previousWorktreeIdRef.current = activeWorktreeId

    setActiveTerminalId((current) => {
      if (!worktreeChanged && !terminalAdded && current && layout.some((item) => item.i === current)) {
        return current
      }
      return layout[layout.length - 1]?.i ?? null
    })
  }, [activeWorktreeId, layout])

  const handleNewTerminal = () => {
    if (activeWorktreeId) {
      createNewTerminalForWorktree(activeWorktreeId)
    }
  }

  const handleCloseTerminal = () => {
    if (activeTerminalId) {
      closeTerminal(activeTerminalId)
    }
  }

  useEffect(() => {
    setTerminalActions(null)
  }, [activeTerminalId])

  if (!activeWorktreeId || layout.length === 0 || !activeTerminalId) {
    return (
      <div className="flex-1 flex items-center justify-center app-subtle px-6">
        <div className="text-center">
          <p className="text-lg mb-2">No terminal opened</p>
          <p className="text-sm">Open the projects menu and select a worktree.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 h-full flex flex-col overflow-hidden">
      <div className="app-panel-strong border-b flex shrink-0 items-center gap-2 overflow-x-auto px-2 py-2">
        {layout.map((item, index) => {
          const isActive = item.i === activeTerminalId
          return (
            <button
              key={item.i}
              onClick={() => setActiveTerminalId(item.i)}
              className={`min-w-0 shrink-0 rounded-md border px-3 py-2 text-xs ${
                isActive ? 'app-panel' : 'app-hover app-muted'
              }`}
            >
              <span className="block max-w-[8rem] truncate">
                {terminalIdToTitle[item.i] || `Terminal ${index + 1}`}
              </span>
            </button>
          )
        })}
        <button
          onClick={handleNewTerminal}
          className="app-button-secondary shrink-0 px-3 py-2"
          title="New terminal"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={handleCloseTerminal}
          className="app-button-secondary shrink-0 px-3 py-2"
          title="Close terminal"
        >
          <X className="w-4 h-4 app-danger" />
        </button>
      </div>

      <MobileTerminalActions
        terminalId={activeTerminalId}
        terminalActions={terminalActions}
      />

      <div className="flex-1 min-h-0 app-panel border-t flex flex-col overflow-hidden">
        <TerminalPane
          terminalId={activeTerminalId}
          fontSize={12}
          onActionsChange={setTerminalActions}
        />
      </div>
    </div>
  )
}

type MobileTerminalActionsProps = {
  terminalId: string
  terminalActions: TerminalViewActions | null
}

function MobileTerminalActions({ terminalId, terminalActions }: MobileTerminalActionsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendInput = (data: string) => {
    terminalSocket.input({ terminalId, data })
    terminalActions?.focus()
  }

  const handleCopy = () => {
    terminalActions?.copySelection()
    terminalActions?.focus()
  }

  const handlePaste = async () => {
    setError(null)
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        sendInput(text)
      }
    } catch {
      setError('Clipboard access denied')
    }
  }

  return (
    <div className="app-panel-strong border-b shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm app-hover"
      >
        <span>快捷操作</span>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {isOpen && (
        <div className="space-y-2 px-2 pb-2">
          <div className="grid grid-cols-4 gap-2">
            <ActionButton
              label="终止进程"
              icon={<Square className="w-4 h-4 app-danger" />}
              onClick={() => sendInput('\x03')}
            />
            <ActionButton
              label="Esc"
              icon={<SkipBack className="w-4 h-4" />}
              onClick={() => sendInput('\x1b')}
            />
            <ActionButton
              label="Tab"
              icon={<Send className="w-4 h-4" />}
              onClick={() => sendInput('\t')}
            />
            <ActionButton
              label="清屏"
              icon={<Eraser className="w-4 h-4" />}
              onClick={() => sendInput('\x0c')}
            />
            <ActionButton
              label="上一条"
              icon={<ChevronUp className="w-4 h-4" />}
              onClick={() => sendInput('\x1b[A')}
            />
            <ActionButton
              label="下一条"
              icon={<ChevronDown className="w-4 h-4" />}
              onClick={() => sendInput('\x1b[B')}
            />
            <ActionButton
              label="复制"
              icon={<Copy className="w-4 h-4" />}
              onClick={handleCopy}
            />
            <ActionButton
              label="粘贴"
              icon={<Clipboard className="w-4 h-4" />}
              onClick={handlePaste}
            />
          </div>

          {error && (
            <div className="app-soft-danger app-danger rounded px-3 py-2 text-xs">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

type ActionButtonProps = {
  label: string
  icon: ReactNode
  onClick: () => void
}

function ActionButton({ label, icon, onClick }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="app-button-secondary flex min-h-14 flex-col items-center justify-center gap-1 px-2 py-2 text-xs"
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
