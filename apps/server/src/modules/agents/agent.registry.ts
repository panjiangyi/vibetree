import type { WeixinRepository } from '../../db/repositories/weixin.repository.js'
import type { CodingAgentDriver } from './agent.types.js'
import { buildBuiltinDriver, buildCommandDriver } from './process-agent.driver.js'
import { CodexAppServerDriver } from './codex-app-server.driver.js'

export function createAgentRegistry(repo: WeixinRepository) {
  return {
    list() { return repo.listAgents() },
    get(id: string): CodingAgentDriver {
      const definition = repo.listAgents().find((agent) => agent.id === id && agent.enabled)
      if (!definition) throw new Error(`Agent is unavailable: ${id}`)
      if (definition.id === 'codex') return new CodexAppServerDriver(definition)
      return definition.kind === 'builtin' ? buildBuiltinDriver(definition) : buildCommandDriver(definition)
    },
    async health() {
      return await Promise.all(repo.listAgents().map(async (definition) => {
        if (!definition.enabled) return { id: definition.id, ok: false, detail: 'disabled' }
        try {
          const driver = definition.id === 'codex' ? new CodexAppServerDriver(definition)
            : definition.kind === 'builtin' ? buildBuiltinDriver(definition) : buildCommandDriver(definition)
          return { id: definition.id, ...(await driver.healthCheck()) }
        } catch (error) {
          return { id: definition.id, ok: false, detail: (error as Error).message }
        }
      }))
    },
  }
}

export type AgentRegistry = ReturnType<typeof createAgentRegistry>
