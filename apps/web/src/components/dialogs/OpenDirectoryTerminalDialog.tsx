import { useState } from 'react'
import { FolderOpen, X } from 'lucide-react'
import { useUiStore } from '../../stores/ui.store.js'
import { useTerminalStore } from '../../stores/terminal.store.js'
import { DirectoryPicker } from './DirectoryPicker.js'

export function OpenDirectoryTerminalDialog() {
  const closeDialog = useUiStore((s) => s.closeDialog)
  const openDirectoryTerminal = useTerminalStore((s) => s.openDirectoryTerminal)

  const [cwd, setCwd] = useState('')
  const [title, setTitle] = useState('')
  const [showDirectoryPicker, setShowDirectoryPicker] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await openDirectoryTerminal({
        cwd: cwd.trim(),
        title: title.trim() || undefined,
      })
      closeDialog()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="app-dialog-overlay">
        <div className="app-dialog app-dialog-mobile max-w-[480px]">
          <div className="app-dialog-header">
            <h2 className="text-lg font-medium">Open Terminal</h2>
            <button onClick={closeDialog} className="app-icon-button">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Directory
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={cwd}
                  onChange={(e) => setCwd(e.target.value)}
                  placeholder="/path/to/project"
                  className="app-input flex-1"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowDirectoryPicker(true)}
                  className="app-button-secondary px-2 py-2"
                  title="Browse directories"
                >
                  <FolderOpen className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                Terminal Title <span className="app-subtle">(optional)</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Leave empty to use the directory name"
                className="app-input"
              />
            </div>

            {error && (
              <div className="text-sm app-danger app-soft-danger px-3 py-2 rounded">
                {error}
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                onClick={closeDialog}
                className="app-button-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !cwd.trim()}
                className={`app-button-primary ${loading || !cwd.trim() ? 'app-disabled' : ''}`}
              >
                {loading ? 'Opening...' : 'Open Terminal'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {showDirectoryPicker && (
        <DirectoryPicker
          onSelect={(path) => {
            setCwd(path)
            setShowDirectoryPicker(false)
          }}
          onClose={() => setShowDirectoryPicker(false)}
        />
      )}
    </>
  )
}
