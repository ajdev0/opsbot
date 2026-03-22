/**
 * Service names from Telegram must match config keys — strict charset only.
 * @param {string} raw
 * @returns {string | null}
 */
export function parseServiceName(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(s)) return null;
  return s;
}

/**
 * @param {string} text
 * @returns {{ command: string, args: string[] }}
 */
export function parseTelegramCommand(text) {
  const line = String(text || '').trim();
  if (!line.startsWith('/')) {
    return { command: '', args: [] };
  }
  const parts = line.split(/\s+/).filter(Boolean);
  let cmd = parts[0]?.replace(/^\/+/, '').toLowerCase() || '';
  const at = cmd.indexOf('@');
  if (at >= 0) cmd = cmd.slice(0, at);
  const args = parts.slice(1);
  return { command: cmd, args };
}
