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
    <div className="flex border-b app-panel overflow-x-auto">
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
              flex items-center gap-1 px-3 py-2 text-sm border-r
              ${isActive ? 'app-panel-strong' : 'app-muted'}
            `}
          >
            <button
              onClick={() => setActiveWorktree(worktree.id)}
              className="flex items-center gap-2 whitespace-nowrap"
            >
              <span className="truncate max-w-[clamp(120px,18vw,260px)]">{displayName}</span>
              {terminalCount > 0 && (
                <span className="text-xs app-success">{terminalCount}</span>
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                createNewTerminalForWorktree(worktree.id)
              }}
              className="app-icon-button p-0.5"
              title="New terminal"
            >
              <Plus className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                closeWorktreeTerminals(worktree.id)
              }}
              className="app-icon-button p-0.5"
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
