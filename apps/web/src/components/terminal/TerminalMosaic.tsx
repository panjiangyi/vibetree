import { Mosaic, MosaicWindow } from 'react-mosaic-component'
import 'react-mosaic-component/react-mosaic-component.css'
import { X, Plus } from 'lucide-react'
import { useLayoutStore } from '../../stores/layout.store.js'
import { useTerminalStore } from '../../stores/terminal.store.js'
import { TerminalPane } from './TerminalPane.js'

export function TerminalMosaic() {
  const activeWorktreeId = useLayoutStore((s) => s.activeWorktreeId)
  const layout = useLayoutStore((s) => s.getCurrentLayout())
  const setLayoutForWorktree = useLayoutStore((s) => s.setLayoutForWorktree)
  const terminalIdToTitle = useLayoutStore((s) => s.terminalIdToTitle)
  const openTerminalForWorktree = useTerminalStore((s) => s.openTerminalForWorktree)
  const closeTerminal = useTerminalStore((s) => s.closeTerminal)

  if (!activeWorktreeId || !layout) {
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
    <div className="flex-1 min-h-0">
      <Mosaic<string>
        value={layout}
        onChange={(newLayout) => setLayoutForWorktree(activeWorktreeId, newLayout)}
        renderTile={(id, path) => (
          <MosaicWindow<string>
            path={path}
            title={terminalIdToTitle[id] || id}
            toolbarControls={[
              <button
                key="new-terminal"
                onClick={() => openTerminalForWorktree(activeWorktreeId)}
                className="p-1 hover:bg-neutral-700 rounded"
                title="New terminal"
              >
                <Plus className="w-3 h-3" />
              </button>,
              <button
                key="close"
                onClick={() => closeTerminal(id)}
                className="p-1 hover:bg-red-600 rounded"
                title="Close terminal"
              >
                <X className="w-3 h-3" />
              </button>,
            ]}
          >
            <TerminalPane terminalId={id} />
          </MosaicWindow>
        )}
      />
    </div>
  )
}
