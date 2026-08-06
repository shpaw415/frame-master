# Releasing Frame-Master

Frame-Master publishes to npm via **GitHub Actions** using [npm Trusted Publishing (OIDC)](https://docs.npmjs.com/trusted-publishers/). No long-lived `NPM_TOKEN` is stored in the repository.

## How a release is triggered

1. Bump the `version` field in root `package.json` (semver).
2. Optionally add `release-notes/vX.Y.Z.md`.
3. Merge to `main` (or push a commit on `main` that changes `package.json`).
4. Workflow [`.github/workflows/release.yml`](../.github/workflows/release.yml) runs:
   - typecheck + tests
   - if `package.json` version is **not** already on the npm registry → `npm publish`
   - creates git tag `vX.Y.Z` and a GitHub Release when notes exist

If the version is already published, the job **skips** publish (safe re-runs).

You can also run the workflow manually: **Actions → Release → Run workflow**.

## One-time: configure Trusted Publisher on npm

After `release.yml` exists on the default branch:

1. Open [npmjs.com](https://www.npmjs.com) → package **frame-master** → **Settings** → **Trusted Publisher**
2. Choose **GitHub Actions**
3. Fill in:
   - **Organization or user:** `shpaw415`
   - **Repository:** `frame-master`
   - **Workflow filename:** `release.yml` (filename only)
   - **Environment name:** leave empty (unless you add a GitHub Environment later)
4. Allow **`npm publish`**
5. Save

Requirements (enforced by the workflow):

- Node.js ≥ 22.14
- npm CLI ≥ 11.5.1
- `package.json` `repository.url` must match `https://github.com/shpaw415/frame-master.git`
- Workflow permission `id-token: write`

## Local dry-run (no publish)

```bash
bun install --frozen-lockfile
bun run typecheck
bun test
npm pack --dry-run
```

## Security notes

- Prefer Trusted Publisher over automation tokens.
- After OIDC works, consider restricting package publish access to 2FA / disallow tokens on npm.
- Provenance attestations are generated automatically for public packages from public GitHub repos when using trusted publishing.
