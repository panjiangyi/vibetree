import path from 'node:path'
import { AppError, UNSAFE_PATH } from '../../utils/app-error.js'

export function normalizePath(p: string): string {
  return path.resolve(p)
}

export function assertPathInside(parent: string, child: string): void {
  const resolvedParent = normalizePath(parent)
  const resolvedChild = normalizePath(child)
  const relative = path.relative(resolvedParent, resolvedChild)

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new AppError(UNSAFE_PATH, 'Path is outside allowed directory')
  }
}
