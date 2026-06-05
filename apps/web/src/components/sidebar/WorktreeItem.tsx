import { GitBranch, Pencil, Play, Terminal, Trash2 } from 'lucide-react'
import type { Project, Worktree } from '@vibetree/shared'
import { useLayoutStore } from '../../stores/layout.store.js'
import { useTerminalStore } from '../../stores/terminal.store.js'
import { useUiStore } from '../../stores/ui.store.js'

type Props = {
  project: Project
  worktree: Worktree
  mobile?: boolean
  onSelected?: () => void
}

export function WorktreeItem({ project, worktree, mobile = false, onSelected }: Props) {
  const openTerminalForWorktree = useTerminalStore((s) => s.openTerminalForWorktree)
  const createTerminal = useTerminalStore((s) => s.createTerminal)
  const setActiveWorktree = useTerminalStore((s) => s.setActiveWorktree)
  const terminals = useTerminalStore((s) => s.terminals)
  const openDialog = useUiStore((s) => s.openDialog)
  const addPaneForTerminal = useLayoutStore((s) => s.addPaneForTerminal)

  const runningCount = terminals.filter(
    (t) => t.worktreeId === worktree.id && t.status === 'running'
  ).length

  const displayName = worktree.displayName || worktree.name
  const mergeStatus = worktree.mergeCheck?.status
  const mergeLabel = mergeStatus === 'not_applicable' ? null : mergeStatus
  const mergeClass =
    mergeStatus === 'merged' || mergeStatus === 'rebased'
      ? 'app-success'
      : mergeStatus === 'unmerged'
        ? 'app-warning'
        : 'app-subtle'
  const handleOpen = async () => {
    await openTerminalForWorktree(worktree.id)
    onSelected?.()
  }

  const handleStartDevServer = async () => {
    if (!project.devServerScript) return

    setActiveWorktree(worktree.id)
    const terminal = await createTerminal(worktree.id, {
      title: 'dev server',
      initialCommand: project.devServerScript,
    })
    addPaneForTerminal(worktree.id, terminal.id, terminal.title)
    onSelected?.()
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 app-hover cursor-pointer group rounded-md mx-1 ${mobile ? 'py-2.5' : 'py-1.5'}`}
      onClick={handleOpen}
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
        {worktree.displayName && worktree.branch && (
          <div className="text-xs app-subtle truncate ml-5">
            {worktree.branch}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        {worktree.isDirty && (
          <span className="text-xs app-warning">dirty</span>
        )}
        {!worktree.isMain && mergeLabel && (
          <span className={`text-xs ${mergeClass}`} title={worktree.mergeCheck?.reason}>
            {mergeLabel}
          </span>
        )}
        {runningCount > 0 && (
          <span className="flex items-center gap-0.5 text-xs app-success">
            <Terminal className="w-3 h-3" />
            {runningCount}
          </span>
        )}
      </div>

      <div className={`${mobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} flex items-center gap-0.5`}>
        <button
          onClick={(e) => {
            e.stopPropagation()
            void handleStartDevServer()
          }}
          className="app-icon-button"
          title={project.devServerScript ? 'Start dev server' : 'Configure dev server script first'}
          disabled={!project.devServerScript}
        >
          <Play className="w-3 h-3" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            openDialog('editWorktreeAlias', { worktree })
            onSelected?.()
          }}
          className="app-icon-button"
          title="Edit alias"
        >
          <Pencil className="w-3 h-3" />
        </button>
        {!worktree.isMain && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              openDialog('removeWorktree', { worktree })
              onSelected?.()
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
