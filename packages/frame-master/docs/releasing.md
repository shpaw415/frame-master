# Releasing Frame-Master

Frame-Master publishes to npm via **GitHub Actions** using [npm Trusted Publishing (OIDC)](https://docs.npmjs.com/trusted-publishers/). No long-lived `NPM_TOKEN` is stored in the repository.

This monorepo lives at [shpaw415/frame-master](https://github.com/shpaw415/frame-master). The publishable package is `packages/frame-master`.

## How a release is triggered

1. Bump the `version` field in [`packages/frame-master/package.json`](../package.json) (semver).
2. Optionally add `packages/frame-master/release-notes/vX.Y.Z.md`.
3. Merge to `main` (or push a commit on `main` that changes that `package.json`).
4. Workflow [`.github/workflows/release.yml`](../../../.github/workflows/release.yml) runs:
   - typecheck + tests (in `packages/frame-master`)
   - if the version is **not** already on the npm registry → `npm publish`
   - creates git tag `vX.Y.Z` and a GitHub Release when notes exist

If the version is already published, the job **skips** publish (safe re-runs).

You can also run the workflow manually: **Actions → Release → Run workflow**.

## One-time: configure Trusted Publisher on npm

**Required before the first OIDC publish.** Without this, `npm publish` fails with
`E404 … could not be found or you do not have permission` (npm hides auth failures as 404).

After `release.yml` exists on the default branch:

1. Open [npmjs.com](https://www.npmjs.com) → package **frame-master** → **Settings** → **Trusted Publisher**
2. Choose **GitHub Actions**
3. Fill in **exactly**:
   - **Organization or user:** `shpaw415`
   - **Repository:** `frame-master`
   - **Workflow filename:** `release.yml` (filename only — not `.github/workflows/release.yml`)
   - **Environment name:** leave empty (unless you add a GitHub Environment later)
4. Allow **`npm publish`**
5. Save

npm does **not** validate the form until you publish — typos only show up as E404 at publish time.

Then re-run: **Actions → Release → Run workflow** (or push another `package.json` version bump).

Requirements (enforced by the workflow):

- Node.js current LTS/Current that satisfies the installed npm engines (workflow uses Node 24; npm@12 needs `^22.22.2 || ^24.15.0 || >=26`)
- npm CLI ≥ 11.5.1 (workflow installs `npm@latest`)
- `package.json` `repository.url` must match the GitHub repo (`git+https://github.com/shpaw415/frame-master.git`)
- Job permission `id-token: write` (OIDC); job log should list **Id-token: write**
- No long-lived `NODE_AUTH_TOKEN` / `NPM_TOKEN` on the publish step (OIDC only)
- Publish runs with working directory `packages/frame-master`

## Local dry-run (no publish)

From the monorepo root:

```bash
bun install --frozen-lockfile
bun run typecheck
bun test
cd packages/frame-master && npm pack --dry-run
```

## Security notes

- Prefer Trusted Publisher over automation tokens.
- After OIDC works, consider restricting package publish access to 2FA / disallow tokens on npm.
- Provenance attestations are generated automatically for public packages from public GitHub repos when using trusted publishing.
