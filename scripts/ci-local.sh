#!/usr/bin/env bash
# Local mirror of GitHub Actions multiplatform CI for this monorepo.
#
# Modes:
#   host   (default) — run the same steps as CI on this machine (no Docker)
#   act    — run .github/workflows via nektos/act (Docker required; Linux only)
#   docker — run CI steps inside a disposable Bun Ubuntu container
#
# Examples:
#   ./scripts/ci-local.sh
#   ./scripts/ci-local.sh host
#   ./scripts/ci-local.sh act
#   ./scripts/ci-local.sh act --job test
#   ./scripts/ci-local.sh docker
#   ./scripts/ci-local.sh act -W .github/workflows/bun-multiplatform.yml
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MODE="${1:-host}"
if [[ $# -gt 0 ]]; then
	shift
fi

# Match GHA: install at monorepo root, test inside package
run_host_ci() {
	echo "==> [host] bun install --frozen-lockfile"
	bun install --frozen-lockfile

	echo "==> [host] typecheck (packages/frame-master)"
	(cd packages/frame-master && bun run typecheck)

	echo "==> [host] test (packages/frame-master)"
	(cd packages/frame-master && bun test)

	echo "==> [host] CI steps passed on $(uname -s)/$(uname -m)"
}

run_act_ci() {
	if ! command -v act >/dev/null 2>&1; then
		echo "error: act not found. Install: https://github.com/nektos/act#installation" >&2
		echo "  curl -sL https://raw.githubusercontent.com/nektos/act/master/install.sh | bash -s -- -b \"\$HOME/.local/bin\"" >&2
		exit 1
	fi
	if ! command -v docker >/dev/null 2>&1; then
		echo "error: Docker is required for act mode (act runs workflows in containers)." >&2
		echo "  Install Docker Desktop / docker engine, then re-run: $0 act" >&2
		echo "  Or use host mode (no Docker): $0 host" >&2
		exit 1
	fi
	if ! docker info >/dev/null 2>&1; then
		echo "error: Docker daemon is not running." >&2
		exit 1
	fi

	# Default: multiplatform workflow, only the Linux matrix leg is runnable under act.
	# Force matrix os to ubuntu via --matrix if act supports it; otherwise list jobs and run ubuntu.
	echo "==> [act] $(act --version)"
	echo "==> [act] running Bun multiplatform workflow (Linux container; Windows/macOS jobs are skipped by act)"

	# Prefer workflow_dispatch (no secrets). Only the Linux matrix leg is runnable under act.
	# Extra args are forwarded (e.g. -v, --list).
	if [[ $# -eq 0 ]]; then
		act workflow_dispatch \
			-W .github/workflows/bun-multiplatform.yml \
			--matrix os:ubuntu-latest
	else
		act "$@"
	fi
}

run_docker_ci() {
	if ! command -v docker >/dev/null 2>&1; then
		echo "error: Docker is required for docker mode." >&2
		exit 1
	fi
	if ! docker info >/dev/null 2>&1; then
		echo "error: Docker daemon is not running." >&2
		exit 1
	fi

	IMAGE="${CI_LOCAL_IMAGE:-oven/bun:1.3-debian}"
	echo "==> [docker] image=$IMAGE (override with CI_LOCAL_IMAGE)"
	echo "==> [docker] mounting $ROOT -> /workspace"

	docker run --rm -t \
		-v "$ROOT:/workspace" \
		-w /workspace \
		"$IMAGE" \
		bash -lc '
			set -euo pipefail
			echo "bun $(bun --version)"
			bun install --frozen-lockfile
			cd packages/frame-master
			bun run typecheck
			bun test
		'
}

case "$MODE" in
	host)
		run_host_ci
		;;
	act)
		run_act_ci "$@"
		;;
	docker)
		run_docker_ci
		;;
	-h|--help|help)
		sed -n '2,20p' "$0"
		;;
	*)
		echo "Unknown mode: $MODE (expected: host | act | docker)" >&2
		exit 1
		;;
esac
