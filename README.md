# OpsBot Monitor

[![npm](https://img.shields.io/npm/v/opsbot-monitor.svg)](https://www.npmjs.com/package/opsbot-monitor)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Lightweight **self-hosted** Linux CLI + daemon for:

- HTTP/API monitoring with Telegram alerts (state transitions only)
- Whitelisted Telegram commands: status, logs, restart, deploy, services
- Runtime adapters: **PM2**, **Docker**, **Docker Compose**, **systemd**
- Recipe-driven deploys (from your config only — never from chat text)

## Philosophy

- **CLI** = control plane (config, doctor, start/stop)
- **Daemon** = execution plane (scheduler, monitors, Telegram polling, adapters)
- **No arbitrary shell from Telegram** — only mapped operations through adapters; deploy steps come from `config.yaml` you control.

## Requirements

- **Node.js 18+**
- Linux VPS (paths and checks assume a Linux environment)
- A Telegram bot token and your chat ID

## Install

```bash
npm install -g opsbot-monitor
```

The npm package name is `opsbot-monitor`. The same install provides two CLI commands, `opsbot` and `opsbot-monitor` (equivalent). Help output uses the name `opsbot`. If you publish a fork under a [scoped name](https://docs.npmjs.com/cli/v10/using-npm/scope) (for example `@your-org/opsbot-monitor`), install with `npm install -g @your-org/opsbot-monitor` instead.

After a global install, confirm a binary is on your `PATH`:

```bash
which opsbot
opsbot --version
# or: which opsbot-monitor && opsbot-monitor --version
```

Or clone and link:

```bash
cd opsbot && npm install && npm link
```

## Quick start

```bash
opsbot init
opsbot doctor
opsbot daemon start   # background + ~/.opsbot/daemon.pid
```

Logs: `~/.opsbot/daemon.log`

### Config

Path: `~/.opsbot/config.yaml` (or under `$OPSBOT_HOME` when set — config, pid file, and daemon log live in that directory).

Example:

```yaml
telegram:
  token: "YOUR_BOT_TOKEN"
  allowed_chat_ids:
    - 123456789

monitors:
  - name: api
    url: https://api.example.com/health
    interval: 60
    timeout: 10
    expected_status: 200

log_watch:
  enabled: true
  interval: 3600
  lines: 100
  patterns:
    - "\\b500\\b"
    - "status=500"
    - "HTTP\\s+500"
    - "\" 500 "
  cooldown_seconds: 3600
  include_services:
    - api
    - web

services:
  api:
    type: pm2
    path: /srv/api
    pm2_name: api
    deploy:
      - git pull
      - npm ci
      - pm2 restart api
  web:
    type: docker
    container: web
    # container defaults to service key if omitted; optional: docker_name (alias)
  app:
    type: docker-compose
    path: /srv/app
    # optional: compose_file, compose_service — logs/restart run in path; see /deploy below
    # deploy: omitted → /deploy runs `docker compose up -d` (whole project, or compose_service if set)
    # deploy:
    #   - git pull
    #   - docker compose up -d --build
  nginx:
    type: systemd
    unit: nginx.service
    # optional: unit_name (alias). Logs use journalctl -u from config only.
```

### CLI commands

| Command | Purpose |
|--------|---------|
| `opsbot init` | Wizard: token, chat IDs, optional first service |
| `opsbot doctor` | Config, Telegram `getMe`, pm2/docker/systemctl checks |
| `opsbot daemon start` | Fork daemon (background) |
| `opsbot daemon stop` | Stop via pid file |
| `opsbot daemon run` | **Foreground** — use with systemd |
| `opsbot daemon status` | Pid file / process check |
| `opsbot monitor add` | Add HTTP monitor |
| `opsbot logwatch set` | Configure service log-watch alerts |
| `opsbot service add` | Add runtime service |

```bash
opsbot monitor add --name api --url https://example.com --interval 60 --timeout 10
opsbot logwatch set --enable --interval 3600 --lines 100 --cooldown 3600 --service api --service web --pattern "\\b500\\b" --pattern "status=500" --pattern "\"statusCode\":500"
opsbot service add --name api --type pm2 --path /srv/api --pm2-name api
opsbot service add --name web --type docker --path /srv/web --container web
opsbot service add --name stack --type docker-compose --path /srv/stack --compose-file docker-compose.yml --compose-service app
opsbot service add --name nginx --type systemd --unit nginx.service
```

### Telegram commands

Only whitelisted `allowed_chat_ids` may use:

- `/status` — CPU, RAM, disk, uptime
- `/services` — configured service keys
- `/logs <service> [lines]`
- `/restart <service>`
- `/deploy <service>` — runs `deploy:` recipe under `path` (shell steps); **docker-compose** with no `deploy` runs `docker compose up -d` from `path`
- `/help`

Alerts:

- `⚠️ <name> DOWN` / `✅ <name> RECOVERED` (no spam while staying down)
- `⚠️ LOG WATCH <service>` when selected service logs match configured 500-patterns

Log watch notes:

- Pattern-based polling scan (not live streaming tail).
- Runs on daemon schedule (`log_watch.interval`), default 1 hour when enabled.
- Dedupe + cooldown suppress repeated alerts for already-seen lines.
- Scans only `log_watch.include_services` entries (empty list means no scan).

## systemd

1. Install globally so `opsbot` or `opsbot-monitor` is on `PATH` (or set full path in the unit).
2. Copy [templates/opsbot.service](templates/opsbot.service) to `/etc/systemd/system/opsbot.service`.
3. Adjust `ExecStart` to the output of `which opsbot` or `which opsbot-monitor` (often under `/usr/bin` or nvm).
4. Uncomment/set `User=` / `Group=` for a non-root service account.
5. Enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now opsbot
sudo journalctl -u opsbot -f
```

Use **`opsbot daemon run`** in `ExecStart` so systemd supervises a single foreground process (do not use `daemon start` under systemd).

### systemd adapter permissions

The **systemd** runtime type calls system `systemctl` and `journalctl` as the **same user** that runs the opsbot daemon. OpsBot does **not** use `sudo` or other elevation.

- **Restart** (`systemctl restart`): managing **system** units usually needs root or polkit; unprivileged users typically get permission errors.
- **Logs** (`journalctl -u …`): reading many system units’ journals requires membership in **`systemd-journal`** or **`adm`** (or root); otherwise you may see empty output or access denied.
- **User units** (`systemctl --user`) are not targeted by this adapter; use system units or extend the adapter explicitly if you need session units.

## Security notes

- **Whitelist** Telegram chat IDs; unknown chats are ignored.
- **Service names** must match config keys (`[a-zA-Z0-9_-]+`).
- Adapters use fixed binaries + argument arrays (`execFile`), not user-built shell strings.
- **Deploy** runs `/bin/sh -c` **only** for steps listed under `services.<name>.deploy` in your YAML — never from Telegram message text (except **docker-compose** with an empty/missing `deploy`, which runs `docker compose up -d` via the adapter, not arbitrary shell).
- Dependency hardening: this project uses npm `overrides` to keep `request` transitive packages (`form-data`, `qs`, `tough-cookie`) on patched versions without forcing a downgrade of `node-telegram-bot-api`.
- If `npm audit` still reports moderate findings tied to the legacy `request` chain, avoid `npm audit fix --force` unless you have validated Telegram runtime behavior after dependency changes.

## Development

From a git checkout:

```bash
npm ci
npm run verify
```

`verify` runs `opsbot --version` and `opsbot --help` via `node bin/opsbot.js` (same entry as `opsbot-monitor`; no Telegram or daemon required).

See [CONTRIBUTING.md](CONTRIBUTING.md) for pull requests and security reporting. Releases: [RELEASING.md](RELEASING.md).

## Project layout

```
opsbot/
  bin/opsbot.js
  src/
    cli/          # Commander entry & commands
    daemon/       # Lifecycle + main loop
    monitor/      # HTTP checks + state cache
    telegram/     # Transport + routing (no direct shell)
    runtime/      # PM2, Docker, Compose, systemd adapters
    deploy/       # Recipe runner
    logs/         # Tail + Telegram-safe truncation
    config/       # YAML load/save + schema validation
    security/     # Auth + parsing helpers
    scheduler/    # Named interval jobs
    utils/        # Logger, safe shell, host metrics
  templates/opsbot.service
```

## License

[MIT](LICENSE).
