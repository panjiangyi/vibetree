import { useState, useEffect } from 'react'
import { X, Folder, FolderOpen, ChevronRight, ArrowUp } from 'lucide-react'
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-neutral-900 rounded-lg w-[560px] max-h-[80vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-neutral-800">
          <h2 className="text-lg font-medium">Select Directory</h2>
          <button onClick={onClose} className="p-1 hover:bg-neutral-800 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-2 border-b border-neutral-800 flex items-center gap-1 text-sm overflow-x-auto">
          <button
            onClick={() => loadDirectory('/')}
            className="hover:text-blue-400 flex-shrink-0"
          >
            /
          </button>
          {pathParts.map((part, i) => (
            <span key={i} className="flex items-center gap-1 flex-shrink-0">
              <ChevronRight className="w-3 h-3 text-neutral-500" />
              <button
                onClick={() => handleNavigate('/' + pathParts.slice(0, i + 1).join('/'))}
                className="hover:text-blue-400"
              >
                {part}
              </button>
            </span>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-2 min-h-[300px]">
          {loading ? (
            <div className="flex items-center justify-center h-full text-neutral-500">
              Loading...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full text-red-400">
              {error}
            </div>
          ) : (
            <div className="space-y-0.5">
              {parentPath && (
                <button
                  onClick={handleGoUp}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-neutral-800 rounded text-sm"
                >
                  <ArrowUp className="w-4 h-4 text-neutral-400" />
                  <span>..</span>
                </button>
              )}
              {entries.map((entry) => (
                <button
                  key={entry.path}
                  onClick={() => handleNavigate(entry.path)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-neutral-800 rounded text-sm"
                >
                  <Folder className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                  <span className="truncate">{entry.name}</span>
                </button>
              ))}
              {entries.length === 0 && !parentPath && (
                <div className="text-center text-neutral-500 py-8">
                  Empty directory
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-neutral-800">
          <div className="text-sm text-neutral-400 mb-3 truncate">
            Selected: <span className="text-neutral-200">{currentPath}</span>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm bg-neutral-800 hover:bg-neutral-700 rounded"
            >
              Cancel
            </button>
            <button
              onClick={handleSelect}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded"
            >
              Select Directory
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
