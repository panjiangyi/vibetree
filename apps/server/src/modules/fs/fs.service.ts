import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { AppError } from '../../utils/app-error.js'

type DirectoryEntry = {
  name: string
  path: string
  isDir: boolean
}

type DirectoryListing = {
  path: string
  parent: string | null
  entries: DirectoryEntry[]
}

export type FsService = ReturnType<typeof createFsService>

export function createFsService() {
  return {
    listDirectory(dirPath?: string): DirectoryListing {
      const targetPath = dirPath || os.homedir()

      if (!path.isAbsolute(targetPath)) {
        throw new AppError('INVALID_PATH', 'Path must be absolute')
      }

      if (!fs.existsSync(targetPath)) {
        throw new AppError('PATH_NOT_FOUND', 'Path does not exist')
      }

      const stat = fs.statSync(targetPath)
      if (!stat.isDirectory()) {
        throw new AppError('NOT_DIRECTORY', 'Path is not a directory')
      }

      const entries: DirectoryEntry[] = []
      try {
        const items = fs.readdirSync(targetPath, { withFileTypes: true })
        for (const item of items) {
          if (item.name.startsWith('.')) continue
          entries.push({
            name: item.name,
            path: path.join(targetPath, item.name),
            isDir: item.isDirectory(),
          })
        }
      } catch {
        throw new AppError('READ_ERROR', 'Failed to read directory')
      }

      entries.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        return a.name.localeCompare(b.name)
      })

      const parent = path.dirname(targetPath)
      return {
        path: targetPath,
        parent: parent !== targetPath ? parent : null,
        entries,
      }
    },
  }
}
