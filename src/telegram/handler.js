import { isChatAuthorized, isCommandAllowed } from '../security/index.js';
import { parseServiceName, parseTelegramCommand } from '../security/sanitizer.js';
import { getHostStatus, formatStatusSummary } from '../utils/system.js';
import { resolveAdapter } from '../runtime/resolver.js';
import { fetchServiceLogs } from '../logs/index.js';
import { sendTextChunks } from './sender.js';

/**
 * @param {import('node-telegram-bot-api')} bot
 * @param {{
 *   getConfig: () => Record<string, unknown>,
 *   deployRunner: { runRecipe: (k: string, c: Record<string, unknown>) => Promise<{ ok: boolean, summary: string }> },
 *   logger: { info: Function, warn: Function, error: Function },
 *   pluginTelegram: Map<string, { pluginId: string, run: (ctx: import('../plugins/types.js').TelegramPluginContext) => void | Promise<void> }>,
 *   pluginCommandNames: Set<string>,
 * }} deps
 */
export function attachTelegramHandlers(bot, deps) {
  const { getConfig, deployRunner, logger, pluginTelegram, pluginCommandNames } = deps;

  bot.on('message', async (msg) => {
    try {
      const text = msg.text;
      if (!text || !text.startsWith('/')) return;

      const chatId = msg.chat.id;
      const cfg = getConfig();

      if (!isChatAuthorized(chatId, cfg)) {
        logger.warn(`Rejected unauthorized chat ${chatId}`);
        return;
      }

      const { command, args } = parseTelegramCommand(text);
      if (!command) return;

      if (!isCommandAllowed(command, pluginCommandNames)) {
        await bot.sendMessage(chatId, 'Unknown command. Try /help');
        return;
      }

      const pluginHandler = pluginTelegram.get(command);
      if (pluginHandler) {
        await pluginHandler.run({ bot, chatId, args, getConfig, logger });
        return;
      }

      if (command === 'help' || command === 'start') {
        const pluginLines =
          pluginCommandNames.size > 0
            ? [`Plugin commands: ${[...pluginCommandNames].sort().map((c) => `/${c}`).join(', ')}`]
            : [];
        await bot.sendMessage(
          chatId,
          [
            'OpsBot commands:',
            '/status — host CPU, RAM, disk, uptime',
            '/services — list configured services',
            '/logs <service> [lines]',
            '/restart <service>',
            '/deploy <service>',
            '/help',
            ...pluginLines,
          ].join('\n'),
        );
        return;
      }

      if (command === 'status') {
        const s = await getHostStatus();
        await bot.sendMessage(chatId, formatStatusSummary(s));
        return;
      }

      if (command === 'services') {
        const services = cfg.services && typeof cfg.services === 'object' ? Object.keys(cfg.services) : [];
        await bot.sendMessage(chatId, services.length ? services.join('\n') : '(no services configured)');
        return;
      }

      const svcName = parseServiceName(args[0]);
      if (!svcName) {
        await bot.sendMessage(chatId, 'Usage: /logs|/restart|/deploy <service>');
        return;
      }

      const services = cfg.services;
      if (!services || typeof services !== 'object' || !services[svcName]) {
        await bot.sendMessage(chatId, `Unknown service "${svcName}". Use /services`);
        return;
      }

      const serviceCfg = /** @type {Record<string, unknown>} */ (services[svcName]);

      if (command === 'logs') {
        let lines = 50;
        if (args[1] != null) {
          const n = parseInt(String(args[1]), 10);
          if (Number.isFinite(n) && n > 0 && n <= 500) lines = n;
        }
        const out = await fetchServiceLogs(svcName, serviceCfg, { lines });
        await sendTextChunks(bot, chatId, out);
        return;
      }

      const adapter = resolveAdapter(svcName, serviceCfg);

      if (command === 'restart') {
        const r = await adapter.restart();
        await bot.sendMessage(chatId, r.ok ? r.message : `Error: ${r.message}`);
        return;
      }

      if (command === 'deploy') {
        const r = await adapter.deploy(deployRunner);
        await sendTextChunks(bot, chatId, r.ok ? r.summary : r.summary || 'Deploy failed');
        return;
      }
    } catch (e) {
      logger.error('telegram handler', e);
      try {
        await bot.sendMessage(msg.chat.id, 'Error: something went wrong. Check the daemon logs for details.');
      } catch {
        /* ignore */
      }
    }
  });
}
