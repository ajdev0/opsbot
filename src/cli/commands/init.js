import chalk from 'chalk';
import inquirer from 'inquirer';
import { ensureOpsbotDir, configPath } from '../../config/paths.js';
import { loadConfig, saveConfig, defaultConfig } from '../../config/index.js';
import { validateConfig } from '../../config/schema.js';

export function registerInitCommand(program) {
  program
    .command('init')
    .description('Create ~/.opsbot and interactive config wizard')
    .action(async () => {
      ensureOpsbotDir();
      const existing = loadConfig({ required: false });
      if (existing) {
        const { overwrite } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwrite',
            message: `Config already exists at ${configPath()}. Overwrite?`,
            default: false,
          },
        ]);
        if (!overwrite) {
          console.log(chalk.yellow('Aborted.'));
          return;
        }
      }

      const answers = await inquirer.prompt([
        {
          type: 'password',
          name: 'token',
          message: 'Telegram bot token',
          mask: '*',
          validate: (v) => (v && String(v).trim() ? true : 'Token is required'),
        },
        {
          type: 'input',
          name: 'chatIds',
          message: 'Allowed Telegram chat IDs (comma-separated)',
          validate: (v) => {
            const parts = String(v)
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            if (!parts.length) return 'At least one chat ID is required';
            for (const p of parts) {
              if (!/^-?\d+$/.test(p)) return `Invalid chat ID: ${p}`;
            }
            return true;
          },
        },
        {
          type: 'confirm',
          name: 'addService',
          message: 'Add a first PM2 service now?',
          default: false,
        },
      ]);

      const cfg = defaultConfig();
      cfg.telegram.token = answers.token.trim();
      cfg.telegram.allowed_chat_ids = answers.chatIds.split(',').map((s) => Number(s.trim()));

      if (answers.addService) {
        const svc = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: 'Service key (e.g. api)',
            validate: (v) => (/^[a-zA-Z0-9_-]+$/.test(v) ? true : 'Use letters, numbers, - and _ only'),
          },
          {
            type: 'input',
            name: 'path',
            message: 'Working directory for deploy/logs context',
            default: process.cwd(),
          },
          {
            type: 'input',
            name: 'pm2Name',
            message: 'PM2 process name',
            default: (answers) => answers.name,
          },
        ]);
        cfg.services[svc.name] = {
          type: 'pm2',
          path: svc.path,
          pm2_name: svc.pm2Name,
        };
      }

      const validation = validateConfig(cfg);
      if (!validation.ok) {
        console.error(chalk.red('Config validation failed:'), validation.errors);
        process.exit(1);
      }

      saveConfig(cfg);
      console.log(chalk.green(`Wrote ${configPath()}`));
      console.log(chalk.dim('Run: opsbot doctor && opsbot daemon start'));
    });
}
