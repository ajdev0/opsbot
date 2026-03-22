const ALLOWED_COMMANDS = new Set(['status', 'logs', 'restart', 'deploy', 'services', 'help', 'start']);

/**
 * @param {number} chatId
 * @param {{ telegram?: { allowed_chat_ids?: number[] } }} config
 */
export function isChatAuthorized(chatId, config) {
  const allowed = config?.telegram?.allowed_chat_ids;
  if (!Array.isArray(allowed) || allowed.length === 0) return false;
  return allowed.includes(Number(chatId));
}

/**
 * @param {string} command - without leading slash
 * @param {ReadonlySet<string>} [pluginCommands] - merged from enabled plugins (Telegram)
 */
export function isCommandAllowed(command, pluginCommands = new Set()) {
  return ALLOWED_COMMANDS.has(command) || pluginCommands.has(command);
}
