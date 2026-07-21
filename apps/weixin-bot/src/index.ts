/*
 * index.ts — entrypoint. Loads config + all account sessions, starts a poller
 * per account via the registry, serves the Hono app, and shuts down gracefully
 * (SIGTERM/SIGINT): stop pollers -> close http -> drain webhooks -> notifyStop.
 * New accounts can be added at runtime by scanning a QR (POST /login/qr).
 */
import "dotenv/config"
import { serve } from "@hono/node-server"
import { ensureStateDir, loadConfig } from "./config.js"
import { createLogger } from "./logger.js"
import { loadAllSessions } from "./state.js"
import { MediaStore } from "./media/store.js"
import { AccountRegistry } from "./accounts.js"
import { notifyStop } from "./ilink-client.js"
import { LoginManager } from "./login.js"
import { buildApp } from "./routes.js"

const config = loadConfig()
const log = createLogger(config.logLevel)
ensureStateDir(config.stateDir)

const mediaStore = new MediaStore(`${config.stateDir}/media`)
const registry = new AccountRegistry(config, mediaStore, log)

const sessions = loadAllSessions(config.stateDir, config.sessionFile, log)
if (sessions.length === 0) {
  log.warn("no account sessions found — scan a QR at POST /login/qr (or the web UI) to add one")
}
for (const s of sessions) {
  await registry.add(s, { persist: false }).catch((e) => log.error(`account ${s.ilink_bot_id} failed to start:`, e))
}

const login = new LoginManager((session) => registry.add(session).then(() => undefined), log)

const app = buildApp({ config, registry, mediaStore, login })

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  log.info(`weixin-bot-service listening on http://localhost:${info.port}`)
  log.info(`serving ${registry.size()} account(s): ${registry.list().map((a) => a.id).join(", ") || "(none yet)"}`)
})

let shuttingDown = false
async function shutdown(): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  log.info("shutdown: stopping pollers")
  await registry.stopAll()
  log.info("shutdown: closing http server")
  server.close()
  log.info("shutdown: draining webhooks + notifyStop")
  await Promise.all(
    registry.list().map(async (a) => {
      await a.webhook.drain(5000)
      try {
        await Promise.race([
          notifyStop({ base: a.session.baseurl, token: a.session.bot_token, botAgent: config.botAgent }),
          new Promise((r) => setTimeout(r, 12000)),
        ])
      } catch (e) {
        log.warn(`shutdown: notifyStop ${a.id} error:`, (e as Error).message)
      }
    })
  )
  log.info("shutdown complete")
  process.exit(0)
}

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
