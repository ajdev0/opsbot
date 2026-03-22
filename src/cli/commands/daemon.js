import chalk from 'chalk';
import { startDaemonProcess, stopDaemonProcess, isDaemonRunning, readDaemonPid } from '../../daemon/lifecycle.js';
import { startDaemon } from '../../daemon/index.js';

export function registerDaemonCommands(program) {
  const daemon = program.command('daemon').description('Control the OpsBot background daemon');

  daemon
    .command('start')
    .description('Fork daemon in background (writes ~/.opsbot/daemon.pid)')
    .action(() => {
      try {
        const pid = startDaemonProcess();
        console.log(chalk.green(`Daemon started (pid ${pid})`));
      } catch (e) {
        console.error(chalk.red(e.message || e));
        process.exit(1);
      }
    });

  daemon
    .command('stop')
    .description('Stop background daemon using pid file')
    .action(async () => {
      try {
        await stopDaemonProcess();
        console.log(chalk.green('Daemon stopped'));
      } catch (e) {
        console.error(chalk.red(e.message || e));
        process.exit(1);
      }
    });

  daemon
    .command('run')
    .description('Run daemon in foreground (use with systemd)')
    .action(async () => {
      if (process.env.OPSBOT_DAEMON === '1') {
        console.error(chalk.red('Refusing nested daemon run'));
        process.exit(1);
      }
      console.log(chalk.dim('OpsBot daemon running in foreground (Ctrl+C to stop)'));
      await startDaemon();
    });

  daemon
    .command('status')
    .description('Show whether daemon pid is active')
    .action(() => {
      const pid = readDaemonPid();
      if (pid == null) {
        console.log(chalk.yellow('No pid file (daemon not started)'));
        return;
      }
      if (isDaemonRunning()) {
        console.log(chalk.green(`Daemon running (pid ${pid})`));
      } else {
        console.log(chalk.red(`Stale pid file (pid ${pid} not running)`));
      }
    });
}
