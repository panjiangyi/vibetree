import { X, RotateCw, AlertCircle, Loader2 } from 'lucide-react'
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
        flex items-center gap-2 px-3 py-2 text-sm cursor-pointer border-r border-neutral-800
        min-w-[120px] max-w-[200px]
        ${isActive ? 'bg-neutral-950 text-neutral-100' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'}
      `}
      onClick={onClick}
    >
      <div className="flex-1 truncate">
        <span className="truncate">{terminal.title}</span>
      </div>

      <div className="flex items-center gap-1">
        {isDisconnected && (
          <span title="Disconnected">
            <AlertCircle className="w-3.5 h-3.5 text-yellow-400" />
          </span>
        )}
        {isExited && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRestart()
            }}
            className="p-0.5 hover:bg-neutral-700 rounded"
            title="Restart"
          >
            <RotateCw className="w-3.5 h-3.5 text-yellow-400" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="p-0.5 hover:bg-neutral-700 rounded"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
