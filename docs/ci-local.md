# Local CI (mimic GitHub Actions)

This monorepo uses [**nektos/act**](https://github.com/nektos/act) plus a host/Docker script so you can exercise the same steps as [`.github/workflows/bun-multiplatform.yml`](../.github/workflows/bun-multiplatform.yml) without pushing.

## Quick start

```bash
# Same steps as CI, on your machine (no Docker) — fastest feedback
bun run ci:local
# or
./scripts/ci-local.sh host
```

## Modes

| Mode | Command | Needs | Fidelity |
|------|---------|-------|----------|
| **host** | `bun run ci:local` / `./scripts/ci-local.sh host` | Bun | Same install / typecheck / test commands as GHA; OS is yours |
| **docker** | `bun run ci:local:docker` | Docker | Ubuntu + official Bun image; close to `ubuntu-latest` job |
| **act** | `bun run ci:local:act` | Docker + [act](https://github.com/nektos/act) | Runs the real workflow YAML (Linux job only) |

### Host (default)

```bash
./scripts/ci-local.sh host
```

Runs:

1. `bun install --frozen-lockfile` (repo root)
2. `bun run typecheck` in `packages/frame-master`
3. `bun test` in `packages/frame-master`

### Docker (Linux-like CI)

```bash
# Docker daemon must be running
bun run ci:local:docker
# optional image override
CI_LOCAL_IMAGE=oven/bun:1.3-debian ./scripts/ci-local.sh docker
```

### act (real workflow file)

Install act (no root required into `~/.local/bin`):

```bash
curl -sL https://raw.githubusercontent.com/nektos/act/master/install.sh | bash -s -- -b "$HOME/.local/bin"
export PATH="$HOME/.local/bin:$PATH"
```

Repo defaults live in [`.actrc`](../.actrc) (Ubuntu runner images from [catthehacker/docker](https://github.com/catthehacker/docker_images)).

```bash
# Requires Docker
bun run ci:local:act

# Or pass act flags through:
./scripts/ci-local.sh act -W .github/workflows/bun-multiplatform.yml --matrix os:ubuntu-latest -v
./scripts/ci-local.sh act -l   # list jobs
```

## Windows / macOS jobs

**act only runs Linux containers.** It cannot emulate `windows-latest` or `macos-latest` runners.

| Goal | Approach |
|------|----------|
| Linux CI locally | `host`, `docker`, or `act` (above) |
| Windows CI | Real GitHub Actions `windows-latest`, or a Windows VM with Bun + `./scripts/ci-local.sh host` |
| macOS CI | Real GitHub Actions `macos-latest`, or a Mac host + host mode |

On Windows hosts, act can use self-hosted mode (no Docker image for Windows):

```powershell
act -P windows-latest=-self-hosted -W .github/workflows/bun-multiplatform.yml
```

## What failed on Windows in GHA (fixed)

`Builder.init` used `join(cwd(), outDir)` even when `outdir` was already absolute, producing invalid paths like:

```text
D:\a\...\packages\frame-master\C:\Users\...\Temp\fm-plugin-test-xxx\out
```

Absolute `outdir` values are now preserved (Windows-safe). Re-run multiplatform CI after pulling that fix.

## Related workflows

| Workflow | Local tip |
|----------|-----------|
| `bun-multiplatform.yml` | `ci:local` / `ci:local:act` |
| `release.yml` | Prefer dry-run: `cd packages/frame-master && npm pack --dry-run` — do not publish from act without secrets |

## Troubleshooting

- **act: docker not found** — install Docker or use `host` mode.
- **act: platform unsupported for windows-latest** — expected; use `--matrix os:ubuntu-latest` or host/docker mode.
- **frozen-lockfile fails** — run `bun install` at repo root and commit `bun.lock`.
