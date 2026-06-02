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
pnpm dev:web    # Frontend only (http://127.0.0.1:5173)
pnpm dev:server # Backend only (http://127.0.0.1:3767)
```

## Production Build

```bash
# Build all packages
pnpm build

# Start production server
pnpm --filter @vibetree/server start
```

The production server serves the frontend at `http://127.0.0.1:3767`.

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

VibeTree is designed as a **local-only tool**:

- Listens only on `127.0.0.1` by default
- No authentication or token system
- No arbitrary command execution API
- All Git operations go through a whitelist
- Path operations are sandboxed to worktree directories

**Do NOT expose VibeTree to the network.** It is intended for local development use only.

## Configuration

Environment variables (all optional):

| Variable | Default | Description |
|---|---|---|
| `VIBETREE_HOST` | `127.0.0.1` | Server bind address |
| `VIBETREE_PORT` | `3767` | Server port |
| `VIBETREE_DB` | `~/.vibetree/vibetree.sqlite` | Database path |

## License

MIT
