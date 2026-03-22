import chalk from 'chalk';
import axios from 'axios';
import { existsSync } from 'fs';
import { configPath } from '../../config/paths.js';
import { loadConfig } from '../../config/index.js';
import { runBinary } from '../../utils/shell.js';
import { isDaemonRunning, readDaemonPid } from '../../daemon/lifecycle.js';

async function checkBinary(label, file, args) {
  try {
    await runBinary(file, args, { timeout: 15_000 });
    return { label, ok: true, detail: 'available' };
  } catch (e) {
    const msg = e.stderr?.toString?.() || e.message || String(e);
    return { label, ok: false, detail: msg.split('\n')[0] || 'missing' };
  }
}

export function registerDoctorCommand(program) {
  program
    .command('doctor')
    .description('Validate config, Telegram token, and runtime binaries')
    .action(async () => {
      const results = [];
      const path = configPath();
      /** @type {Record<string, unknown>|null} */
      let cfg = null;

      if (!existsSync(path)) {
        results.push({ label: 'config', ok: false, detail: `missing (${path})` });
      } else {
        try {
          cfg = loadConfig();
          results.push({ label: 'config', ok: true, detail: path });
        } catch (e) {
          results.push({ label: 'config', ok: false, detail: e.message || String(e) });
        }
      }

      const token = cfg?.telegram && typeof cfg.telegram === 'object' ? cfg.telegram.token : '';
      if (typeof token === 'string' && token.trim()) {
        try {
          const { data } = await axios.get(`https://api.telegram.org/bot${token}/getMe`, { timeout: 10_000 });
          if (data?.ok) {
            results.push({ label: 'telegram token', ok: true, detail: `@${data.result?.username || 'bot'}` });
          } else {
            results.push({ label: 'telegram token', ok: false, detail: JSON.stringify(data) });
          }
        } catch (e) {
          results.push({ label: 'telegram token', ok: false, detail: e.message || String(e) });
        }
      } else {
        results.push({ label: 'telegram token', ok: false, detail: 'not set or invalid config' });
      }

      results.push(await checkBinary('pm2', 'pm2', ['-v']));
      results.push(await checkBinary('docker', 'docker', ['version']));
      results.push(await checkBinary('docker compose', 'docker', ['compose', 'version']));
      results.push(await checkBinary('systemctl', 'systemctl', ['--version']));

      const pid = readDaemonPid();
      if (pid == null) {
        results.push({ label: 'daemon', ok: true, detail: 'not started (no pid file)' });
      } else if (isDaemonRunning()) {
        results.push({ label: 'daemon', ok: true, detail: `running (pid ${pid})` });
      } else {
        results.push({ label: 'daemon', ok: false, detail: `stale pid file (${pid})` });
      }

      for (const r of results) {
        const icon = r.ok ? chalk.green('✓') : chalk.red('✗');
        console.log(`${icon} ${r.label}: ${r.detail}`);
      }

      const failed = results.filter((r) => !r.ok);
      if (failed.length) process.exit(1);
    });
}
