import type Database from 'better-sqlite3'
import type { AgentDefinition, CodingTaskStatus } from '@worktreehub/shared'

export type WeixinBinding = {
  id: string
  accountId: string
  userId: string
  displayName: string | null
  activeProjectId: string | null
  activeWorktreeId: string | null
  activeAgentId: string
  createdAt: string
  updatedAt: string
}

export type CodingSessionRecord = {
  id: string
  bindingId: string
  worktreeId: string
  agentId: string
  providerSessionId: string | null
  status: string
  createdAt: string
  updatedAt: string
}

export type CodingTaskRecord = {
  id: string
  sessionId: string
  sourceMessageSeq: number | null
  prompt: string
  status: CodingTaskStatus
  summary: string | null
  detail: string | null
  error: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export type PendingInteraction = {
  bindingId: string
  kind: string
  payload: Record<string, unknown>
  expiresAt: string
  createdAt: string
}

type BindingRow = {
  id: string; account_id: string; user_id: string; display_name: string | null
  active_project_id: string | null; active_worktree_id: string | null; active_agent_id: string
  created_at: string; updated_at: string
}
type SessionRow = {
  id: string; binding_id: string; worktree_id: string; agent_id: string
  provider_session_id: string | null; status: string; created_at: string; updated_at: string
}
type TaskRow = {
  id: string; session_id: string; source_message_seq: number | null; prompt: string
  status: CodingTaskStatus; summary: string | null; detail: string | null; error: string | null
  started_at: string | null; completed_at: string | null; created_at: string; updated_at: string
}

const bindingFromRow = (r: BindingRow): WeixinBinding => ({
  id: r.id, accountId: r.account_id, userId: r.user_id, displayName: r.display_name,
  activeProjectId: r.active_project_id, activeWorktreeId: r.active_worktree_id,
  activeAgentId: r.active_agent_id, createdAt: r.created_at, updatedAt: r.updated_at,
})
const sessionFromRow = (r: SessionRow): CodingSessionRecord => ({
  id: r.id, bindingId: r.binding_id, worktreeId: r.worktree_id, agentId: r.agent_id,
  providerSessionId: r.provider_session_id, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at,
})
const taskFromRow = (r: TaskRow): CodingTaskRecord => ({
  id: r.id, sessionId: r.session_id, sourceMessageSeq: r.source_message_seq, prompt: r.prompt,
  status: r.status, summary: r.summary, detail: r.detail, error: r.error,
  startedAt: r.started_at, completedAt: r.completed_at, createdAt: r.created_at, updatedAt: r.updated_at,
})

export function createWeixinRepository(db: Database.Database) {
  const builtinAgents: AgentDefinition[] = [
    { id: 'codex', name: 'Codex', kind: 'builtin', executable: 'codex', enabled: true, capabilities: ['streaming', 'resume', 'images', 'questions', 'approvals'], config: {} },
    { id: 'claude', name: 'Claude Code', kind: 'builtin', executable: 'claude', enabled: true, capabilities: ['streaming', 'resume', 'images'], config: {} },
    { id: 'opencode', name: 'OpenCode', kind: 'builtin', executable: 'opencode', enabled: true, capabilities: ['streaming', 'resume', 'images'], config: {} },
  ]

  const now = () => new Date().toISOString()
  const txInsertBuiltins = db.transaction(() => {
    const stmt = db.prepare(`INSERT OR IGNORE INTO agent_definitions
      (id,name,kind,executable,config_json,enabled,created_at,updated_at)
      VALUES (@id,@name,@kind,@executable,@config,1,@now,@now)`)
    for (const agent of builtinAgents) {
      stmt.run({ ...agent, config: JSON.stringify({ capabilities: agent.capabilities }), now: now() })
    }
  })
  txInsertBuiltins()
  db.prepare("UPDATE weixin_outbox SET status='pending' WHERE status='sending'").run()

  return {
    getBinding(): WeixinBinding | null {
      const row = db.prepare('SELECT * FROM weixin_bindings ORDER BY created_at LIMIT 1').get() as BindingRow | undefined
      return row ? bindingFromRow(row) : null
    },
    bind(binding: WeixinBinding): void {
      db.prepare(`INSERT INTO weixin_bindings
        (id,account_id,user_id,display_name,active_project_id,active_worktree_id,active_agent_id,created_at,updated_at)
        VALUES (@id,@accountId,@userId,@displayName,@activeProjectId,@activeWorktreeId,@activeAgentId,@createdAt,@updatedAt)`)
        .run(binding)
    },
    unbind(): void { db.prepare('DELETE FROM weixin_bindings').run() },
    updateBindingContext(input: { projectId?: string | null; worktreeId?: string | null; agentId?: string }): void {
      const binding = this.getBinding()
      if (!binding) return
      db.prepare(`UPDATE weixin_bindings SET active_project_id=@projectId, active_worktree_id=@worktreeId,
        active_agent_id=@agentId, updated_at=@updatedAt WHERE id=@id`).run({
        id: binding.id, projectId: input.projectId === undefined ? binding.activeProjectId : input.projectId,
        worktreeId: input.worktreeId === undefined ? binding.activeWorktreeId : input.worktreeId,
        agentId: input.agentId ?? binding.activeAgentId, updatedAt: now(),
      })
    },
    getCursor(accountId: string): number {
      return (db.prepare('SELECT cursor FROM weixin_state WHERE account_id=?').get(accountId) as { cursor: number } | undefined)?.cursor ?? 0
    },
    setCursor(accountId: string, cursor: number): void {
      db.prepare(`INSERT INTO weixin_state(account_id,cursor,updated_at) VALUES(?,?,?)
        ON CONFLICT(account_id) DO UPDATE SET cursor=excluded.cursor,updated_at=excluded.updated_at`).run(accountId, cursor, now())
    },
    markProcessed(accountId: string, seq: number): boolean {
      return db.prepare('INSERT OR IGNORE INTO weixin_processed_messages(account_id,seq,processed_at) VALUES(?,?,?)').run(accountId, seq, now()).changes > 0
    },
    listAgents(): AgentDefinition[] {
      const rows = db.prepare('SELECT * FROM agent_definitions ORDER BY kind DESC, name').all() as Array<{
        id: string; name: string; kind: 'builtin' | 'command'; executable: string; config_json: string; enabled: number
      }>
      return rows.map((r) => {
        const config = JSON.parse(r.config_json) as Record<string, unknown>
        return { id: r.id, name: r.name, kind: r.kind, executable: r.executable, enabled: Boolean(r.enabled),
          capabilities: (config.capabilities ?? []) as AgentDefinition['capabilities'], config }
      })
    },
    upsertAgent(agent: AgentDefinition): void {
      const timestamp = now()
      db.prepare(`INSERT INTO agent_definitions(id,name,kind,executable,config_json,enabled,created_at,updated_at)
        VALUES(@id,@name,@kind,@executable,@config,@enabled,@now,@now)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, executable=excluded.executable,
        config_json=excluded.config_json, enabled=excluded.enabled, updated_at=excluded.updated_at`).run({
          ...agent, enabled: agent.enabled ? 1 : 0,
          config: JSON.stringify({ ...agent.config, capabilities: agent.capabilities }), now: timestamp,
        })
    },
    getSession(bindingId: string, worktreeId: string, agentId: string): CodingSessionRecord | null {
      const row = db.prepare('SELECT * FROM coding_sessions WHERE binding_id=? AND worktree_id=? AND agent_id=?')
        .get(bindingId, worktreeId, agentId) as SessionRow | undefined
      return row ? sessionFromRow(row) : null
    },
    insertSession(session: CodingSessionRecord): void {
      db.prepare(`INSERT INTO coding_sessions(id,binding_id,worktree_id,agent_id,provider_session_id,status,created_at,updated_at)
        VALUES(@id,@bindingId,@worktreeId,@agentId,@providerSessionId,@status,@createdAt,@updatedAt)`).run(session)
    },
    updateSession(id: string, input: { providerSessionId?: string | null; status?: string }): void {
      const row = db.prepare('SELECT * FROM coding_sessions WHERE id=?').get(id) as SessionRow | undefined
      if (!row) return
      db.prepare('UPDATE coding_sessions SET provider_session_id=?,status=?,updated_at=? WHERE id=?')
        .run(input.providerSessionId === undefined ? row.provider_session_id : input.providerSessionId,
          input.status ?? row.status, now(), id)
    },
    resetSession(bindingId: string, worktreeId: string, agentId: string): void {
      db.prepare('DELETE FROM coding_sessions WHERE binding_id=? AND worktree_id=? AND agent_id=?').run(bindingId, worktreeId, agentId)
    },
    insertTask(task: CodingTaskRecord): void {
      db.prepare(`INSERT INTO coding_tasks(id,session_id,source_message_seq,prompt,status,summary,detail,error,started_at,completed_at,created_at,updated_at)
        VALUES(@id,@sessionId,@sourceMessageSeq,@prompt,@status,@summary,@detail,@error,@startedAt,@completedAt,@createdAt,@updatedAt)`).run(task)
    },
    updateTask(id: string, input: Partial<Pick<CodingTaskRecord, 'status' | 'summary' | 'detail' | 'error' | 'startedAt' | 'completedAt'>>): void {
      const row = db.prepare('SELECT * FROM coding_tasks WHERE id=?').get(id) as TaskRow | undefined
      if (!row) return
      const task = taskFromRow(row)
      db.prepare(`UPDATE coding_tasks SET status=@status,summary=@summary,detail=@detail,error=@error,
        started_at=@startedAt,completed_at=@completedAt,updated_at=@updatedAt WHERE id=@id`).run({ ...task, ...input, updatedAt: now() })
    },
    getTask(id: string): CodingTaskRecord | null {
      const row = db.prepare('SELECT * FROM coding_tasks WHERE id=?').get(id) as TaskRow | undefined
      return row ? taskFromRow(row) : null
    },
    getLatestTask(sessionId?: string): CodingTaskRecord | null {
      const row = (sessionId
        ? db.prepare('SELECT * FROM coding_tasks WHERE session_id=? ORDER BY created_at DESC LIMIT 1').get(sessionId)
        : db.prepare('SELECT * FROM coding_tasks ORDER BY created_at DESC LIMIT 1').get()) as TaskRow | undefined
      return row ? taskFromRow(row) : null
    },
    getRunningTask(): (CodingTaskRecord & { worktreeId: string; agentId: string }) | null {
      const row = db.prepare(`SELECT t.*,s.worktree_id,s.agent_id FROM coding_tasks t JOIN coding_sessions s ON s.id=t.session_id
        WHERE t.status IN ('queued','running','waiting') ORDER BY t.created_at LIMIT 1`).get() as (TaskRow & { worktree_id: string; agent_id: string }) | undefined
      return row ? { ...taskFromRow(row), worktreeId: row.worktree_id, agentId: row.agent_id } : null
    },
    setPending(bindingId: string, kind: string, payload: Record<string, unknown>, ttlMs = 10 * 60_000): void {
      const createdAt = now(); const expiresAt = new Date(Date.now() + ttlMs).toISOString()
      db.prepare(`INSERT INTO weixin_pending_interactions(binding_id,kind,payload_json,expires_at,created_at) VALUES(?,?,?,?,?)
        ON CONFLICT(binding_id) DO UPDATE SET kind=excluded.kind,payload_json=excluded.payload_json,
        expires_at=excluded.expires_at,created_at=excluded.created_at`).run(bindingId, kind, JSON.stringify(payload), expiresAt, createdAt)
    },
    getPending(bindingId: string): PendingInteraction | null {
      const row = db.prepare('SELECT * FROM weixin_pending_interactions WHERE binding_id=?').get(bindingId) as {
        binding_id: string; kind: string; payload_json: string; expires_at: string; created_at: string
      } | undefined
      if (!row) return null
      if (Date.parse(row.expires_at) <= Date.now()) { this.clearPending(bindingId); return null }
      return { bindingId: row.binding_id, kind: row.kind, payload: JSON.parse(row.payload_json), expiresAt: row.expires_at, createdAt: row.created_at }
    },
    clearPending(bindingId: string): void { db.prepare('DELETE FROM weixin_pending_interactions WHERE binding_id=?').run(bindingId) },
    enqueueOutbox(input: { id: string; accountId: string; userId: string; kind: string; payload: Record<string, unknown> }): void {
      db.prepare(`INSERT INTO weixin_outbox(id,account_id,user_id,kind,payload_json,status,attempts,next_attempt_at,created_at)
        VALUES(@id,@accountId,@userId,@kind,@payload,'pending',0,@now,@now)`).run({ ...input, payload: JSON.stringify(input.payload), now: now() })
    },
    claimPendingOutbox(limit = 20): Array<{ id: string; accountId: string; userId: string; kind: string; payload: Record<string, unknown>; attempts: number }> {
      return db.transaction(() => {
        const rows = db.prepare(`SELECT * FROM weixin_outbox WHERE status='pending' AND next_attempt_at<=? ORDER BY created_at LIMIT ?`)
          .all(now(), limit) as Array<{ id: string; account_id: string; user_id: string; kind: string; payload_json: string; attempts: number }>
        const claimed: typeof rows = []
        const claim = db.prepare("UPDATE weixin_outbox SET status='sending' WHERE id=? AND status='pending'")
        for (const row of rows) {
          if (claim.run(row.id).changes > 0) claimed.push(row)
        }
        return claimed.map((r) => ({ id: r.id, accountId: r.account_id, userId: r.user_id, kind: r.kind, payload: JSON.parse(r.payload_json), attempts: r.attempts }))
      })()
    },
    markOutboxSent(id: string): void { db.prepare("UPDATE weixin_outbox SET status='sent',sent_at=? WHERE id=?").run(now(), id) },
    markOutboxFailed(id: string, attempts: number, error: string): void {
      const delay = Math.min(60_000, 1000 * 2 ** Math.min(attempts, 6))
      db.prepare("UPDATE weixin_outbox SET status='pending',attempts=?,last_error=?,next_attempt_at=? WHERE id=?")
        .run(attempts, error.slice(0, 1000), new Date(Date.now() + delay).toISOString(), id)
    },
  }
}

export type WeixinRepository = ReturnType<typeof createWeixinRepository>
