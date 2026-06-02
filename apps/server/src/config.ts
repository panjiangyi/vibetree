import path from 'node:path'
import os from 'node:os'

export type AppConfig = {
  host: string
  port: number
  databasePath: string
  defaultShell: string
  terminal: {
    cols: number
    rows: number
    scrollback: number
  }
}

function getDefaultDbPath(): string {
  return path.join(os.homedir(), '.vibetree', 'vibetree.sqlite')
}

function getPlatformDefaultShell(): string {
  if (process.platform === 'win32') {
    return 'powershell.exe'
  }
  if (process.platform === 'darwin') {
    return process.env.SHELL || '/bin/zsh'
  }
  return process.env.SHELL || '/bin/bash'
}

export function getConfig(): AppConfig {
  return {
    host: process.env.VIBETREE_HOST ?? '127.0.0.1',
    port: Number(process.env.VIBETREE_PORT ?? 3767),
    databasePath: process.env.VIBETREE_DB ?? getDefaultDbPath(),
    defaultShell: getPlatformDefaultShell(),
    terminal: {
      cols: 120,
      rows: 30,
      scrollback: 10000,
    },
  }
}
