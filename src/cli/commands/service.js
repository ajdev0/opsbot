import chalk from 'chalk';
import { loadConfig, saveConfig } from '../../config/index.js';
import { validateConfig } from '../../config/schema.js';
import { supportedRuntimeTypes } from '../../runtime/resolver.js';

export function registerServiceCommand(program) {
  const svc = program.command('service').description('Manage runtime-backed services');

  svc
    .command('add')
    .description('Append a service to config')
    .requiredOption('--name <name>', 'Service key (alphanumeric, -, _)')
    .requiredOption('--type <type>', `Runtime: ${supportedRuntimeTypes().join(', ')}`)
    .option('--path <dir>', 'Working directory (required for deploy / compose)')
    .option('--pm2-name <name>', 'PM2 process name (defaults to service key)')
    .option('--container <name>', 'Docker container name (defaults to service key)')
    .option('--unit <unit>', 'systemd unit name, e.g. nginx.service')
    .option('--compose-file <file>', 'Docker compose file relative to path')
    .option('--compose-service <name>', 'Compose service name')
    .action((opts) => {
      const name = String(opts.name || '').trim();
      const type = String(opts.type || '').trim();
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        console.error(chalk.red('Invalid --name'));
        process.exit(1);
      }
      if (!supportedRuntimeTypes().includes(type)) {
        console.error(chalk.red(`Invalid --type. Use: ${supportedRuntimeTypes().join(', ')}`));
        process.exit(1);
      }

      const cfg = loadConfig();
      cfg.services = cfg.services && typeof cfg.services === 'object' ? cfg.services : {};
      if (cfg.services[name]) {
        console.error(chalk.red(`Service "${name}" already exists`));
        process.exit(1);
      }

      /** @type {Record<string, unknown>} */
      const entry = { type };
      if (opts.path) entry.path = String(opts.path);
      if (opts.pm2Name) entry.pm2_name = String(opts.pm2Name);
      if (opts.container) entry.container = String(opts.container);
      if (opts.unit) entry.unit = String(opts.unit);
      if (opts.composeFile) entry.compose_file = String(opts.composeFile);
      if (opts.composeService) entry.compose_service = String(opts.composeService);

      if (type === 'docker-compose' && !entry.path) {
        console.error(chalk.red('docker-compose services require --path (project directory)'));
        process.exit(1);
      }
      if (type === 'systemd' && !entry.unit) {
        console.error(chalk.red('systemd services require --unit'));
        process.exit(1);
      }

      cfg.services[name] = entry;

      const v = validateConfig(cfg);
      if (!v.ok) {
        console.error(chalk.red(v.errors.join('\n')));
        process.exit(1);
      }
      saveConfig(cfg);
      console.log(chalk.green(`Service "${name}" added (${type}). Restart daemon if running.`));
    });
}
