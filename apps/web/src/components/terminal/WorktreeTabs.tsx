import { useTerminalStore } from '../../stores/terminal.store.js'
import { useProjectStore } from '../../stores/project.store.js'
import { Plus, X } from 'lucide-react'

export function WorktreeTabs() {
  const activeWorktreeId = useTerminalStore((s) => s.activeWorktreeId)
  const setActiveWorktree = useTerminalStore((s) => s.setActiveWorktree)
  const createNewTerminalForWorktree = useTerminalStore((s) => s.createNewTerminalForWorktree)
  const closeWorktreeTerminals = useTerminalStore((s) => s.closeWorktreeTerminals)
  const terminals = useTerminalStore((s) => s.terminals)
  const worktreesByProjectId = useProjectStore((s) => s.worktreesByProjectId)

  const activeWorktreeIds = new Set(terminals.map((t) => t.worktreeId))

  const worktrees = Object.values(worktreesByProjectId)
    .flat()
    .filter((wt) => activeWorktreeIds.has(wt.id))

  if (worktrees.length === 0) return null

  return (
    <div className="flex border-b border-neutral-800 bg-neutral-900 overflow-x-auto">
      {worktrees.map((worktree) => {
        const isActive = worktree.id === activeWorktreeId
        const terminalCount = terminals.filter(
          (t) => t.worktreeId === worktree.id && t.status === 'running'
        ).length
        const displayName = worktree.displayName || worktree.name

        return (
          <div
            key={worktree.id}
            className={`
              flex items-center gap-1 px-3 py-2 text-sm border-r border-neutral-800
              ${isActive ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-400'}
            `}
          >
            <button
              onClick={() => setActiveWorktree(worktree.id)}
              className="flex items-center gap-2 hover:text-neutral-100 whitespace-nowrap"
            >
              <span className="truncate max-w-[120px]">{displayName}</span>
              {terminalCount > 0 && (
                <span className="text-xs text-green-400">{terminalCount}</span>
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                createNewTerminalForWorktree(worktree.id)
              }}
              className="p-0.5 hover:bg-neutral-700 rounded"
              title="New terminal"
            >
              <Plus className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                closeWorktreeTerminals(worktree.id)
              }}
              className="p-0.5 hover:bg-neutral-700 rounded"
              title="Close tab"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
