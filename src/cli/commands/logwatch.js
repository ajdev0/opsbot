import chalk from 'chalk';
import { loadConfig, saveConfig } from '../../config/index.js';
import { validateConfig } from '../../config/schema.js';

function collect(value, previous) {
  const next = Array.isArray(previous) ? previous : [];
  next.push(String(value));
  return next;
}

export function registerLogWatchCommand(program) {
  const cmd = program.command('logwatch').description('Configure service log watch alerts');

  cmd
    .command('set')
    .description('Set log watch configuration')
    .option('--enable', 'Enable log watch')
    .option('--disable', 'Disable log watch')
    .option('--interval <seconds>', 'Interval between scans (>= 300)')
    .option('--lines <count>', 'Lines to scan per service (1-500)')
    .option('--cooldown <seconds>', 'Cooldown between alerts per service (>= 60)')
    .option('--service <name>', 'Service key to include (repeatable)', collect, [])
    .option('--pattern <regex>', 'Regex pattern to match (repeatable)', collect, [])
    .action((opts) => {
      if (opts.enable && opts.disable) {
        console.error(chalk.red('Use only one of --enable or --disable'));
        process.exit(1);
      }

      const cfg = loadConfig();
      const current = cfg.log_watch && typeof cfg.log_watch === 'object' ? cfg.log_watch : {};
      cfg.log_watch = { ...current };

      if (opts.enable) cfg.log_watch.enabled = true;
      if (opts.disable) cfg.log_watch.enabled = false;

      if (opts.interval !== undefined) {
        const n = Number(opts.interval);
        if (!Number.isFinite(n) || n < 300) {
          console.error(chalk.red('--interval must be >= 300'));
          process.exit(1);
        }
        cfg.log_watch.interval = n;
      }

      if (opts.lines !== undefined) {
        const n = Number(opts.lines);
        if (!Number.isFinite(n) || n < 1 || n > 500) {
          console.error(chalk.red('--lines must be between 1 and 500'));
          process.exit(1);
        }
        cfg.log_watch.lines = n;
      }

      if (opts.cooldown !== undefined) {
        const n = Number(opts.cooldown);
        if (!Number.isFinite(n) || n < 60) {
          console.error(chalk.red('--cooldown must be >= 60'));
          process.exit(1);
        }
        cfg.log_watch.cooldown_seconds = n;
      }

      if (Array.isArray(opts.service) && opts.service.length > 0) {
        const services = opts.service.map((s) => String(s).trim()).filter(Boolean);
        for (const s of services) {
          if (!/^[a-zA-Z0-9_-]+$/.test(s)) {
            console.error(chalk.red(`Invalid --service value: ${s}`));
            process.exit(1);
          }
        }
        cfg.log_watch.include_services = [...new Set(services)];
      }

      if (Array.isArray(opts.pattern) && opts.pattern.length > 0) {
        const patterns = opts.pattern.map((p) => String(p).trim()).filter(Boolean);
        if (!patterns.length) {
          console.error(chalk.red('At least one non-empty --pattern is required'));
          process.exit(1);
        }
        cfg.log_watch.patterns = patterns;
      }

      const v = validateConfig(cfg);
      if (!v.ok) {
        console.error(chalk.red(v.errors.join('\n')));
        process.exit(1);
      }

      saveConfig(cfg);
      console.log(chalk.green('Log watch updated. Restart daemon to apply.'));
    });
}
