import { useCallback } from 'react'
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
  const layout = useLayoutStore((s) => s.getCurrentLayout())
  const setLayoutForWorktree = useLayoutStore((s) => s.setLayoutForWorktree)
  const terminalIdToTitle = useLayoutStore((s) => s.terminalIdToTitle)
  const closeTerminal = useTerminalStore((s) => s.closeTerminal)

  const handleLayoutChange = useCallback(
    (newLayout: readonly LayoutItem[]) => {
      if (activeWorktreeId) {
        setLayoutForWorktree(activeWorktreeId, [...newLayout])
      }
    },
    [activeWorktreeId, setLayoutForWorktree]
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
        draggableHandle=".terminal-drag-handle"
        resizeHandles={['se']}
        compactType={null}
        preventCollision={false}
      >
        {layout.map((item) => (
          <div key={item.i} className="bg-neutral-900 border border-neutral-700 rounded overflow-hidden flex flex-col">
            <div className="terminal-drag-handle flex items-center justify-between px-2 py-1 bg-neutral-800 border-b border-neutral-700 cursor-move select-none">
              <span className="text-xs text-neutral-300 truncate">
                {terminalIdToTitle[item.i] || item.i}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeTerminal(item.i)
                }}
                className="p-0.5 hover:bg-red-600 rounded"
                title="Close terminal"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <TerminalPane terminalId={item.i} />
            </div>
          </div>
        ))}
      </GridLayout>
    </div>
  )
}
