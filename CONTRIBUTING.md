# Contributing to OpsBot

Thanks for your interest. OpsBot is a small Node.js CLI and daemon aimed at **Linux** servers (paths, `systemctl`, Docker, etc. assume that environment).

## Before you start

- Read [README.md](README.md) for architecture and security expectations.
- Replace placeholder repo URLs: search the repo for `ajdev0/opsbot` and update to your fork or the canonical remote after you clone.

## Reporting issues

- Use [GitHub Issues](https://github.com/ajdev0/opsbot/issues) for bugs and feature requests.
- For **security-sensitive** reports (e.g. auth bypass, remote code execution), please use [GitHub Security Advisories](https://github.com/ajdev0/opsbot/security/advisories/new) for the canonical repo, or contact maintainers privately if that is not available.

## Pull requests

1. Fork the repository and create a branch from `main` (or the default branch).
2. Keep changes focused; match existing style (ES modules, `import`/`export`, minimal comments).
3. Run locally:

   ```bash
   npm ci
   npm run verify
   ```

4. Describe what changed and why in the PR description.

## Code style

- Node **18+**, `"type": "module"`.
- Prefer extending existing modules over parallel implementations.
- Do not add arbitrary shell execution from Telegram or untrusted input; deploy and runtime behavior must stay aligned with [README.md](README.md) security notes.

## License

By contributing, you agree that your contributions will be licensed under the same terms as the project ([LICENSE](LICENSE)).
