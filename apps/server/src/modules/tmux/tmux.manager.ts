import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { buildShellLaunchConfig } from '../pty/compact-prompt.js'

type CreateTmuxSessionInput = {
  terminalId: string
  cwd: string
  shell: string
  env: Record<string, string>
  initialCommand?: string
}

type SpawnSpec = {
  file: string
  args: string[]
  env?: Record<string, string>
}

type TmuxBinarySpec = {
  binary: string
  env: Record<string, string>
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}

function buildEnvPrefix(env: Record<string, string>): string {
  const entries = Object.entries(env).filter(([, value]) => value != null)
  if (entries.length === 0) return ''
  return `env ${entries.map(([key, value]) => `${key}=${shellEscape(value)}`).join(' ')} `
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export type TmuxManager = ReturnType<typeof createTmuxManager>

function resolveBundledTmux(): TmuxBinarySpec | null {
  const repoRoot = path.resolve(import.meta.dirname, '../../../../../')
  const binary = path.join(repoRoot, 'tools', 'tmux-runtime', 'bin', 'tmux')
  const libDir = path.join(repoRoot, 'tools', 'tmux-runtime', 'lib')

  if (!fs.existsSync(binary)) {
    return null
  }

  const env: Record<string, string> = {}
  if (fs.existsSync(libDir)) {
    env.LD_LIBRARY_PATH = [libDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')
  }

  return { binary, env }
}

function resolveTmuxBinarySpec(): TmuxBinarySpec {
  if (process.env.VIBETREE_TMUX_BINARY) {
    return {
      binary: process.env.VIBETREE_TMUX_BINARY,
      env: process.env.VIBETREE_TMUX_LD_LIBRARY_PATH
        ? {
            LD_LIBRARY_PATH: [process.env.VIBETREE_TMUX_LD_LIBRARY_PATH, process.env.LD_LIBRARY_PATH]
              .filter(Boolean)
              .join(':'),
          }
        : {},
    }
  }

  return resolveBundledTmux() ?? { binary: 'tmux', env: {} }
}

export function createTmuxManager() {
  const binarySpec = resolveTmuxBinarySpec()
  let availability: boolean | null = null

  const sessionNameForTerminal = (terminalId: string) => `vibetree-${terminalId}`

  const execTmux = (args: string[]): string => {
    return execFileSync(binarySpec.binary, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...binarySpec.env,
      },
    }).trim()
  }

  const isAvailable = (): boolean => {
    if (availability != null) return availability
    try {
      execTmux(['-V'])
      availability = true
    } catch {
      availability = false
    }
    return availability
  }

  const hasSession = (terminalId: string): boolean => {
    if (!isAvailable()) return false

    try {
      execTmux(['has-session', '-t', sessionNameForTerminal(terminalId)])
      return true
    } catch {
      return false
    }
  }

  const createSession = (input: CreateTmuxSessionInput): void => {
    if (!isAvailable()) {
      throw new Error('tmux is not available')
    }

    const sessionName = sessionNameForTerminal(input.terminalId)
    const launchConfig = buildShellLaunchConfig(input.shell)
    const command =
      `${buildEnvPrefix({
        ...input.env,
        ...launchConfig.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        VIBETREE: '1',
        VIBETREE_TERMINAL_ID: input.terminalId,
      })}` +
      `exec ${shellEscape(launchConfig.shell)} ${launchConfig.args.map(shellEscape).join(' ')}`

    try {
      execTmux(['new-session', '-d', '-s', sessionName, '-c', input.cwd, command])
      if (input.initialCommand) {
        execTmux(['send-keys', '-t', sessionName, input.initialCommand, 'C-m'])
      }
    } catch (error) {
      throw normalizeError(error)
    }
  }

  const killSession = (terminalId: string): void => {
    if (!isAvailable()) return
    try {
      execTmux(['kill-session', '-t', sessionNameForTerminal(terminalId)])
    } catch {
      // Ignore missing sessions during cleanup.
    }
  }

  const getAttachSpawnSpec = (terminalId: string): SpawnSpec => ({
    file: binarySpec.binary,
    args: ['attach-session', '-t', sessionNameForTerminal(terminalId)],
    env: binarySpec.env,
  })

  return {
    binary: binarySpec.binary,
    isAvailable,
    hasSession,
    createSession,
    killSession,
    getAttachSpawnSpec,
    sessionNameForTerminal,
  }
}
