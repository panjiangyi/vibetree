import { useTerminalStore } from '../../stores/terminal.store.js'
import { useLayoutStore } from '../../stores/layout.store.js'
import { useProjectStore } from '../../stores/project.store.js'
import { X } from 'lucide-react'

export function WorktreeTabs() {
  const activeWorktreeId = useTerminalStore((s) => s.activeWorktreeId)
  const setActiveWorktree = useTerminalStore((s) => s.setActiveWorktree)
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
          <button
            key={worktree.id}
            onClick={() => setActiveWorktree(worktree.id)}
            className={`
              flex items-center gap-2 px-3 py-2 text-sm border-r border-neutral-800
              hover:bg-neutral-800/50 whitespace-nowrap
              ${isActive ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-400'}
            `}
          >
            <span className="truncate max-w-[120px]">{displayName}</span>
            {terminalCount > 0 && (
              <span className="text-xs text-green-400">{terminalCount}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
