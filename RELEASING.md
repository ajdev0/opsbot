# Releasing OpsBot

## Versioning

- Follow [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`.
- While the major version is **0.x**, breaking changes are allowed; still bump minor or patch appropriately and note breaking behavior in release notes.
- From **1.0.0** onward, treat breaking API/CLI changes as major bumps.

## Pre-release checklist

1. **Replace placeholders**  
   Search for `ajdev0/opsbot` and `your-org` across the repo (especially `package.json`, [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md), [templates/opsbot.service](templates/opsbot.service)) and set the real GitHub org/user and npm package name.

2. **Install and verify**

   ```bash
   npm ci
   npm run verify
   ```

3. **Confirm publish contents**

   ```bash
   npm pack --dry-run
   ```

   Expect `LICENSE`, `CONTRIBUTING.md`, `bin/`, `src/`, `templates/`, `README.md` in the tarball (`RELEASING.md` stays in the git repo only). No `.env` or secrets.

4. **Release notes**  
   Add a short changelog entry (project root `CHANGELOG.md` if you maintain one, or GitHub Release notes only).

5. **Version and tag**

   ```bash
   npm version patch   # or minor | major
   ```

   This updates `package.json` / `package-lock.json` and creates a git tag `vX.Y.Z`. Push commits and tags:

   ```bash
   git push origin main --follow-tags
   ```

6. **Publish to npm**

   **Option A — locally**

   ```bash
   npm publish
   ```

   For a **scoped** public package:

   ```bash
   npm publish --access public
   ```

   **Option B — GitHub Actions (OIDC / Trusted Publishing)**  
   Merge [`.github/workflows/publish.yml`](.github/workflows/publish.yml), then on [npmjs.com](https://www.npmjs.com/) open the package → **Settings** → **Trusted Publisher** → **GitHub Actions**. Set **organization or user**, **repository**, and **workflow filename** `publish.yml` (must match exactly, including extension). Requires [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers) (Node 22.14+ / npm 11.5.1+ on the runner; the workflow uses Node 24). Pushing a tag `v*` runs `npm publish`; the job checks that the tag (without `v`) matches `package.json` `version`. If you set an **environment** name on npm, add `environment: <name>` under `jobs.publish` in `publish.yml`.

7. **GitHub Release**  
   Create a release for the new tag with the same notes as above.

8. **Post-release smoke test**

   ```bash
   npm install -g opsbot-monitor@X.Y.Z    # or your scoped name
   which opsbot
   which opsbot-monitor
   opsbot --version
   opsbot-monitor --version
   opsbot --help
   ```

## Lightweight workflow summary

`npm ci` → `npm run verify` → `npm pack --dry-run` → `npm version` → push (with tags). Then either `npm publish` locally or let **publish.yml** publish via Trusted Publishing → GitHub Release → global install smoke test.

Continuous integration on **main** / **master** and pull requests: [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
