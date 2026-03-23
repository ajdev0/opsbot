import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import { registerInitCommand } from './commands/init.js';
import { registerDaemonCommands } from './commands/daemon.js';
import { registerMonitorCommand } from './commands/monitor.js';
import { registerLogWatchCommand } from './commands/logwatch.js';
import { registerResourceWatchCommand } from './commands/resourcewatch.js';
import { registerServiceCommand } from './commands/service.js';
import { registerDoctorCommand } from './commands/doctor.js';
import { loadConfig } from '../config/index.js';
import { resolveEnabledPlugins, registerPluginCli } from '../plugins/loader.js';

const require = createRequire(import.meta.url);
const { version } = require(join(dirname(fileURLToPath(import.meta.url)), '../../package.json'));

const program = new Command();

program
  .name('opsbot')
  .description('Self-hosted ops assistant: monitoring, Telegram control, runtime adapters')
  .version(version);

registerInitCommand(program);
registerDaemonCommands(program);
registerMonitorCommand(program);
registerLogWatchCommand(program);
registerResourceWatchCommand(program);
registerServiceCommand(program);
registerDoctorCommand(program);

program.configureHelp({ sortSubcommands: true });

(async () => {
  let resolvedPlugins = [];
  try {
    resolvedPlugins = await resolveEnabledPlugins(loadConfig(), {
      warn: (m) => console.warn(m),
      error: (m) => console.error(m),
    });
  } catch {
    /* no config yet or invalid */
  }
  registerPluginCli(program, resolvedPlugins);

  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    console.error(chalk.red(err.message || String(err)));
    process.exit(1);
  }
})();
