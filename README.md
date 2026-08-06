# Frame-Master monorepo

Plugin-first meta-framework for [Bun.js](https://bun.sh), plus the official documentation site.

| Path | Package | Purpose |
|------|---------|---------|
| [`packages/frame-master`](./packages/frame-master) | `frame-master` | Core runtime + CLI (published to npm) |
| [`apps/docs`](./apps/docs) | `frame-master-docs` | Docs & marketplace site ([frame-master.com](https://frame-master.com)) |

## Quick start

```bash
bun install

# Core package tests
bun run test
bun run typecheck

# Docs site (local)
bun run dev:docs
```

Global CLI from the workspace package:

```bash
bunx frame-master --help
# or
bun run frame-master -- --help
```

Package README: [`packages/frame-master/README.md`](./packages/frame-master/README.md)

## Releases (npm + OIDC)

Publishing uses **npm Trusted Publishing (OIDC)** — no long-lived `NPM_TOKEN`.

1. Bump `version` in [`packages/frame-master/package.json`](./packages/frame-master/package.json)
2. Optionally add `packages/frame-master/release-notes/vX.Y.Z.md`
3. Merge / push to `main`
4. [`.github/workflows/release.yml`](./.github/workflows/release.yml) publishes when that version is not already on npm

One-time npm Trusted Publisher setup and details: [`packages/frame-master/docs/releasing.md`](./packages/frame-master/docs/releasing.md)

## Docs deploy (Cloudflare Pages)

Production docs deploy via **Cloudflare Pages native Git integration** (not GitHub Actions). Connect this monorepo in the Cloudflare dashboard and configure:

| Setting | Suggested value |
|---------|-----------------|
| Production branch | `main` |
| Root directory | `apps/docs` |
| Build command | `bun install && bun run build` |
| Build output directory | `.frame-master/build` |

Notes:

- `apps/docs` depends on `frame-master` via `workspace:*` for local monorepo development. If the Pages build only installs under `apps/docs` and cannot resolve the workspace package, either build from the monorepo root (`bun install && bun run build:docs`, output `apps/docs/.frame-master/build`) or pin `frame-master` to a published npm version in that app’s `package.json`.
- Wrangler project name / Pages project: `frame-master-docs` (see `apps/docs/wrangler.jsonc`).

## CI

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `bun-multiplatform.yml` | PR / push to `main`, manual | Typecheck + tests on Linux, macOS, Windows |
| `release.yml` | `packages/frame-master/package.json` on `main` | npm publish via OIDC |

**Local CI** (mimic Actions with [nektos/act](https://github.com/nektos/act) or host/Docker): see [`docs/ci-local.md`](./docs/ci-local.md).

```bash
bun run ci:local          # host: same steps as GHA (no Docker)
bun run ci:local:docker   # Ubuntu + Bun container
bun run ci:local:act      # real workflow YAML via act (Docker required)
```
## Workspace layout

```
frame-master/
├── apps/
│   └── docs/                 # Cloudflare Pages app (native CF deploy)
├── packages/
│   └── frame-master/         # npm package
├── .github/workflows/
│   ├── bun-multiplatform.yml
│   └── release.yml
└── package.json              # private monorepo root (workspaces)
```

## License

MIT — see [`packages/frame-master/LICENSE`](./packages/frame-master/LICENSE).
