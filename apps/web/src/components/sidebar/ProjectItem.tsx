import { ChevronRight, ChevronDown, RefreshCw, Trash2 } from 'lucide-react'
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

  const isExpanded = expandedProjectIds.has(project.id)

  return (
    <div className="select-none">
      <div
        className="flex items-center gap-1 px-3 py-1.5 hover:bg-neutral-800/50 cursor-pointer group"
        onClick={() => toggleProjectExpanded(project.id)}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-neutral-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-neutral-400" />
        )}
        <span className="text-sm font-medium truncate flex-1">{project.name}</span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            refreshProject(project.id)
          }}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-neutral-700 rounded"
          title="Refresh"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
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
