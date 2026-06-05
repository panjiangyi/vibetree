import { useTerminalStore } from '../../stores/terminal.store.js'
import { useProjectStore } from '../../stores/project.store.js'
import { projectColorForIndex } from '../../utils/projectColor.js'
import { Plus, X } from 'lucide-react'

export function WorktreeTabs() {
  const activeWorktreeId = useTerminalStore((s) => s.activeWorktreeId)
  const setActiveWorktree = useTerminalStore((s) => s.setActiveWorktree)
  const createNewTerminalForWorktree = useTerminalStore((s) => s.createNewTerminalForWorktree)
  const closeWorktreeTerminals = useTerminalStore((s) => s.closeWorktreeTerminals)
  const terminals = useTerminalStore((s) => s.terminals)
  const projects = useProjectStore((s) => s.projects)
  const worktreesByProjectId = useProjectStore((s) => s.worktreesByProjectId)

  const activeWorktreeIds = new Set(terminals.map((t) => t.worktreeId))

  // Group open worktrees by their project so each tab carries project context.
  // Project order (and therefore color) follows the project list.
  const groups = projects
    .map((project, index) => ({
      project,
      color: projectColorForIndex(index),
      worktrees: (worktreesByProjectId[project.id] ?? []).filter((wt) =>
        activeWorktreeIds.has(wt.id)
      ),
    }))
    .filter((group) => group.worktrees.length > 0)

  if (groups.length === 0) return null

  return (
    <div className="flex border-b app-panel overflow-x-auto">
      {groups.map(({ project, color, worktrees }) => (
        <div key={project.id} className="flex items-stretch border-r">
          <div
            className="flex items-center gap-1.5 px-2 text-xs font-medium app-subtle whitespace-nowrap"
            title={project.name}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="truncate max-w-[120px]">{project.name}</span>
          </div>

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
                  flex items-center gap-1 px-3 py-2.5 md:py-2 text-sm border-l
                  ${isActive ? 'app-panel-strong' : 'app-muted'}
                `}
                style={isActive ? { boxShadow: `inset 0 2px 0 ${color}` } : undefined}
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
                  className="app-icon-button p-1 md:p-0.5"
                  title="New terminal"
                >
                  <Plus className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    closeWorktreeTerminals(worktree.id)
                  }}
                  className="app-icon-button p-1 md:p-0.5"
                  title="Close tab"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
