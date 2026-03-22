import TelegramBot from 'node-telegram-bot-api';
import { loadConfig } from '../config/index.js';
import { DeployRunner } from '../deploy/index.js';
import { resolveEnabledPlugins, mergeTelegramCommands } from '../plugins/loader.js';
import { attachTelegramHandlers } from './handler.js';

/**
 * @param {{
 *   logger: { info: Function, warn: Function, error: Function },
 *   resolvedPlugins?: Array<{ id: string, plugin: import('../plugins/types.js').OpsBotPlugin }>,
 * }} opts
 * @returns {Promise<import('node-telegram-bot-api')>}
 */
export async function startTelegramBot(opts) {
  const { logger, resolvedPlugins: preloadedPlugins } = opts;
  const cfg = loadConfig();
  const token = cfg.telegram?.token;
  if (!token || typeof token !== 'string') {
    throw new Error('telegram.token missing in config');
  }

  const resolved =
    preloadedPlugins !== undefined
      ? preloadedPlugins
      : await resolveEnabledPlugins(cfg, {
          warn: (m) => logger.warn(m),
          error: (m) => logger.error(m),
        });
  const pluginTelegram = mergeTelegramCommands(resolved);
  const pluginCommandNames = new Set(pluginTelegram.keys());

  const bot = new TelegramBot(token, { polling: true });
  const deployRunner = new DeployRunner({
    log: (m) => logger.info(m),
  });

  attachTelegramHandlers(bot, {
    getConfig: () => loadConfig(),
    deployRunner,
    logger,
    pluginTelegram,
    pluginCommandNames,
  });

  logger.info('Telegram polling started');
  return bot;
}

/**
 * @param {import('node-telegram-bot-api')} bot
 */
export async function stopTelegramBot(bot) {
  if (!bot) return;
  await new Promise((resolve) => {
    bot.stopPolling(() => resolve(undefined));
  });
}
