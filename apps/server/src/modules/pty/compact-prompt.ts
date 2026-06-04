import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

type ShellLaunchConfig = {
  shell: string
  args: string[]
  env: Record<string, string>
}

let promptDir: string | null = null

function ensurePromptDir(): string {
  if (promptDir) return promptDir

  promptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibetree-shell-'))

  const bashrc = String.raw`if [ -r "$HOME/.bashrc" ]; then
  . "$HOME/.bashrc"
fi

if [ -n "$PS1" ]; then
  PROMPT_DIRTRIM=1
  PS1='\[\e[32m\]\u@\h\[\e[0m\]:\[\e[34m\]\W\[\e[0m\]\$ '
fi
`

  const zshrc = String.raw`if [ -n "$VIBETREE_ORIGINAL_ZDOTDIR" ] && [ -r "$VIBETREE_ORIGINAL_ZDOTDIR/.zshrc" ]; then
  source "$VIBETREE_ORIGINAL_ZDOTDIR/.zshrc"
elif [ -r "$HOME/.zshrc" ]; then
  source "$HOME/.zshrc"
fi

if [[ -o interactive ]]; then
  PROMPT='%F{green}%n@%m%f:%F{blue}%1~%f %# '
fi
`

  fs.writeFileSync(path.join(promptDir, 'bashrc'), bashrc, { mode: 0o600 })
  fs.writeFileSync(path.join(promptDir, '.zshrc'), zshrc, { mode: 0o600 })
  return promptDir
}

function shellName(shell: string): string {
  return path.basename(shell)
}

export function buildShellLaunchConfig(shell: string): ShellLaunchConfig {
  if (process.env.VIBETREE_COMPACT_PROMPT === '0') {
    return { shell, args: [], env: {} }
  }

  const name = shellName(shell)
  if (name === 'bash') {
    const dir = ensurePromptDir()
    return {
      shell,
      args: ['--rcfile', path.join(dir, 'bashrc'), '-i'],
      env: {
        PROMPT_DIRTRIM: '1',
      },
    }
  }

  if (name === 'zsh') {
    const dir = ensurePromptDir()
    return {
      shell,
      args: [],
      env: {
        ZDOTDIR: dir,
        VIBETREE_ORIGINAL_ZDOTDIR: process.env.ZDOTDIR ?? '',
      },
    }
  }

  return { shell, args: [], env: {} }
}
