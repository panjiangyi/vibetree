import { buildApp } from './app.js'
import { getConfig } from './config.js'

async function main() {
  const config = getConfig()
  const app = await buildApp(config)

  await app.listen({
    host: config.host,
    port: config.port,
  })

  console.log(`VibeTree server running at http://${config.host}:${config.port}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
