import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { nanoid } from 'nanoid'
import type { createProjectRepository } from '../../db/repositories/project.repository.js'
import type { createWorktreeRepository } from '../../db/repositories/worktree.repository.js'
import type { WeixinRepository, CodingTaskRecord } from '../../db/repositories/weixin.repository.js'
import type { WorktreeService } from '../worktrees/worktree.service.js'
import type { ProjectService } from '../projects/project.service.js'
import type { AgentRegistry } from '../agents/agent.registry.js'
import type { AgentEvent } from '../agents/agent.types.js'
import type { AppConfig } from '../../config.js'
import { WeixinClient, type WeixinMessage, type WeixinMedia } from './weixin.client.js'
import { chunks, cleanAgentText, summarizeFinal } from './message.formatter.js'

type ProjectRepo = ReturnType<typeof createProjectRepository>
type WorktreeRepo = ReturnType<typeof createWorktreeRepository>
type Pairing = { code: string; expiresAt: number } | null
type QueuedRun = { task: CodingTaskRecord; cwd: string; imagePaths: string[]; agentId: string; worktreeId: string }

const HELP = `可发送编码任务，也可以发送以下关键词：
项目 / 切换项目
工作区 / 切换工作区
新建工作区
助手 / 切换助手
状态
停止
查看详情
新会话
帮助`

