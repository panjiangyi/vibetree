import { apiFetch } from './client.js'

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

export async function listDirectory(dirPath?: string): Promise<DirectoryListing> {
  const params = dirPath ? `?path=${encodeURIComponent(dirPath)}` : ''
  return apiFetch(`/api/fs/list${params}`)
}
