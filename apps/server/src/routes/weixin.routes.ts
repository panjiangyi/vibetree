import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { WeixinService } from '../modules/weixin/weixin.service.js'

const agentSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9._-]+$/).max(60),
  name: z.string().min(1).max(80),
  kind: z.enum(['builtin', 'command']),
  executable: z.string().min(1).max(500),
  enabled: z.boolean(),
  capabilities: z.array(z.enum(['streaming', 'resume', 'images', 'questions', 'approvals'])),
  config: z.record(z.unknown()),
})

export async function registerWeixinRoutes(app: FastifyInstance, service: WeixinService) {
  app.get('/api/integrations/weixin', async () => service.status())
  app.post('/api/integrations/weixin/pairing-code', async () => service.createPairingCode())
  app.delete('/api/integrations/weixin/owner', async () => { service.unbind(); return { success: true } })
  app.get('/api/integrations/weixin/agents/health', async () => service.agentHealth())
  app.put('/api/integrations/weixin/agents/:agentId', async (request) => {
    const input = agentSchema.parse(request.body)
    const { agentId } = request.params as { agentId: string }
    if (input.id !== agentId) throw new Error('Agent id does not match route')
    service.upsertAgent(input)
    return input
  })
}
