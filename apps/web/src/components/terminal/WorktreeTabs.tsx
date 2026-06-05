import { useTerminalStore } from '../../stores/terminal.store.js'
import { useProjectStore } from '../../stores/project.store.js'
import { projectColorForIndex } from '../../utils/projectColor.js'
import { Plus, X, FolderOpen } from 'lucide-react'

export function WorktreeTabs() {
  const activeScopeId = useTerminalStore((s) => s.activeScopeId)
  const setActiveScope = useTerminalStore((s) => s.setActiveScope)
  const createNewTerminalForScope = useTerminalStore((s) => s.createNewTerminalForScope)
  const closeScopeTerminals = useTerminalStore((s) => s.closeScopeTerminals)
  const terminals = useTerminalStore((s) => s.terminals)
  const projects = useProjectStore((s) => s.projects)
  const worktreesByProjectId = useProjectStore((s) => s.worktreesByProjectId)

  const activeScopeIds = new Set(terminals.map((t) => t.scopeId))
  const directoryScopes = Array.from(
    new Map(
      terminals
        .filter((terminal) => terminal.scopeType === 'directory')
        .map((terminal) => [terminal.scopeId, terminal])
    ).values()
  )

  const groups = projects
    .map((project, index) => ({
      project,
      color: projectColorForIndex(index),
      worktrees: (worktreesByProjectId[project.id] ?? []).filter((wt) => activeScopeIds.has(wt.id)),
    }))
    .filter((group) => group.worktrees.length > 0)

  if (groups.length === 0 && directoryScopes.length === 0) return null

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
            const scopeId = worktree.id
            const isActive = scopeId === activeScopeId
            const terminalCount = terminals.filter(
              (t) => t.scopeId === scopeId && t.status === 'running'
            ).length
            const displayName = worktree.displayName || worktree.name

            return (
              <div
                key={scopeId}
                className={`
                  flex items-center gap-1 px-3 py-2.5 md:py-2 text-sm border-l
                  ${isActive ? 'app-panel-strong' : 'app-muted'}
                `}
                style={isActive ? { boxShadow: `inset 0 2px 0 ${color}` } : undefined}
              >
                <button
                  onClick={() => setActiveScope(scopeId)}
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
                    void createNewTerminalForScope(scopeId)
                  }}
                  className="app-icon-button p-1 md:p-0.5"
                  title="New terminal"
                >
                  <Plus className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    void closeScopeTerminals(scopeId)
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

      {directoryScopes.length > 0 && (
        <div className="flex items-stretch border-r">
          <div className="flex items-center gap-1.5 px-2 text-xs font-medium app-subtle whitespace-nowrap">
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Directories</span>
          </div>
          {directoryScopes.map((terminal) => {
            const isActive = terminal.scopeId === activeScopeId
            const terminalCount = terminals.filter(
              (item) => item.scopeId === terminal.scopeId && item.status === 'running'
            ).length
            return (
              <div
                key={terminal.scopeId}
                className={`
                  flex items-center gap-1 px-3 py-2.5 md:py-2 text-sm border-l
                  ${isActive ? 'app-panel-strong' : 'app-muted'}
                `}
              >
                <button
                  onClick={() => setActiveScope(terminal.scopeId)}
                  className="flex items-center gap-2 whitespace-nowrap"
                  title={terminal.cwd}
                >
                  <span className="truncate max-w-[clamp(120px,18vw,260px)]">{terminal.scopeLabel}</span>
                  {terminalCount > 0 && (
                    <span className="text-xs app-success">{terminalCount}</span>
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    void createNewTerminalForScope(terminal.scopeId)
                  }}
                  className="app-icon-button p-1 md:p-0.5"
                  title="New terminal"
                >
                  <Plus className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    void closeScopeTerminals(terminal.scopeId)
                  }}
                  className="app-icon-button p-1 md:p-0.5"
                  title="Close tab"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          )}
        </div>
      )}
    </div>
  )
}
