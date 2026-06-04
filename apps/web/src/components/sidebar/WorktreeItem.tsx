import { GitBranch, Terminal, Trash2 } from 'lucide-react'
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
      className="flex items-center gap-2 px-3 py-1.5 app-hover cursor-pointer group rounded-md mx-1"
      onClick={() => openTerminalForWorktree(worktree.id)}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {worktree.isMain ? (
            <span className="app-badge">
              root
            </span>
          ) : (
            <GitBranch className="w-3.5 h-3.5 app-subtle flex-shrink-0" />
          )}
          <span className="text-sm truncate">{displayName}</span>
        </div>
        {worktree.displayName && worktree.branch && !worktree.isMain && (
          <div className="text-xs app-subtle truncate ml-5">
            {worktree.branch}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        {worktree.isDirty && (
          <span className="text-xs app-warning">dirty</span>
        )}
        {runningCount > 0 && (
          <span className="flex items-center gap-0.5 text-xs app-success">
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
            className="app-icon-button"
            title="Remove worktree"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  )
}
