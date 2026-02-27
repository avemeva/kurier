# 01 — Monorepo Scaffold

## Purpose
Root monorepo configuration. Every other subsystem depends on this being set up first.

## Structure
```
telegram-ai-v2/
├── packages/
│   ├── types/
│   ├── logger/
│   ├── protocol/
│   ├── ui/
│   └── store/
├── apps/
│   ├── daemon/
│   ├── cli/
│   ├── app/
│   └── web/
├── package.json          # Workspace root
├── tsconfig.base.json    # Shared TypeScript config
├── biome.json            # Linter/formatter
├── .gitignore
└── CLAUDE.md
```

## Root package.json
- **Name:** `telegram-ai-v2`
- **Private:** true
- **Workspaces:** `["packages/*", "apps/*"]`
- **Package manager:** bun
- **Scripts:**
  - `dev:daemon` — `bun --filter @tg/daemon dev`
  - `dev:cli` — `bun --filter @tg/cli dev`
  - `dev:web` — `bun --filter @tg/web dev`
  - `dev:app` — `bun --filter @tg/app dev`
  - `build` — `bun --filter './packages/*' build && bun --filter './apps/*' build`
  - `lint` — `biome check .`
  - `lint:fix` — `biome check --write .`
  - `test` — `bun --filter '*' test`
  - `typecheck` — `bun --filter '*' typecheck`

## tsconfig.base.json
- **Target:** ES2022
- **Module:** ESNext
- **ModuleResolution:** bundler
- **JSX:** react-jsx
- **Strict:** true
- **skipLibCheck:** true
- **Composite references** for workspaces
- **Path aliases:** none at root (each package defines its own)

## biome.json
- Extends biome defaults
- Formatter: tabs → spaces (2), line width 100
- Linter: recommended rules
- Organizer: import sorting enabled
- Ignore: `node_modules`, `dist`, `build`, `.claude`

## Naming Convention
- Package scope: `@tg/` (e.g., `@tg/types`, `@tg/protocol`)
- App names: no scope (e.g., `daemon`, `cli`, `web`, `app`)

## Dependencies (root only)
- `@biomejs/biome` (devDependency)
- `typescript` (devDependency)

## Testability
- Each workspace has its own `test` script
- Root `test` runs all workspace tests
- Root `typecheck` validates all TypeScript projects
