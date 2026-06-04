import { useCallback, useMemo, useRef, useState } from 'react'
import { ReactGridLayout } from 'react-grid-layout/legacy'
import type { LayoutItem } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import { X } from 'lucide-react'
import { GRID_COLS, GRID_ROWS, useLayoutStore } from '../../stores/layout.store.js'
import { useTerminalStore } from '../../stores/terminal.store.js'
import { TerminalPane } from './TerminalPane.js'

const MARGIN = 8

export function TerminalGrid() {
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
          compactType="horizontal"
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
