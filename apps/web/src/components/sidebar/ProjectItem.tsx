import { ChevronRight, ChevronDown, RefreshCw, Plus, Settings } from 'lucide-react'
import type { Project, Worktree } from '@vibetree/shared'
import { useUiStore } from '../../stores/ui.store.js'
import { useProjectStore } from '../../stores/project.store.js'
import { WorktreeItem } from './WorktreeItem.js'

type Props = {
  project: Project
  worktrees: Worktree[]
}

export function ProjectItem({ project, worktrees }: Props) {
  const expandedProjectIds = useUiStore((s) => s.expandedProjectIds)
  const toggleProjectExpanded = useUiStore((s) => s.toggleProjectExpanded)
  const refreshProject = useProjectStore((s) => s.refreshProject)
  const openDialog = useUiStore((s) => s.openDialog)

  const isExpanded = expandedProjectIds.has(project.id)

  return (
    <div className="select-none">
      <div
        className="flex items-center gap-1 px-3 py-1.5 app-hover cursor-pointer group rounded-md mx-1"
        onClick={() => toggleProjectExpanded(project.id)}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 app-subtle" />
        ) : (
          <ChevronRight className="w-4 h-4 app-subtle" />
        )}
        <span className="text-sm font-medium truncate flex-1">{project.name}</span>
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
          <button
            onClick={(e) => {
              e.stopPropagation()
              openDialog('createWorktree', { projectId: project.id })
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
        <div className="ml-4">
          {worktrees.map((worktree) => (
            <WorktreeItem key={worktree.id} worktree={worktree} />
          ))}
        </div>
      )}
    </div>
  )
}
