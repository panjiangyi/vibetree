import type { GitWorktreeInfo } from './git.types.js'

export function parseWorktreePorcelain(output: string): GitWorktreeInfo[] {
  const blocks = output
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)

  return blocks.map((block) => {
    const info: GitWorktreeInfo = {
      path: '',
      head: null,
      branch: null,
      detached: false,
      bare: false,
    }

    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) {
        info.path = line.slice('worktree '.length)
      } else if (line.startsWith('HEAD ')) {
        info.head = line.slice('HEAD '.length)
      } else if (line.startsWith('branch ')) {
        const ref = line.slice('branch '.length)
        info.branch = ref.replace(/^refs\/heads\//, '')
      } else if (line === 'detached') {
        info.detached = true
      } else if (line === 'bare') {
        info.bare = true
      }
    }

    return info
  })
}
