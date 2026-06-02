import { useState } from 'react'
import { X } from 'lucide-react'
import type { Project } from '@vibetree/shared'
import { useUiStore } from '../../stores/ui.store.js'
import { useProjectStore } from '../../stores/project.store.js'

export function ProjectSettingsDialog() {
  const closeDialog = useUiStore((s) => s.closeDialog)
  const activeDialogData = useUiStore((s) => s.activeDialogData)
  const updateProject = useProjectStore((s) => s.updateProject)

  const project = activeDialogData?.project as Project

  const [name, setName] = useState(project.name)
  const [mainBranch, setMainBranch] = useState(project.mainBranch)
  const [setupScript, setSetupScript] = useState(project.setupScript || '')
  const [worktreeBasePath, setWorktreeBasePath] = useState(project.worktreeBasePath)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await updateProject(project.id, {
        name: name.trim(),
        mainBranch: mainBranch.trim(),
        setupScript: setupScript.trim() || null,
        worktreeBasePath: worktreeBasePath.trim(),
      })
      closeDialog()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-neutral-900 rounded-lg w-[480px] shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-neutral-800">
          <h2 className="text-lg font-medium">Project Settings</h2>
          <button onClick={closeDialog} className="p-1 hover:bg-neutral-800 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Project Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-800 rounded border border-neutral-700 focus:border-blue-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              Main Branch
            </label>
            <input
              type="text"
              value={mainBranch}
              onChange={(e) => setMainBranch(e.target.value)}
              placeholder="main"
              className="w-full px-3 py-2 bg-neutral-800 rounded border border-neutral-700 focus:border-blue-500 focus:outline-none"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Default branch for new worktrees
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              Setup Script <span className="text-neutral-500">(optional)</span>
            </label>
            <textarea
              value={setupScript}
              onChange={(e) => setSetupScript(e.target.value)}
              placeholder="pnpm install"
              rows={3}
              className="w-full px-3 py-2 bg-neutral-800 rounded border border-neutral-700 focus:border-blue-500 focus:outline-none font-mono text-sm"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Runs automatically after creating a new worktree
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              Worktree Base Path
            </label>
            <input
              type="text"
              value={worktreeBasePath}
              onChange={(e) => setWorktreeBasePath(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-800 rounded border border-neutral-700 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-400/10 px-3 py-2 rounded">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeDialog}
              className="px-4 py-2 text-sm bg-neutral-800 hover:bg-neutral-700 rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
