# VibeTree

Local Git worktree manager with web-based terminals.

## Features

- Manage multiple Git projects and their worktrees
- Create, switch, and remove Git worktrees
- Open web-based terminals attached to any worktree
- Terminal sessions persist across page refreshes
- All data stored locally in SQLite

## Requirements

- Node.js 22 LTS (see `.nvmrc`)
- pnpm 9+
- macOS or Linux (Windows not supported in v1)

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development (both frontend and backend)
pnpm dev

# Or start individually
pnpm dev:web    # Frontend only (http://127.0.0.1:5173, also binds to LAN)
pnpm dev:server # Backend only (http://127.0.0.1:3767)
```

For development from a phone on the same Wi-Fi, keep `pnpm dev` running and open the LAN URL printed by Vite, for example `http://192.168.1.10:5173`. The frontend proxies `/api` and `/ws` to the local backend.

## Production Build

```bash
# Build and start on all network interfaces
pnpm build-and-start
```

The script prints a LAN URL such as `http://192.168.1.10:3767` that can be opened from a phone on the same Wi-Fi. The backend serves the frontend and API from the same origin, so mobile browsers connect back to this computer instead of their own `127.0.0.1`.

## Testing

```bash
# Run all tests
pnpm test

# Type check
pnpm typecheck

# Run e2e tests
pnpm test:e2e
```

## Architecture

VibeTree is a monorepo with three packages:

- `packages/shared` - Shared TypeScript types and protocols
- `apps/server` - Fastify backend with SQLite, node-pty, and Git integration
- `apps/web` - React frontend with xterm.js terminals

## Security

VibeTree is designed for trusted local development:

- Listens only on `127.0.0.1` by default
- `pnpm build-and-start` binds to `0.0.0.0` for same-LAN phone access
- No authentication or token system
- No arbitrary command execution API
- All Git operations go through a whitelist
- Path operations are sandboxed to worktree directories

**Do not expose VibeTree to public or untrusted networks.** The web app includes access to local project terminals.

## Configuration

Environment variables (all optional):

| Variable | Default | Description |
|---|---|---|
| `VIBETREE_HOST` | `127.0.0.1` | Server bind address |
| `VIBETREE_PORT` | `3767` | Server port |
| `VIBETREE_DB` | `~/.vibetree/vibetree.sqlite` | Database path |

## License

MIT
