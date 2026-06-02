import { useProjectStore } from '../../stores/project.store.js'
import { ProjectItem } from './ProjectItem.js'
import { FolderOpen } from 'lucide-react'
import { useUiStore } from '../../stores/ui.store.js'

export function Sidebar() {
  const projects = useProjectStore((s) => s.projects)
  const worktreesByProjectId = useProjectStore((s) => s.worktreesByProjectId)
  const openDialog = useUiStore((s) => s.openDialog)

  return (
    <aside className="w-72 border-r border-neutral-800 flex flex-col bg-neutral-950">
      <div className="px-3 py-2 text-xs uppercase text-neutral-500 font-medium">
        Projects
      </div>

      <div className="flex-1 overflow-auto">
        {projects.length === 0 ? (
          <div className="p-4 text-center text-neutral-500">
            <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No projects yet</p>
            <button
              onClick={() => openDialog('addProject')}
              className="mt-2 text-xs text-blue-400 hover:text-blue-300"
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
            />
          ))
        )}
      </div>
    </aside>
  )
}
