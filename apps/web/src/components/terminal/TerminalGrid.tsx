import { useCallback, useMemo } from 'react'
import { ReactGridLayout, WidthProvider } from 'react-grid-layout/legacy'
import type { LayoutItem } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import { X } from 'lucide-react'
import { useLayoutStore } from '../../stores/layout.store.js'
import { useTerminalStore } from '../../stores/terminal.store.js'
import { TerminalPane } from './TerminalPane.js'

const GridLayout = WidthProvider(ReactGridLayout)

export function TerminalGrid() {
  const activeWorktreeId = useLayoutStore((s) => s.activeWorktreeId)
  const layoutsByWorktreeId = useLayoutStore((s) => s.layoutsByWorktreeId)
  const setLayoutForWorktree = useLayoutStore((s) => s.setLayoutForWorktree)
  const terminalIdToTitle = useLayoutStore((s) => s.terminalIdToTitle)
  const closeTerminal = useTerminalStore((s) => s.closeTerminal)

  const layout = useMemo(() => {
    if (!activeWorktreeId) return []
    return layoutsByWorktreeId[activeWorktreeId] ?? []
  }, [activeWorktreeId, layoutsByWorktreeId])

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
      <div className="flex-1 flex items-center justify-center text-neutral-500">
        <div className="text-center">
          <p className="text-lg mb-2">No terminal opened</p>
          <p className="text-sm">Select a worktree from the left sidebar to open a terminal.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto p-2">
      <GridLayout
        layout={layout}
        cols={12}
        rowHeight={30}
        onLayoutChange={handleLayoutChange}
        draggableHandle=".drag-handle"
        resizeHandles={['se']}
        compactType={null}
        preventCollision={false}
        margin={[8, 8]}
      >
        {layout.map((item) => (
          <div key={item.i} className="bg-neutral-900 border border-neutral-700 rounded overflow-hidden">
            <div className="drag-handle flex items-center justify-between px-2 py-1 bg-neutral-800 border-b border-neutral-700 cursor-move select-none">
              <span className="text-xs text-neutral-300 truncate">
                {terminalIdToTitle[item.i] || item.i}
              </span>
              <span
                role="button"
                onClick={(e) => handleClose(item.i, e)}
                onMouseDown={(e) => e.stopPropagation()}
                className="p-0.5 hover:bg-red-600 rounded cursor-pointer"
                title="Close terminal"
              >
                <X className="w-3 h-3" />
              </span>
            </div>
            <div style={{ height: 'calc(100% - 28px)' }}>
              <TerminalPane terminalId={item.i} />
            </div>
          </div>
        ))}
      </GridLayout>
    </div>
  )
}