export function createWeixinService(deps: {
  config: AppConfig
  repo: WeixinRepository
  projectRepo: ProjectRepo
  worktreeRepo: WorktreeRepo
  worktreeService: WorktreeService
  projectService: ProjectService
  agents: AgentRegistry
}) {
  const { config, repo, projectRepo, worktreeRepo, worktreeService, projectService, agents } = deps
  const client = new WeixinClient(config.weixin)
  const mediaDir = path.join(os.homedir(), '.worktreehub', 'weixin-media')
  fs.mkdirSync(mediaDir, { recursive: true, mode: 0o700 })
  const controllers = new Map<string, AbortController>()
  const activeDrivers = new Map<string, ReturnType<AgentRegistry['get']>>()
  const queues = new Map<string, QueuedRun[]>()
  let pairing: Pairing = null
  let stopped = false
  let pollTimer: NodeJS.Timeout | null = null
  let outboxTimer: NodeJS.Timeout | null = null
  let lastError: string | null = null

  const enqueueText = (userId: string, text: string) => {
    const pieces = chunks(text)
    for (const [index, part] of pieces.entries()) {
      const content = pieces.length > 1 ? `[${index + 1}/${pieces.length}]\n${part}` : part
      repo.enqueueOutbox({ id: `out_${nanoid()}`, accountId: config.weixin.accountId, userId, kind: 'text', payload: { text: content } })
    }
    void flushOutbox()
  }

  async function flushOutbox(): Promise<void> {
    if (!config.weixin.enabled || !config.weixin.apiKey || !config.weixin.accountId) return
    for (const item of repo.claimPendingOutbox()) {
      try {
        if (item.kind === 'text') await client.sendText(item.userId, String(item.payload.text ?? ''))
        else await client.sendFile(item.userId, String(item.payload.path), String(item.payload.filename), String(item.payload.mime))
        repo.markOutboxSent(item.id)
      } catch (error) {
        lastError = (error as Error).message
        repo.markOutboxFailed(item.id, item.attempts + 1, lastError)
      }
    }
  }

  function projectMenu(bindingId: string, userId: string): void {
    const projects = projectRepo.findAll()
    if (!projects.length) { enqueueText(userId, 'WorktreeHub 中还没有项目，请先在网页添加。'); return }
    repo.setPending(bindingId, 'select_project', { ids: projects.map((p) => p.id) })
    enqueueText(userId, `请选择项目：\n${projects.map((p, i) => `${i + 1}. ${p.name}`).join('\n')}`)
  }

  function worktreeMenu(bindingId: string, userId: string, projectId: string): void {
    const project = projectRepo.findById(projectId)
    const worktrees = worktreeRepo.findByProjectId(projectId)
    if (!project || !worktrees.length) { enqueueText(userId, '这个项目没有可用的 worktree。'); return }
    repo.setPending(bindingId, 'select_worktree', { projectId, ids: worktrees.map((w) => w.id) })
    enqueueText(userId, `请选择 ${project.name} 的工作区：\n${worktrees.map((w, i) => `${i + 1}. ${w.displayName || w.name}${w.isDirty ? '（有修改）' : ''}`).join('\n')}`)
  }

  function agentMenu(bindingId: string, userId: string): void {
    const available = agents.list().filter((agent) => agent.enabled)
    repo.setPending(bindingId, 'select_agent', { ids: available.map((agent) => agent.id) })
    enqueueText(userId, `请选择 coding agent：\n${available.map((agent, i) => `${i + 1}. ${agent.name}`).join('\n')}`)
  }

  async function saveMedia(message: WeixinMessage): Promise<string[]> {
    if (!message.media || message.media.type !== 'image') return []
    const bytes = await client.downloadMedia(message.media)
    const extension = extensionFor(message.media)
    const filePath = path.join(mediaDir, `${config.weixin.accountId.replace(/[^a-zA-Z0-9_-]/g, '_')}-${message.seq}${extension}`)
    fs.writeFileSync(filePath, Buffer.from(bytes), { mode: 0o600 })
    return [filePath]
  }

  function extensionFor(media: WeixinMedia): string {
    if (media.mime === 'image/jpeg') return '.jpg'
    if (media.mime === 'image/webp') return '.webp'
    if (media.mime === 'image/gif') return '.gif'
    return '.png'
  }

  async function submitTask(bindingId: string, userId: string, text: string, seq: number, imagePaths: string[]): Promise<void> {
    const binding = repo.getBinding()
    const worktree = binding?.activeWorktreeId ? worktreeRepo.findById(binding.activeWorktreeId) : null
    if (!binding || !worktree) { projectMenu(bindingId, userId); return }
    const agentId = binding.activeAgentId
    const driver = agents.get(agentId)
    if (imagePaths.length && !driver.capabilities.has('images')) {
      enqueueText(userId, `${driver.definition.name} 不支持图片输入。请切换助手或补充文字描述。`)
      return
    }
    let session = repo.getSession(binding.id, worktree.id, agentId)
    const timestamp = new Date().toISOString()
    if (!session) {
      session = { id: `session_${nanoid()}`, bindingId: binding.id, worktreeId: worktree.id, agentId,
        providerSessionId: null, status: 'ready', createdAt: timestamp, updatedAt: timestamp }
      repo.insertSession(session)
    }
    const task: CodingTaskRecord = { id: `task_${nanoid()}`, sessionId: session.id, sourceMessageSeq: seq,
      prompt: text || '请分析附图并处理其中展示的问题。', status: 'queued', summary: null, detail: null,
      error: null, startedAt: null, completedAt: null, createdAt: timestamp, updatedAt: timestamp }
    repo.insertTask(task)
    const run = { task, cwd: worktree.path, imagePaths, agentId, worktreeId: worktree.id }
    const queue = queues.get(worktree.id) ?? []
    queue.push(run); queues.set(worktree.id, queue)
    enqueueText(userId, `已收到任务 ${task.id.slice(-6)}。\n工作区：${worktree.displayName || worktree.name}\n助手：${driver.definition.name}${controllers.has(worktree.id) ? '\n当前工作区忙碌，任务已排队。' : ''}`)
    void runNext(worktree.id, userId)
  }

  async function runNext(worktreeId: string, userId: string): Promise<void> {
    if (controllers.has(worktreeId)) return
    const queue = queues.get(worktreeId)
    const run = queue?.shift()
    if (!run) return
    const controller = new AbortController(); controllers.set(worktreeId, controller)
    const binding = repo.getBinding()!
    const session = repo.getSession(binding.id, worktreeId, run.agentId)!
    const driver = agents.get(run.agentId)
    activeDrivers.set(worktreeId, driver)
    let detail = ''
    let lastProgressAt = 0
    repo.updateTask(run.task.id, { status: 'running', startedAt: new Date().toISOString() })
    repo.updateSession(session.id, { status: 'running' })
    try {
      const result = await driver.run({ cwd: run.cwd, prompt: run.task.prompt, providerSessionId: session.providerSessionId,
        imagePaths: run.imagePaths, signal: controller.signal, onEvent: async (event: AgentEvent) => {
          if (event.type === 'session') repo.updateSession(session.id, { providerSessionId: event.sessionId })
          if (event.type === 'message') detail += `${event.text}\n`
          if (event.type === 'progress' && Date.now() - lastProgressAt > 120_000) {
            lastProgressAt = Date.now(); enqueueText(userId, `[${run.task.id.slice(-6)}] ${event.message}`)
          }
          if (event.type === 'question') {
            repo.updateTask(run.task.id, { status: 'waiting' })
            repo.setPending(binding.id, 'agent_question', { taskId: run.task.id, questionId: event.id, worktreeId })
            enqueueText(userId, `[需要你决定]\n${event.text}${event.options?.length ? `\n${event.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}` : ''}`)
          }
          if (event.type === 'approval') {
            repo.updateTask(run.task.id, { status: 'waiting' })
            repo.setPending(binding.id, 'agent_approval', { taskId: run.task.id, approvalId: event.id, worktreeId }, 5 * 60_000)
            enqueueText(userId, `[需要确认]\n${event.text}\n1. 同意本次\n2. 拒绝`)
          }
        } })
      const final = cleanAgentText(result.finalMessage)
      repo.updateSession(session.id, { providerSessionId: result.providerSessionId, status: 'ready' })
      repo.updateTask(run.task.id, { status: 'completed', summary: final, detail: result.detail || detail, completedAt: new Date().toISOString() })
      for (const part of summarizeFinal(`任务 ${run.task.id.slice(-6)} 已完成。\n\n${final}`)) enqueueText(userId, part)
    } catch (error) {
      const cancelled = controller.signal.aborted
      repo.updateSession(session.id, { status: 'ready' })
      repo.updateTask(run.task.id, { status: cancelled ? 'cancelled' : 'failed', error: (error as Error).message,
        completedAt: new Date().toISOString() })
      enqueueText(userId, cancelled ? `任务 ${run.task.id.slice(-6)} 已停止。` : `任务 ${run.task.id.slice(-6)} 失败：${(error as Error).message.slice(0, 700)}`)
    } finally {
      controllers.delete(worktreeId)
      activeDrivers.delete(worktreeId)
      const pending = repo.getPending(binding.id)
      if (pending && pending.payload.taskId === run.task.id) repo.clearPending(binding.id)
      void runNext(worktreeId, userId)
    }
  }

  async function handlePending(bindingId: string, userId: string, text: string, seq: number, images: string[]): Promise<boolean> {
    const pending = repo.getPending(bindingId)
    if (!pending) return false
    const choice = Number(text.trim())
    if (pending.kind === 'agent_approval') {
      if (![1, 2].includes(choice)) { enqueueText(userId, '请回复 1 表示同意本次，或回复 2 拒绝。'); return true }
      const worktreeId = String(pending.payload.worktreeId)
      activeDrivers.get(worktreeId)?.resolveInteraction?.(String(pending.payload.approvalId), String(choice))
      repo.clearPending(bindingId)
      repo.updateTask(String(pending.payload.taskId), { status: 'running' })
      enqueueText(userId, choice === 1 ? '已同意本次操作，任务继续。' : '已拒绝，任务将继续采用受限方式处理。')
      return true
    }
    if (pending.kind === 'agent_question') {
      const worktreeId = String(pending.payload.worktreeId)
      activeDrivers.get(worktreeId)?.resolveInteraction?.(String(pending.payload.questionId), text)
      repo.clearPending(bindingId)
      repo.updateTask(String(pending.payload.taskId), { status: 'running' })
      enqueueText(userId, '已将回答交给 agent。')
      return true
    }
    if (pending.kind === 'active_message') {
      if (![1, 2, 3].includes(choice)) { enqueueText(userId, '请回复 1、2 或 3。'); return true }
      repo.clearPending(bindingId)
      if (choice !== 3) await submitTask(bindingId, userId, String(pending.payload.text), Number(pending.payload.seq), pending.payload.images as string[] ?? [])
      else enqueueText(userId, '已取消这条消息。')
      return true
    }
    const ids = pending.payload.ids as string[] | undefined
    if (ids) {
      if (!Number.isInteger(choice) || choice < 1 || choice > ids.length) { enqueueText(userId, `请输入 1 到 ${ids.length}。`); return true }
      const id = ids[choice - 1]; repo.clearPending(bindingId)
      if (pending.kind === 'select_project') { repo.updateBindingContext({ projectId: id, worktreeId: null }); worktreeMenu(bindingId, userId, id); return true }
      if (pending.kind === 'select_worktree') {
        const worktree = worktreeRepo.findById(id)!; repo.updateBindingContext({ projectId: worktree.projectId, worktreeId: id })
        enqueueText(userId, `已切换到：${worktree.displayName || worktree.name}\n现在可以直接发送编码任务。`); return true
      }
      if (pending.kind === 'select_agent') {
        repo.updateBindingContext({ agentId: id }); enqueueText(userId, `已切换到 ${agents.list().find((a) => a.id === id)?.name ?? id}。`); return true
      }
      if (pending.kind === 'create_worktree_project') {
        const branches = await projectService.listBranches(id)
        const refs = [...branches.local, ...branches.remote].filter((ref, index, all) => all.indexOf(ref) === index)
        if (!refs.length) { enqueueText(userId, '这个项目没有可用的基础分支。'); return true }
        repo.setPending(bindingId, 'create_worktree_base', { projectId: id, ids: refs })
        enqueueText(userId, `请选择基础分支：\n${refs.map((ref, i) => `${i + 1}. ${ref}`).join('\n')}`)
        return true
      }
      if (pending.kind === 'create_worktree_base') {
        repo.setPending(bindingId, 'create_worktree_name', { projectId: pending.payload.projectId, baseRef: id })
        enqueueText(userId, '请输入新分支名，例如 feature/weixin-login：')
        return true
      }
    }
    if (pending.kind === 'create_worktree_name') {
      if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/.test(text) || text.includes('..') || text.endsWith('/')) {
        enqueueText(userId, '分支名格式无效，请使用字母、数字、点、短横线、下划线或斜杠。'); return true
      }
      repo.setPending(bindingId, 'create_worktree_confirm', { ...pending.payload, branch: text })
      enqueueText(userId, `请确认创建：\n分支：${text}\n基础：${pending.payload.baseRef}\n\n1. 确认创建\n2. 取消`)
      return true
    }
    if (pending.kind === 'create_worktree_confirm') {
      if (![1, 2].includes(choice)) { enqueueText(userId, '请回复 1 或 2。'); return true }
      repo.clearPending(bindingId)
      if (choice === 2) { enqueueText(userId, '已取消创建。'); return true }
      try {
        enqueueText(userId, '正在创建 worktree。')
        const worktree = await worktreeService.createWorktree(String(pending.payload.projectId), {
          branch: String(pending.payload.branch), baseRef: String(pending.payload.baseRef),
        })
        repo.updateBindingContext({ projectId: worktree.projectId, worktreeId: worktree.id })
        enqueueText(userId, `创建成功并已切换到：${worktree.displayName || worktree.name}`)
      } catch (error) { enqueueText(userId, `创建失败：${(error as Error).message}`) }
      return true
    }
    return false
  }

  async function handleOwnerMessage(message: WeixinMessage): Promise<void> {
    const binding = repo.getBinding()!
    const text = message.text.trim()
    const images = await saveMedia(message).catch((error) => { enqueueText(binding.userId, `图片下载失败：${(error as Error).message}`); return [] })
    if (await handlePending(binding.id, binding.userId, text, message.seq, images)) return
    if (text === '帮助') { enqueueText(binding.userId, HELP); return }
    if (text === '项目' || text === '切换项目') { projectMenu(binding.id, binding.userId); return }
    if (text === '工作区' || text === '切换工作区') {
      if (!binding.activeProjectId) projectMenu(binding.id, binding.userId)
      else worktreeMenu(binding.id, binding.userId, binding.activeProjectId)
      return
    }
    if (text === '助手' || text === '切换助手') { agentMenu(binding.id, binding.userId); return }
    if (text === '状态') {
      const worktree = binding.activeWorktreeId ? worktreeRepo.findById(binding.activeWorktreeId) : null
      const running = repo.getRunningTask()
      enqueueText(binding.userId, `当前工作区：${worktree?.displayName || worktree?.name || '未选择'}\n助手：${binding.activeAgentId}\n任务：${running ? `${running.id.slice(-6)} ${running.status}` : '空闲'}`)
      return
    }
    if (text === '停止') {
      if (binding.activeWorktreeId && controllers.get(binding.activeWorktreeId)) { controllers.get(binding.activeWorktreeId)!.abort(); enqueueText(binding.userId, '正在停止当前任务。') }
      else enqueueText(binding.userId, '当前工作区没有运行中的任务。')
      return
    }
    if (text === '查看详情') {
      const session = binding.activeWorktreeId ? repo.getSession(binding.id, binding.activeWorktreeId, binding.activeAgentId) : null
      const task = session ? repo.getLatestTask(session.id) : repo.getLatestTask()
      if (!task) enqueueText(binding.userId, '还没有任务记录。')
      else for (const part of chunks(task.detail || task.summary || task.error || '没有可显示的详情。')) enqueueText(binding.userId, part)
      return
    }
    if (text === '新会话') {
      if (!binding.activeWorktreeId) { projectMenu(binding.id, binding.userId); return }
      if (controllers.has(binding.activeWorktreeId)) { enqueueText(binding.userId, '请先停止或等待当前任务完成。'); return }
      repo.resetSession(binding.id, binding.activeWorktreeId, binding.activeAgentId); enqueueText(binding.userId, '已创建新的对话上下文。')
      return
    }
    if (text === '新建工作区') {
      const projects = projectRepo.findAll(); repo.setPending(binding.id, 'create_worktree_project', { ids: projects.map((p) => p.id) })
      enqueueText(binding.userId, `请选择项目：\n${projects.map((p, i) => `${i + 1}. ${p.name}`).join('\n')}`); return
    }
    if (!binding.activeWorktreeId) { projectMenu(binding.id, binding.userId); return }
    if (controllers.has(binding.activeWorktreeId)) {
      repo.setPending(binding.id, 'active_message', { text: text || '请分析附图。', seq: message.seq, images })
      enqueueText(binding.userId, '当前任务仍在执行。这条消息用于：\n1. 补充当前任务\n2. 排队为新任务\n3. 取消')
      return
    }
    await submitTask(binding.id, binding.userId, text, message.seq, images)
  }

  async function processMessage(message: WeixinMessage): Promise<void> {
    if (message.direction !== 'in' || !repo.markProcessed(config.weixin.accountId, message.seq)) return
    const binding = repo.getBinding()
    if (!binding) {
      if (pairing && Date.now() < pairing.expiresAt && message.text.trim() === pairing.code) {
        const timestamp = new Date().toISOString()
        repo.bind({ id: `wx_${nanoid()}`, accountId: config.weixin.accountId, userId: message.user, displayName: null,
          activeProjectId: null, activeWorktreeId: null, activeAgentId: 'codex', createdAt: timestamp, updatedAt: timestamp })
        pairing = null
        enqueueText(message.user, `绑定成功。\n\n${HELP}`)
        projectMenu(repo.getBinding()!.id, message.user)
      }
      return
    }
    if (message.user !== binding.userId || message.user === '') return
    await handleOwnerMessage(message)
  }

  async function poll(): Promise<void> {
    if (stopped || !config.weixin.enabled) return
    try {
      let cursor = repo.getCursor(config.weixin.accountId)
      let page
      do {
        page = await client.messages(cursor)
        for (const message of page.messages) await processMessage(message)
        cursor = page.next_cursor
        repo.setCursor(config.weixin.accountId, cursor)
      } while (page.has_more && !stopped)
      lastError = null
    } catch (error) { lastError = (error as Error).message }
    if (!stopped) pollTimer = setTimeout(() => void poll(), config.weixin.pollIntervalMs)
  }

  function cleanupMedia(): void {
    const deadline = Date.now() - config.weixin.mediaRetentionMs
    for (const entry of fs.readdirSync(mediaDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      const file = path.join(mediaDir, entry.name)
      try { if (fs.statSync(file).mtimeMs < deadline) fs.unlinkSync(file) } catch { /* best effort */ }
    }
  }

  return {
    start() {
      if (!config.weixin.enabled) return
      cleanupMedia(); stopped = false; void poll(); outboxTimer = setInterval(() => void flushOutbox(), 2000)
    },
    stop() {
      stopped = true
      if (pollTimer) clearTimeout(pollTimer)
      if (outboxTimer) clearInterval(outboxTimer)
      for (const controller of controllers.values()) controller.abort()
    },
    createPairingCode() {
      const code = String(Math.floor(10000000 + Math.random() * 90000000))
      pairing = { code, expiresAt: Date.now() + 10 * 60_000 }
      return { code, expiresAt: new Date(pairing.expiresAt).toISOString() }
    },
    unbind() {
      for (const controller of controllers.values()) controller.abort()
      queues.clear()
      repo.unbind()
      pairing = null
    },
    async status() {
      const remote = config.weixin.enabled && config.weixin.apiKey && config.weixin.accountId
        ? await client.status() : { connected: false, account: null }
      const binding = repo.getBinding(); const task = repo.getRunningTask()
      return {
        enabled: config.weixin.enabled,
        configured: Boolean(config.weixin.apiKey && config.weixin.accountId), connected: remote.connected,
        accountId: remote.account?.id ?? (config.weixin.accountId || null), accountLabel: remote.account?.label ?? null,
        pollerState: remote.account?.poller?.state ?? null,
        owner: binding ? { userId: binding.userId, displayName: binding.displayName } : null,
        pairing: pairing && Date.now() < pairing.expiresAt ? { code: pairing.code, expiresAt: new Date(pairing.expiresAt).toISOString() } : null,
        activeProjectId: binding?.activeProjectId ?? null, activeWorktreeId: binding?.activeWorktreeId ?? null,
        activeAgentId: binding?.activeAgentId ?? 'codex', agents: agents.list(),
        currentTask: task ? { id: task.id, status: task.status, prompt: task.prompt, summary: task.summary, error: task.error,
          worktreeId: task.worktreeId, agentId: task.agentId, createdAt: task.createdAt, completedAt: task.completedAt } : null,
        lastError,
      }
    },
    listAgents() { return agents.list() },
    upsertAgent(definition: import('@worktreehub/shared').AgentDefinition) { repo.upsertAgent(definition) },
    agentHealth() { return agents.health() },
  }
}

export type WeixinService = ReturnType<typeof createWeixinService>
