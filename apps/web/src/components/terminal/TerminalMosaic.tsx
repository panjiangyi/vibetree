import { Mosaic, MosaicWindow } from 'react-mosaic-component'
import 'react-mosaic-component/react-mosaic-component.css'
import { X, Maximize2 } from 'lucide-react'
import { useLayoutStore } from '../../stores/layout.store.js'
import { useTerminalStore } from '../../stores/terminal.store.js'
import { TerminalPane } from './TerminalPane.js'

export function TerminalMosaic() {
  const layout = useLayoutStore((s) => s.layout)
  const setLayout = useLayoutStore((s) => s.setLayout)
  const removePane = useLayoutStore((s) => s.removePane)
  const terminalIdToTitle = useLayoutStore((s) => s.terminalIdToTitle)
  const setActiveTerminal = useTerminalStore((s) => s.setActiveTerminal)

  if (!layout) {
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
        onChange={(newLayout) => setLayout(newLayout)}
        renderTile={(id, path) => (
          <MosaicWindow<string>
            path={path}
            title={terminalIdToTitle[id] || id}
            toolbarControls={[
              <button
                key="maximize"
                onClick={() => setActiveTerminal(id)}
                className="p-1 hover:bg-neutral-700 rounded"
                title="Focus"
              >
                <Maximize2 className="w-3 h-3" />
              </button>,
              <button
                key="close"
                onClick={() => removePane(id)}
                className="p-1 hover:bg-neutral-700 rounded"
                title="Remove from layout"
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
