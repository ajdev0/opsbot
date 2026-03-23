import { existsSync, unlinkSync } from 'fs';
import { loadConfig } from '../config/index.js';
import { daemonLogPath, pidPath } from '../config/paths.js';
import { createLogger } from '../utils/logger.js';
import { Scheduler } from '../scheduler/index.js';
import { MonitorStateCache, runSingleMonitorCheck } from '../monitor/index.js';
import { LogWatchStateCache, getLogWatchSettings, runServiceLogWatchTick } from '../logs/watcher.js';
import { startTelegramBot, stopTelegramBot } from '../telegram/index.js';
import { resolveEnabledPlugins } from '../plugins/loader.js';

function removePidFile() {
  try {
    if (existsSync(pidPath())) unlinkSync(pidPath());
  } catch {
    /* ignore */
  }
}

export async function startDaemon() {
  const logger = createLogger({ level: 'info', file: daemonLogPath() });
  logger.info('OpsBot daemon starting');

  let bot;
  const scheduler = new Scheduler({ logger });
  const cache = new MonitorStateCache();
  const logWatchCache = new LogWatchStateCache();

  try {
    const cfg = loadConfig();
    const resolvedPlugins = await resolveEnabledPlugins(cfg, {
      warn: (m) => logger.warn(m),
      error: (m) => logger.error(m),
    });
    bot = await startTelegramBot({ logger, resolvedPlugins });

    const alert = async (text) => {
      const c = loadConfig();
      const ids = c.telegram?.allowed_chat_ids || [];
      for (const id of ids) {
        try {
          await bot.sendMessage(id, text);
        } catch (e) {
          logger.error(`alert send failed for ${id}: ${e.message}`);
        }
      }
    };

    const monitors = Array.isArray(cfg.monitors) ? cfg.monitors : [];
    for (const m of monitors) {
      const name = String(m.name);
      const intervalSec = Math.max(5, Number(m.interval || 60));
      scheduler.schedule(`monitor:${name}`, intervalSec * 1000, () =>
        runSingleMonitorCheck(m, cache, alert).catch((e) => logger.error(`monitor ${name}`, e)),
      );
      setImmediate(() =>
        runSingleMonitorCheck(m, cache, alert).catch((e) => logger.error(`monitor ${name} initial`, e)),
      );
    }

    const logWatch = getLogWatchSettings(cfg);
    if (!logWatch.enabled) {
      logger.info('Log watch disabled');
    } else if (logWatch.includeServices.length === 0) {
      logger.warn('Log watch enabled but no include_services configured; skipping schedule');
    } else {
      const runLogWatch = async () => {
        await runServiceLogWatchTick({
          cfg: loadConfig(),
          cache: logWatchCache,
          alert,
          logger,
        });
      };
      scheduler.schedule('logwatch', logWatch.intervalSec * 1000, () =>
        runLogWatch().catch((e) => logger.error('logwatch tick', e)),
      );
      setImmediate(() => runLogWatch().catch((e) => logger.error('logwatch initial', e)));
      logger.info(
        `Log watch enabled (${logWatch.includeServices.length} service(s), every ${logWatch.intervalSec}s, ${logWatch.lines} lines)`,
      );
    }

    const daemonApi = {
      logger,
      loadConfig,
      schedule: (name, intervalMs, fn) => scheduler.schedule(name, intervalMs, fn),
      alert,
    };
    for (const { id, plugin } of resolvedPlugins) {
      if (typeof plugin.setupDaemon !== 'function') continue;
      try {
        await plugin.setupDaemon(daemonApi);
      } catch (e) {
        logger.error(`Plugin "${id}" setupDaemon failed`, e);
      }
    }

    const shutdown = async (signal) => {
      logger.info(`Received ${signal}, shutting down`);
      scheduler.stopAll();
      try {
        await stopTelegramBot(bot);
      } catch (e) {
        logger.error('stop telegram', e);
      }
      removePidFile();
      process.exit(0);
    };

    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));

    logger.info(
      `Daemon ready (${monitors.length} monitor job(s), ${resolvedPlugins.length} plugin(s))`,
    );
  } catch (e) {
    logger.error('Daemon failed to start', e);
    removePidFile();
    process.exit(1);
  }
}
