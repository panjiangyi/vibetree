import { useProjectStore } from '../../stores/project.store.js'
import { ProjectItem } from './ProjectItem.js'
import { FolderOpen, Plus, RefreshCw } from 'lucide-react'
import { useUiStore } from '../../stores/ui.store.js'

type Props = {
  mobile?: boolean
  onWorktreeSelected?: () => void
}

export function Sidebar({ mobile = false, onWorktreeSelected }: Props) {
  const projects = useProjectStore((s) => s.projects)
  const worktreesByProjectId = useProjectStore((s) => s.worktreesByProjectId)
  const refreshProject = useProjectStore((s) => s.refreshProject)
  const openDialog = useUiStore((s) => s.openDialog)

  const handleRefreshAll = async () => {
    for (const project of projects) {
      await refreshProject(project.id)
    }
  }

  const handleAddProject = () => {
    openDialog('addProject')
    onWorktreeSelected?.()
  }

  return (
    <aside className={`${mobile ? 'h-full w-full' : 'w-72'} border-r app-panel flex flex-col`}>
      <div className="px-3 py-2 text-xs uppercase app-subtle font-medium">
        Projects
      </div>

      {mobile && (
        <div className="grid grid-cols-2 gap-2 px-3 pb-3">
          <button
            onClick={handleAddProject}
            className="app-button-secondary flex items-center justify-center gap-1 py-2"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
          <button
            onClick={handleRefreshAll}
            className="app-button-secondary flex items-center justify-center gap-1 py-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto pb-safe">
        {projects.length === 0 ? (
          <div className="p-4 text-center app-subtle">
            <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No projects yet</p>
            <button
              onClick={handleAddProject}
              className="mt-2 text-xs app-link"
            >
              Add your first project
            </button>
          </div>
        ) : (
          projects.map((project) => (
            <ProjectItem
              key={project.id}
              project={project}
              worktrees={worktreesByProjectId[project.id] ?? []}
              mobile={mobile}
              onWorktreeSelected={onWorktreeSelected}
            />
          ))
        )}
      </div>
    </aside>
  )
}
