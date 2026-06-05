import { Menu, PanelLeftClose, PanelLeftOpen, Terminal, Plus, RefreshCw, Settings, FolderOpen } from 'lucide-react'
import { useUiStore } from '../../stores/ui.store.js'
import { useTerminalStore } from '../../stores/terminal.store.js'
import { useProjectStore } from '../../stores/project.store.js'
import { projectColorForIndex } from '../../utils/projectColor.js'

export function Header() {
  const openDialog = useUiStore((s) => s.openDialog)
  const toggleMobileSidebar = useUiStore((s) => s.toggleMobileSidebar)
  const toggleDesktopSidebar = useUiStore((s) => s.toggleDesktopSidebar)
  const isDesktopSidebarCollapsed = useUiStore((s) => s.isDesktopSidebarCollapsed)
  const terminals = useTerminalStore((s) => s.terminals)
  const activeScopeId = useTerminalStore((s) => s.activeScopeId)
  const projects = useProjectStore((s) => s.projects)
  const worktreesByProjectId = useProjectStore((s) => s.worktreesByProjectId)
  const refreshProject = useProjectStore((s) => s.refreshProject)

  const runningCount = terminals.filter((t) => t.status === 'running').length
  const activeTerminal = activeScopeId
    ? terminals.find((terminal) => terminal.scopeId === activeScopeId)
    : null

  const activeProjectIndex = activeTerminal?.scopeType === 'worktree'
    ? projects.findIndex((p) =>
        (worktreesByProjectId[p.id] ?? []).some((wt) => wt.id === activeTerminal.worktreeId)
      )
    : -1
  const activeProject = activeProjectIndex >= 0 ? projects[activeProjectIndex] : null
  const activeWorktree = activeProject && activeTerminal?.worktreeId
    ? (worktreesByProjectId[activeProject.id] ?? []).find((wt) => wt.id === activeTerminal.worktreeId)
    : null
  const activeWorktreeLabel =
    activeWorktree?.displayName || activeWorktree?.branch || activeWorktree?.name || null

  const handleRefreshAll = async () => {
    for (const project of projects) {
      await refreshProject(project.id)
    }
  }

  return (
    <header className="h-12 border-b app-panel flex items-center px-3 md:px-4 gap-2 md:gap-4">
      <button
        onClick={toggleMobileSidebar}
        className="app-icon-button p-2 md:hidden"
        aria-label="Open projects menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="flex items-center gap-2 font-semibold">
        <Terminal className="w-5 h-5 app-success" />
        <span className="hidden md:inline">VibeTree</span>
      </div>

      <button
        onClick={toggleDesktopSidebar}
        className="app-icon-button p-2 hidden md:inline-flex"
        aria-label={isDesktopSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={isDesktopSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isDesktopSidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
      </button>

      {activeTerminal?.scopeType === 'worktree' && activeProject && (
        <div
          className="md:hidden flex items-center gap-1.5 min-w-0 text-sm"
          title={activeWorktreeLabel ? `${activeProject.name} / ${activeWorktreeLabel}` : activeProject.name}
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: projectColorForIndex(activeProjectIndex) }}
          />
          <span className="font-medium truncate shrink-0 max-w-[40vw]">{activeProject.name}</span>
          {activeWorktreeLabel && (
            <>
              <span className="app-subtle shrink-0">/</span>
              <span className="app-muted truncate">{activeWorktreeLabel}</span>
            </>
          )}
        </div>
      )}

      {activeTerminal?.scopeType === 'directory' && (
        <div className="md:hidden flex items-center gap-1.5 min-w-0 text-sm" title={activeTerminal.cwd}>
          <FolderOpen className="w-4 h-4 app-warning shrink-0" />
          <span className="app-muted truncate">{activeTerminal.scopeLabel}</span>
        </div>
      )}

      <button
        onClick={() => openDialog('addProject')}
        className="app-button-secondary hidden md:flex items-center gap-1 py-1.5"
      >
        <Plus className="w-4 h-4" />
        Add Project
      </button>

      <button
        onClick={() => openDialog('openDirectoryTerminal')}
        className="app-button-secondary hidden md:flex items-center gap-1 py-1.5"
      >
        <FolderOpen className="w-4 h-4" />
        Open Terminal
      </button>

      <button
        onClick={handleRefreshAll}
        className="app-button-secondary hidden md:flex items-center gap-1 py-1.5"
      >
        <RefreshCw className="w-4 h-4" />
        Refresh
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-1.5 text-xs md:text-sm app-muted">
        <Terminal className="w-4 h-4" />
        <span className="hidden sm:inline">Running: </span>
        <span>{runningCount}</span>
      </div>

      <button
        onClick={() => openDialog('openDirectoryTerminal')}
        className="app-icon-button p-2 md:hidden"
        title="Open terminal"
      >
        <FolderOpen className="w-4 h-4" />
      </button>

      <button
        onClick={() => openDialog('settings')}
        className="app-icon-button p-2"
      >
        <Settings className="w-4 h-4" />
      </button>
    </header>
  )
}
