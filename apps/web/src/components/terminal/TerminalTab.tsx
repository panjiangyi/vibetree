import { X, RotateCw, AlertCircle } from 'lucide-react'
import type { TerminalSession } from '@vibetree/shared'

type Props = {
  terminal: TerminalSession
  isActive: boolean
  onClick: () => void
  onClose: () => void
  onRestart: () => void
}

export function TerminalTab({ terminal, isActive, onClick, onClose, onRestart }: Props) {
  const isDisconnected = terminal.status === 'disconnected'
  const isExited = terminal.status === 'exited' || terminal.status === 'killed'
  const isRunning = terminal.status === 'running'

  return (
    <div
      className={`
        flex items-center gap-2 px-3 py-2 text-sm cursor-pointer border-r
        min-w-[120px] max-w-[200px]
        ${isActive ? 'app-panel' : 'app-panel-strong app-muted app-hover'}
      `}
      onClick={onClick}
    >
      <div className="flex-1 truncate">
        <span className="truncate">{terminal.title}</span>
      </div>

      <div className="flex items-center gap-1">
        {isDisconnected && (
          <span title="Disconnected">
            <AlertCircle className="w-3.5 h-3.5 app-warning" />
          </span>
        )}
        {isExited && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRestart()
            }}
            className="app-icon-button p-0.5"
            title="Restart"
          >
            <RotateCw className="w-3.5 h-3.5 app-warning" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="app-icon-button p-0.5"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
