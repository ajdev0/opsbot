import { resolveAdapter } from '../runtime/resolver.js';

const TELEGRAM_MAX = 3500;

/**
 * @param {string} serviceKey
 * @param {Record<string, unknown>} serviceCfg
 * @param {{ lines?: number }} [opts]
 */
export async function fetchServiceLogs(serviceKey, serviceCfg, opts = {}) {
  const adapter = resolveAdapter(serviceKey, serviceCfg);
  const res = await adapter.logs({ lines: opts.lines ?? 50 });
  if (!res.ok) {
    return truncateForTelegram(res.output || 'Failed to read logs');
  }
  return truncateForTelegram(res.output || '');
}

export function truncateForTelegram(text, max = TELEGRAM_MAX) {
  const t = String(text || '');
  if (t.length <= max) return t;
  return `…(truncated)\n${t.slice(-max)}`;
}
