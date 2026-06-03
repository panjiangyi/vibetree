import { GitBranch, Terminal, Trash2, RefreshCw } from 'lucide-react'
import type { Worktree } from '@vibetree/shared'
import { useTerminalStore } from '../../stores/terminal.store.js'
import { useUiStore } from '../../stores/ui.store.js'

type Props = {
  worktree: Worktree
}

export function WorktreeItem({ worktree }: Props) {
  const openTerminalForWorktree = useTerminalStore((s) => s.openTerminalForWorktree)
  const terminals = useTerminalStore((s) => s.terminals)
  const openDialog = useUiStore((s) => s.openDialog)

  const runningCount = terminals.filter(
    (t) => t.worktreeId === worktree.id && t.status === 'running'
  ).length

  const displayName = worktree.displayName || worktree.name

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-800/50 cursor-pointer group"
      onClick={() => openTerminalForWorktree(worktree.id)}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {worktree.isMain ? (
            <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
              root
            </span>
          ) : (
            <GitBranch className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
          )}
          <span className="text-sm truncate">{displayName}</span>
        </div>
        {worktree.displayName && worktree.branch && !worktree.isMain && (
          <div className="text-xs text-neutral-500 truncate ml-5">
            {worktree.branch}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        {worktree.isDirty && (
          <span className="text-xs text-yellow-400">dirty</span>
        )}
        {runningCount > 0 && (
          <span className="flex items-center gap-0.5 text-xs text-green-400">
            <Terminal className="w-3 h-3" />
            {runningCount}
          </span>
        )}
      </div>

      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
        {!worktree.isMain && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              openDialog('removeWorktree', { worktree })
            }}
            className="p-1 hover:bg-neutral-700 rounded"
            title="Remove worktree"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  )
}
