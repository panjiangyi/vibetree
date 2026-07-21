import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase } from '../database.js'
import { createWeixinRepository } from './weixin.repository.js'

const tempDirs: string[] = []
afterEach(async () => Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))))

describe('weixin repository', () => {
  it('persists the owner, cursor, idempotency and built-in drivers', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'worktreehub-weixin-'))
    tempDirs.push(root)
    const db = createDatabase(path.join(root, 'app.db'))
    const repo = createWeixinRepository(db)
    const now = new Date().toISOString()
    repo.bind({ id: 'owner', accountId: 'account', userId: 'user', displayName: null, activeProjectId: null,
      activeWorktreeId: null, activeAgentId: 'codex', createdAt: now, updatedAt: now })
    repo.setCursor('account', 42)

    expect(repo.getBinding()?.userId).toBe('user')
    expect(repo.getCursor('account')).toBe(42)
    expect(repo.markProcessed('account', 43)).toBe(true)
    expect(repo.markProcessed('account', 43)).toBe(false)
    expect(repo.listAgents().map((agent) => agent.id)).toEqual(expect.arrayContaining(['codex', 'claude', 'opencode']))
    db.close()
  })

  it('expires pending menu state', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'worktreehub-weixin-'))
    tempDirs.push(root)
    const db = createDatabase(path.join(root, 'app.db'))
    const repo = createWeixinRepository(db)
    const now = new Date().toISOString()
    repo.bind({ id: 'owner', accountId: 'account', userId: 'user', displayName: null, activeProjectId: null,
      activeWorktreeId: null, activeAgentId: 'codex', createdAt: now, updatedAt: now })
    repo.setPending('owner', 'menu', {}, -1)
    expect(repo.getPending('owner')).toBeNull()
    db.close()
  })

  it('claims outbox messages before delivery to avoid duplicate concurrent sends', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'worktreehub-weixin-'))
    tempDirs.push(root)
    const db = createDatabase(path.join(root, 'app.db'))
    const repo = createWeixinRepository(db)

    repo.enqueueOutbox({ id: 'out_1', accountId: 'account', userId: 'user', kind: 'text', payload: { text: 'hello' } })

    expect(repo.claimPendingOutbox()).toHaveLength(1)
    expect(repo.claimPendingOutbox()).toHaveLength(0)

    repo.markOutboxFailed('out_1', 1, 'temporary error')
    expect(repo.claimPendingOutbox()).toHaveLength(0)
    db.close()
  })

  it('recovers in-flight outbox messages on repository startup', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'worktreehub-weixin-'))
    tempDirs.push(root)
    const db = createDatabase(path.join(root, 'app.db'))
    const repo = createWeixinRepository(db)

    repo.enqueueOutbox({ id: 'out_1', accountId: 'account', userId: 'user', kind: 'text', payload: { text: 'hello' } })
    expect(repo.claimPendingOutbox()).toHaveLength(1)

    const recovered = createWeixinRepository(db)
    expect(recovered.claimPendingOutbox()).toHaveLength(1)
    db.close()
  })
})
