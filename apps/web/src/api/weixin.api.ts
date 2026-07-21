import type { AgentDefinition, WeixinIntegrationStatus } from '@worktreehub/shared'
import { apiFetch } from './client.js'

export const weixinApi = {
  status: () => apiFetch<WeixinIntegrationStatus>('/api/integrations/weixin'),
  pair: () => apiFetch<{ code: string; expiresAt: string }>('/api/integrations/weixin/pairing-code', { method: 'POST' }),
  unbind: () => apiFetch<{ success: boolean }>('/api/integrations/weixin/owner', { method: 'DELETE' }),
  health: () => apiFetch<Array<{ id: string; ok: boolean; detail: string }>>('/api/integrations/weixin/agents/health'),
  saveAgent: (agent: AgentDefinition) => apiFetch<AgentDefinition>(`/api/integrations/weixin/agents/${encodeURIComponent(agent.id)}`, {
    method: 'PUT', body: JSON.stringify(agent),
  }),
}
