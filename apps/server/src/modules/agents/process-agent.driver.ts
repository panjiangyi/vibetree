import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { AgentDefinition } from '@worktreehub/shared'
import type { AgentEvent, AgentRunInput, AgentRunResult, CodingAgentDriver } from './agent.types.js'

type ProcessSpec = { command: string; args: string[]; env?: Record<string, string> }

function interpolate(value: string, vars: Record<string, string>): string {
  return value.replace(/\{(prompt|cwd|session|images)\}/g, (_, key: string) => vars[key] ?? '')
}

function textAt(value: unknown, paths: string[][]): string | null {
  for (const path of paths) {
    let cursor: unknown = value
    for (const key of path) {
      if (!cursor || typeof cursor !== 'object') { cursor = null; break }
      cursor = (cursor as Record<string, unknown>)[key]
    }
    if (typeof cursor === 'string' && cursor.trim()) return cursor
  }
  return null
}

function parseNormalizedEvent(raw: Record<string, unknown>): AgentEvent | null {
  const type = String(raw.type ?? raw.event ?? '')
  const sessionId = textAt(raw, [['thread_id'], ['session_id'], ['sessionId'], ['thread', 'id']])
  if (sessionId && /thread|session/.test(type)) return { type: 'session', sessionId }

  const item = raw.item && typeof raw.item === 'object' ? raw.item as Record<string, unknown> : raw
  const itemType = String(item.type ?? type)
  const text = textAt(item, [['text'], ['message'], ['content'], ['result']])
    ?? textAt(raw, [['message', 'content'], ['result'], ['content']])
  if (text && /agent_message|assistant|text|message/.test(itemType) && !/user/.test(itemType)) {
    return { type: 'message', text }
  }
  const command = textAt(item, [['command'], ['cmd']])
  if (command && /started|start|command/.test(type)) return { type: 'progress', message: 'Agent 正在运行命令。' }
  return null
}

export class ProcessAgentDriver implements CodingAgentDriver {
  readonly capabilities

  constructor(
    readonly definition: AgentDefinition,
    private buildSpec: (input: AgentRunInput) => ProcessSpec,
  ) {
    this.capabilities = new Set(definition.capabilities)
  }

  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    return await new Promise((resolve) => {
      const child = spawn(this.definition.executable, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
      let output = ''
      child.stdout.on('data', (chunk) => { output += String(chunk) })
      child.stderr.on('data', (chunk) => { output += String(chunk) })
      child.once('error', (error) => resolve({ ok: false, detail: error.message }))
      child.once('exit', (code) => resolve({ ok: code === 0, detail: output.trim().slice(0, 200) || `exit ${code}` }))
    })
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const spec = this.buildSpec(input)
    return await new Promise((resolve, reject) => {
      const child = spawn(spec.command, spec.args, {
        cwd: input.cwd,
        env: { ...process.env, ...spec.env, NO_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let detail = ''
      let finalMessage = ''
      let providerSessionId = input.providerSessionId
      let settled = false

      const abort = () => child.kill('SIGTERM')
      input.signal.addEventListener('abort', abort, { once: true })
      child.once('error', (error) => { if (!settled) { settled = true; reject(error) } })

      const lines = createInterface({ input: child.stdout })
      lines.on('line', (line) => {
        detail += `${line}\n`
        try {
          const raw = JSON.parse(line) as Record<string, unknown>
          const session = textAt(raw, [['thread_id'], ['session_id'], ['sessionId'], ['thread', 'id']])
          if (session) providerSessionId = session
          const event = parseNormalizedEvent(raw)
          if (event) {
            if (event.type === 'message') finalMessage = event.text
            void input.onEvent(event)
          }
        } catch {
          if (line.trim()) finalMessage = line.trim()
        }
      })
      child.stderr.on('data', (chunk) => { detail += String(chunk) })
      child.once('exit', (code, signal) => {
        input.signal.removeEventListener('abort', abort)
        if (settled) return
        settled = true
        if (input.signal.aborted) return reject(new Error('Task cancelled'))
        if (code !== 0) return reject(new Error(`Agent exited with ${signal ?? code}: ${detail.slice(-1000)}`))
        resolve({ providerSessionId, finalMessage: finalMessage || '任务已完成。', detail })
      })
    })
  }
}

export function buildBuiltinDriver(definition: AgentDefinition): CodingAgentDriver {
  if (definition.id === 'codex') {
    return new ProcessAgentDriver(definition, (input) => ({
      command: definition.executable,
      args: input.providerSessionId
        ? ['exec', 'resume', '--json', ...input.imagePaths.flatMap((p) => ['-i', p]), input.providerSessionId, input.prompt]
        : ['exec', '--json', '--color', 'never', '--sandbox', 'workspace-write', '-C', input.cwd,
            ...input.imagePaths.flatMap((p) => ['-i', p]), input.prompt],
    }))
  }
  if (definition.id === 'claude') {
    return new ProcessAgentDriver(definition, (input) => ({
      command: definition.executable,
      args: ['-p', '--verbose', '--output-format', 'stream-json', '--permission-mode', 'acceptEdits',
        ...(input.providerSessionId ? ['--resume', input.providerSessionId] : []),
        input.imagePaths.length ? `${input.prompt}\n\n请同时查看这些本地图片附件：\n${input.imagePaths.join('\n')}` : input.prompt],
    }))
  }
  if (definition.id === 'opencode') {
    return new ProcessAgentDriver(definition, (input) => ({
      command: definition.executable,
      args: ['run', '--format', 'json', '--dir', input.cwd,
        ...(input.providerSessionId ? ['--session', input.providerSessionId] : []),
        ...input.imagePaths.flatMap((p) => ['--file', p]), input.prompt],
    }))
  }
  throw new Error(`Unknown built-in agent: ${definition.id}`)
}

export function buildCommandDriver(definition: AgentDefinition): CodingAgentDriver {
  return new ProcessAgentDriver(definition, (input) => {
    const config = definition.config
    const argsTemplate = (input.providerSessionId ? config.resumeArgs : config.args) as string[] | undefined
    const vars = { prompt: input.prompt, cwd: input.cwd, session: input.providerSessionId ?? '', images: input.imagePaths.join(',') }
    return { command: definition.executable, args: (argsTemplate ?? ['{prompt}']).map((arg) => interpolate(arg, vars)) }
  })
}
