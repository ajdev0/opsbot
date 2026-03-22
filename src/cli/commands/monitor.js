import chalk from 'chalk';
import { loadConfig, saveConfig } from '../../config/index.js';
import { validateConfig } from '../../config/schema.js';

export function registerMonitorCommand(program) {
  program
    .command('monitor')
    .description('Manage HTTP monitors')
    .command('add')
    .description('Append a monitor to config')
    .requiredOption('--name <name>', 'Monitor name (alphanumeric, -, _)')
    .requiredOption('--url <url>', 'URL to check')
    .option('--interval <seconds>', 'Interval between checks', '60')
    .option('--timeout <seconds>', 'HTTP timeout', '10')
    .option('--expected-status <code>', 'Expected HTTP status', '200')
    .action((opts) => {
      const name = String(opts.name || '').trim();
      const url = String(opts.url || '').trim();
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        console.error(chalk.red('Invalid --name'));
        process.exit(1);
      }
      const interval = Number(opts.interval);
      const timeout = Number(opts.timeout);
      const expected_status = Number(opts.expectedStatus);
      if (!Number.isFinite(interval) || interval < 5) {
        console.error(chalk.red('--interval must be >= 5'));
        process.exit(1);
      }
      if (!Number.isFinite(timeout) || timeout < 1) {
        console.error(chalk.red('--timeout must be >= 1'));
        process.exit(1);
      }

      const cfg = loadConfig();
      cfg.monitors = Array.isArray(cfg.monitors) ? cfg.monitors : [];
      if (cfg.monitors.some((m) => m.name === name)) {
        console.error(chalk.red(`Monitor "${name}" already exists`));
        process.exit(1);
      }
      cfg.monitors.push({
        name,
        url,
        interval,
        timeout,
        expected_status,
      });

      const v = validateConfig(cfg);
      if (!v.ok) {
        console.error(chalk.red(v.errors.join('\n')));
        process.exit(1);
      }
      saveConfig(cfg);
      console.log(chalk.green(`Monitor "${name}" added. Restart daemon to apply.`));
    });
}
