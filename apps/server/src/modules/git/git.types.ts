export type GitWorktreeInfo = {
  path: string
  head: string | null
  branch: string | null
  detached: boolean
  bare: boolean
}
