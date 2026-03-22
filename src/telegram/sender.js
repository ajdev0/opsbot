const DEFAULT_CHUNK = 3500;

/**
 * @param {import('node-telegram-bot-api')} bot
 * @param {number} chatId
 * @param {string} text
 * @param {number} [chunkSize]
 */
export async function sendTextChunks(bot, chatId, text, chunkSize = DEFAULT_CHUNK) {
  const t = String(text || '');
  if (!t.length) {
    await bot.sendMessage(chatId, '(empty)');
    return;
  }
  for (let i = 0; i < t.length; i += chunkSize) {
    await bot.sendMessage(chatId, t.slice(i, i + chunkSize));
  }
}
