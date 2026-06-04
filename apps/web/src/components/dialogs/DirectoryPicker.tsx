import { useState, useEffect } from 'react'
import { X, Folder, ChevronRight, ArrowUp } from 'lucide-react'
import * as fsApi from '../../api/fs.api.js'

type DirectoryEntry = {
  name: string
  path: string
  isDir: boolean
}

type Props = {
  onSelect: (path: string) => void
  onClose: () => void
}

export function DirectoryPicker({ onSelect, onClose }: Props) {
  const [currentPath, setCurrentPath] = useState<string>('')
  const [parentPath, setParentPath] = useState<string | null>(null)
  const [entries, setEntries] = useState<DirectoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadDirectory = async (dirPath?: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await fsApi.listDirectory(dirPath)
      setCurrentPath(result.path)
      setParentPath(result.parent)
      setEntries(result.entries.filter((e) => e.isDir))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDirectory()
  }, [])

  const handleNavigate = (path: string) => {
    loadDirectory(path)
  }

  const handleGoUp = () => {
    if (parentPath) {
      loadDirectory(parentPath)
    }
  }

  const handleSelect = () => {
    onSelect(currentPath)
  }

  const pathParts = currentPath.split('/').filter(Boolean)

  return (
    <div className="app-dialog-overlay">
      <div className="app-dialog app-dialog-mobile max-w-[560px] flex flex-col">
        <div className="app-dialog-header">
          <h2 className="text-lg font-medium">Select Directory</h2>
          <button onClick={onClose} className="app-icon-button">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-2 border-b flex items-center gap-1 text-sm overflow-x-auto">
          <button
            onClick={() => loadDirectory('/')}
            className="app-link flex-shrink-0"
          >
            /
          </button>
          {pathParts.map((part, i) => (
            <span key={i} className="flex items-center gap-1 flex-shrink-0">
              <ChevronRight className="w-3 h-3 app-subtle" />
              <button
                onClick={() => handleNavigate('/' + pathParts.slice(0, i + 1).join('/'))}
                className="app-link"
              >
                {part}
              </button>
            </span>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-2 min-h-[220px]">
          {loading ? (
            <div className="flex items-center justify-center h-full app-subtle">
              Loading...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full app-danger">
              {error}
            </div>
          ) : (
            <div className="space-y-0.5">
              {parentPath && (
                <button
                  onClick={handleGoUp}
                  className="w-full flex items-center gap-2 px-3 py-2 app-hover rounded text-sm"
                >
                  <ArrowUp className="w-4 h-4 app-subtle" />
                  <span>..</span>
                </button>
              )}
              {entries.map((entry) => (
                <button
                  key={entry.path}
                  onClick={() => handleNavigate(entry.path)}
                  className="w-full flex items-center gap-2 px-3 py-2 app-hover rounded text-sm"
                >
                  <Folder className="w-4 h-4 app-warning flex-shrink-0" />
                  <span className="truncate">{entry.name}</span>
                </button>
              ))}
              {entries.length === 0 && !parentPath && (
                <div className="text-center app-subtle py-8">
                  Empty directory
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t">
          <div className="text-sm app-muted mb-3 truncate">
            Selected: <span>{currentPath}</span>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button
              onClick={onClose}
              className="app-button-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleSelect}
              className="app-button-primary"
            >
              Select Directory
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
