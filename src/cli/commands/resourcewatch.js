import chalk from 'chalk';
import { loadConfig, saveConfig } from '../../config/index.js';
import { validateConfig } from '../../config/schema.js';
import { snapshotResourceWatchStatus } from '../../monitor/resource-watch.js';

export function registerResourceWatchCommand(program) {
  const cmd = program.command('resourcewatch').description('Configure host resource threshold alerts');

  cmd
    .command('set')
    .description('Set resource watch configuration')
    .option('--enable', 'Enable resource watch')
    .option('--disable', 'Disable resource watch')
    .option('--interval <seconds>', 'Interval between checks (>= 10)')
    .option('--cpu-mode <mode>', 'CPU mode: delta|loadavg')
    .option('--cpu <percent>', 'CPU threshold percent (1-100)')
    .option('--ram <percent>', 'RAM threshold percent (1-100)')
    .option('--recover-cpu <percent>', 'CPU recovery threshold (0-100, must be lower than cpu)')
    .option('--recover-ram <percent>', 'RAM recovery threshold (0-100, must be lower than ram)')
    .option('--cooldown <seconds>', 'Cooldown between transition alerts (>= 0)')
    .option('--breach-ticks <count>', 'Consecutive breach ticks to trigger (>= 1)')
    .option('--recover-ticks <count>', 'Consecutive recovery ticks to recover (>= 1)')
    .action((opts) => {
      if (opts.enable && opts.disable) {
        console.error(chalk.red('Use only one of --enable or --disable'));
        process.exit(1);
      }

      const cfg = loadConfig();
      const current = cfg.resource_watch && typeof cfg.resource_watch === 'object' ? cfg.resource_watch : {};
      cfg.resource_watch = { ...current };

      if (opts.enable) cfg.resource_watch.enabled = true;
      if (opts.disable) cfg.resource_watch.enabled = false;

      if (opts.interval !== undefined) {
        const n = Number(opts.interval);
        if (!Number.isFinite(n) || n < 10) {
          console.error(chalk.red('--interval must be >= 10'));
          process.exit(1);
        }
        cfg.resource_watch.interval = n;
      }

      if (opts.cpuMode !== undefined) {
        const mode = String(opts.cpuMode).trim();
        if (mode !== 'delta' && mode !== 'loadavg') {
          console.error(chalk.red('--cpu-mode must be one of: delta, loadavg'));
          process.exit(1);
        }
        cfg.resource_watch.cpu_mode = mode;
      }

      if (opts.cpu !== undefined) {
        const n = Number(opts.cpu);
        if (!Number.isFinite(n) || n < 1 || n > 100) {
          console.error(chalk.red('--cpu must be between 1 and 100'));
          process.exit(1);
        }
        cfg.resource_watch.cpu_threshold = n;
      }

      if (opts.ram !== undefined) {
        const n = Number(opts.ram);
        if (!Number.isFinite(n) || n < 1 || n > 100) {
          console.error(chalk.red('--ram must be between 1 and 100'));
          process.exit(1);
        }
        cfg.resource_watch.ram_threshold = n;
      }

      if (opts.recoverCpu !== undefined) {
        const n = Number(opts.recoverCpu);
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          console.error(chalk.red('--recover-cpu must be between 0 and 100'));
          process.exit(1);
        }
        cfg.resource_watch.recover_cpu_below = n;
      }

      if (opts.recoverRam !== undefined) {
        const n = Number(opts.recoverRam);
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          console.error(chalk.red('--recover-ram must be between 0 and 100'));
          process.exit(1);
        }
        cfg.resource_watch.recover_ram_below = n;
      }

      if (opts.cooldown !== undefined) {
        const n = Number(opts.cooldown);
        if (!Number.isFinite(n) || n < 0) {
          console.error(chalk.red('--cooldown must be >= 0'));
          process.exit(1);
        }
        cfg.resource_watch.cooldown_seconds = n;
      }

      if (opts.breachTicks !== undefined) {
        const n = Number(opts.breachTicks);
        if (!Number.isInteger(n) || n < 1) {
          console.error(chalk.red('--breach-ticks must be an integer >= 1'));
          process.exit(1);
        }
        cfg.resource_watch.consecutive_breach_ticks = n;
      }

      if (opts.recoverTicks !== undefined) {
        const n = Number(opts.recoverTicks);
        if (!Number.isInteger(n) || n < 1) {
          console.error(chalk.red('--recover-ticks must be an integer >= 1'));
          process.exit(1);
        }
        cfg.resource_watch.consecutive_recover_ticks = n;
      }

      const v = validateConfig(cfg);
      if (!v.ok) {
        console.error(chalk.red(v.errors.join('\n')));
        process.exit(1);
      }

      saveConfig(cfg);
      console.log(chalk.green('Resource watch updated. Restart daemon to apply.'));
    });

  cmd
    .command('status')
    .description('Show resource watch settings and current host sample')
    .action(() => {
      const cfg = loadConfig();
      const { settings, sample } = snapshotResourceWatchStatus(cfg);
      const cpuNow = sample.cpuPct == null ? 'n/a (delta mode needs two daemon ticks)' : `${sample.cpuPct}%`;
      console.log(
        [
          `enabled: ${settings.enabled}`,
          `interval: ${settings.intervalSec}s`,
          `cpu_mode: ${settings.cpuMode}`,
          `cpu_threshold: ${settings.cpuThreshold}% (recover below ${settings.recoverCpuBelow}%)`,
          `ram_threshold: ${settings.ramThreshold}% (recover below ${settings.recoverRamBelow}%)`,
          `cooldown_seconds: ${settings.cooldownSec}`,
          `consecutive_breach_ticks: ${settings.breachTicks}`,
          `consecutive_recover_ticks: ${settings.recoverTicks}`,
          '---',
          `current_cpu: ${cpuNow}`,
          `current_ram: ${sample.ramPct}%`,
        ].join('\n'),
      );
    });
}
