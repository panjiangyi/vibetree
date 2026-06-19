import { Menu, PanelLeftClose, PanelLeftOpen, Terminal, Plus, RefreshCw, Settings, FolderOpen, LogOut, WifiOff } from 'lucide-react'
import { useAuthStore } from '../../stores/auth.store.js'
import { useLayoutStore } from '../../stores/layout.store.js'
import { useUiStore } from '../../stores/ui.store.js'
import { useTerminalStore } from '../../stores/terminal.store.js'
import { useProjectStore } from '../../stores/project.store.js'
import { terminalSocket } from '../../ws/terminal-socket.js'

function getMobileTitle(params: {
  activeTerminal: ReturnType<typeof useTerminalStore.getState>['terminals'][number] | null
  activeProject: ReturnType<typeof useProjectStore.getState>['projects'][number] | null
  activeWorktree: ReturnType<typeof useProjectStore.getState>['worktreesByProjectId'][string][number] | null
}) {
  const { activeTerminal, activeProject, activeWorktree } = params

  if (!activeTerminal) return 'VibeTree'

  if (activeTerminal.scopeType === 'directory') {
    return activeTerminal.scopeLabel || 'Directory Terminal'
  }

  if (!activeProject) return 'VibeTree'

  const alias = activeWorktree?.displayName || activeWorktree?.name
  const fallback = activeWorktree?.branch || null
  const worktreeLabel = alias || fallback

  return worktreeLabel ? `${activeProject.name} / ${worktreeLabel}` : activeProject.name
}

export function Header() {
  const logout = useAuthStore((s) => s.logout)
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
    ? terminals.find((terminal) => terminal.scopeId === activeScopeId) ?? null
    : null

  const activeProject = activeTerminal?.scopeType === 'worktree'
    ? projects.find((p) =>
        (worktreesByProjectId[p.id] ?? []).some((wt) => wt.id === activeTerminal.worktreeId)
      ) ?? null
    : null
  const activeWorktree = activeProject && activeTerminal?.worktreeId
    ? (worktreesByProjectId[activeProject.id] ?? []).find((wt) => wt.id === activeTerminal.worktreeId) ?? null
    : null
  const mobileTitle = getMobileTitle({ activeTerminal, activeProject, activeWorktree })

  const handleRefreshAll = async () => {
    for (const project of projects) {
      await refreshProject(project.id)
    }
  }

  const handleLogout = async () => {
    terminalSocket.disconnect()
    try {
      await logout()
    } finally {
      useProjectStore.setState({
        projects: [],
        worktreesByProjectId: {},
        loading: false,
        error: null,
      })
      useTerminalStore.setState({
        terminals: [],
        activeScopeId: null,
        loading: false,
        error: null,
      })
      useLayoutStore.setState({
        activeScopeId: null,
        terminalIdToTitle: {},
      })
      useUiStore.setState({
        activeDialog: null,
        activeDialogData: undefined,
        isMobileSidebarOpen: false,
      })
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

      <div className="hidden md:flex items-center gap-2 font-semibold">
        <Terminal className="w-5 h-5 app-success" />
        <span>VibeTree</span>
      </div>

      <button
        onClick={toggleDesktopSidebar}
        className="app-icon-button p-2 hidden md:inline-flex"
        aria-label={isDesktopSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={isDesktopSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isDesktopSidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
      </button>

      <div
        className="md:hidden min-w-0 flex-1 text-sm font-medium truncate"
        title={mobileTitle}
      >
        {mobileTitle}
      </div>

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

      <button
        onClick={() => terminalSocket.reconnect()}
        className="app-button-secondary hidden md:flex items-center gap-1 py-1.5"
        title="Reconnect WebSocket without page reload"
      >
        <WifiOff className="w-4 h-4" />
        Reconnect
      </button>

      <div className="hidden md:block flex-1" />

      <div className="hidden md:flex items-center gap-1.5 text-xs md:text-sm app-muted">
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
        onClick={() => terminalSocket.reconnect()}
        className="app-icon-button p-2 md:hidden"
        title="Reconnect"
      >
        <WifiOff className="w-4 h-4" />
      </button>

      <button
        onClick={() => openDialog('settings')}
        className="app-icon-button p-2"
      >
        <Settings className="w-4 h-4" />
      </button>

      <button
        onClick={() => void handleLogout()}
        className="app-icon-button p-2"
        title="Log out"
      >
        <LogOut className="w-4 h-4" />
      </button>
    </header>
  )
}
