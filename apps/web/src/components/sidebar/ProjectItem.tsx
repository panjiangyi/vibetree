import { ChevronRight, ChevronDown, RefreshCw, Plus, Settings } from 'lucide-react'
import type { Project, Worktree } from '@vibetree/shared'
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
  const openDialog = useUiStore((s) => s.openDialog)

  const isExpanded = expandedProjectIds.has(project.id)

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
          {worktrees.map((worktree) => (
            <WorktreeItem
              key={worktree.id}
              project={project}
              worktree={worktree}
              collapsed={collapsed}
              mobile={mobile}
              onSelected={onWorktreeSelected}
            />
          ))}
        </div>
      )}
    </div>
  )
}
