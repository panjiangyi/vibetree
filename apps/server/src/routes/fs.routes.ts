import type { FastifyInstance } from 'fastify'
import type { FsService } from '../modules/fs/fs.service.js'

export async function registerFsRoutes(
  app: FastifyInstance,
  fsService: FsService
) {
  app.get('/api/fs/list', async (request) => {
    const { path } = request.query as { path?: string }
    return fsService.listDirectory(path)
  })
}
