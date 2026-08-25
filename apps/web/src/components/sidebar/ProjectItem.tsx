import { useState } from 'react'
import { Archive, ArchiveRestore, ChevronRight, ChevronDown, RefreshCw, Plus, Settings } from 'lucide-react'
import type { Project, Worktree } from '@worktreehub/shared'
import { useUiStore } from '../../stores/ui.store.js'
import { useProjectStore } from '../../stores/project.store.js'
import { WorktreeItem } from './WorktreeItem.js'

type Props = {
  project: Project
  worktrees: Worktree[]
  collapsed?: boolean
  mobile?: boolean
  onWorktreeSelected?: () => void
}

export function ProjectItem({
  project,
  worktrees,
  collapsed = false,
  mobile = false,
  onWorktreeSelected,
}: Props) {
  const expandedProjectIds = useUiStore((s) => s.expandedProjectIds)
  const toggleProjectExpanded = useUiStore((s) => s.toggleProjectExpanded)
  const refreshProject = useProjectStore((s) => s.refreshProject)
  const setWorktreeArchived = useProjectStore((s) => s.setWorktreeArchived)
  const openDialog = useUiStore((s) => s.openDialog)
  const [showArchived, setShowArchived] = useState(false)

  const isExpanded = expandedProjectIds.has(project.id)
  const visibleWorktrees = worktrees.filter((worktree) => !worktree.isArchived)
  const archivedWorktrees = worktrees.filter((worktree) => worktree.isArchived)

  return (
    <div className="select-none">
      <div
        className={`flex items-center gap-1 px-3 app-hover cursor-pointer group rounded-md mx-1 ${mobile ? 'py-2.5' : 'py-1.5'}`}
        onClick={() => toggleProjectExpanded(project.id)}
        title={collapsed ? project.name : undefined}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 app-subtle shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 app-subtle shrink-0" />
        )}
        {!collapsed && <span className="text-sm font-medium break-words flex-1 min-w-0">{project.name}</span>}
        <div
          className={`${mobile || collapsed ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} flex items-center gap-0.5 ${collapsed ? 'ml-auto' : ''}`}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              openDialog('createWorktree', { projectId: project.id })
              onWorktreeSelected?.()
            }}
            className="app-icon-button"
            title="Create worktree"
          >
            <Plus className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              openDialog('projectSettings', { project })
              onWorktreeSelected?.()
            }}
            className="app-icon-button"
            title="Project settings"
          >
            <Settings className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              refreshProject(project.id)
            }}
            className="app-icon-button"
            title="Refresh"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className={collapsed ? 'ml-2' : 'ml-4'}>
          {visibleWorktrees.map((worktree) => (
            <WorktreeItem
              key={worktree.id}
              project={project}
              worktree={worktree}
              collapsed={collapsed}
              mobile={mobile}
              onSelected={onWorktreeSelected}
            />
          ))}
          {archivedWorktrees.length > 0 && !collapsed && (
            <div className="mt-1">
              <button
                type="button"
                className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs app-subtle app-hover rounded-md"
                onClick={() => setShowArchived((value) => !value)}
                aria-expanded={showArchived}
              >
                {showArchived ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <Archive className="w-3.5 h-3.5" />
                <span>Archived ({archivedWorktrees.length})</span>
              </button>
              {showArchived && archivedWorktrees.map((worktree) => {
                const displayName = worktree.displayName || worktree.name
                return (
                  <div key={worktree.id} className="group flex items-center gap-2 mx-1 px-3 py-1.5 app-subtle">
                    <span className="min-w-0 flex-1 truncate text-sm" title={displayName}>{displayName}</span>
                    <button
                      type="button"
                      className="app-icon-button shrink-0"
                      onClick={() => void setWorktreeArchived(worktree.id, false)}
                      aria-label={`Restore ${displayName}`}
                      title="Restore worktree"
                    >
                      <ArchiveRestore className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
