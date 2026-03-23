import { createHash } from 'crypto';
import { resolveAdapter } from '../runtime/resolver.js';

const DEFAULT_PATTERNS = ['\\b500\\b', 'status=500', 'HTTP\\s+500', '" 500 '];
const MAX_ALERT_LINES = 3;
const MAX_RECENT_FINGERPRINTS = 1000;

/**
 * In-memory state to suppress duplicate alerts.
 */
export class LogWatchStateCache {
  constructor() {
    /** @type {Map<string, Set<string>>} */
    this.serviceFingerprints = new Map();
    /** @type {Map<string, number>} */
    this.lastAlertAtMs = new Map();
  }

  /**
   * @param {string} service
   * @param {string[]} fingerprints
   * @param {number} nowMs
   * @param {number} cooldownSec
   */
  shouldAlert(service, fingerprints, nowMs, cooldownSec) {
    if (!fingerprints.length) return false;
    const known = this.serviceFingerprints.get(service) || new Set();
    const fresh = fingerprints.filter((f) => !known.has(f));
    if (!fresh.length) return false;

    const cooldownMs = Math.max(0, Number(cooldownSec || 0) * 1000);
    const last = this.lastAlertAtMs.get(service) || 0;
    if (cooldownMs > 0 && nowMs - last < cooldownMs) {
      for (const fp of fresh) known.add(fp);
      this.trimSet(known);
      this.serviceFingerprints.set(service, known);
      return false;
    }

    for (const fp of fresh) known.add(fp);
    this.trimSet(known);
    this.serviceFingerprints.set(service, known);
    this.lastAlertAtMs.set(service, nowMs);
    return true;
  }

  /** @param {Set<string>} s */
  trimSet(s) {
    while (s.size > MAX_RECENT_FINGERPRINTS) {
      const first = s.values().next().value;
      if (!first) break;
      s.delete(first);
    }
  }
}

/**
 * @param {Record<string, unknown>} cfg
 */
export function getLogWatchSettings(cfg) {
  const lw = cfg?.log_watch && typeof cfg.log_watch === 'object' ? cfg.log_watch : {};
  const enabled = Boolean(lw.enabled);
  const intervalSec = Math.max(300, Number(lw.interval ?? 3600));
  const lines = Math.min(500, Math.max(1, Number(lw.lines ?? 100)));
  const cooldownSec = Math.max(60, Number(lw.cooldown_seconds ?? 3600));
  const includeServices = Array.isArray(lw.include_services)
    ? lw.include_services.map((s) => String(s)).filter(Boolean)
    : [];
  const patternSources = Array.isArray(lw.patterns) && lw.patterns.length > 0 ? lw.patterns : DEFAULT_PATTERNS;
  const patterns = patternSources
    .map((src) => {
      try {
        return new RegExp(String(src), 'i');
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return { enabled, intervalSec, lines, cooldownSec, includeServices, patterns };
}

/**
 * @param {string} service
 * @param {string} line
 */
function fingerprint(service, line) {
  return createHash('sha256').update(`${service}:${line}`).digest('hex');
}

/**
 * @param {string[]} lines
 * @param {RegExp[]} patterns
 */
function findMatches(lines, patterns) {
  const matchedLines = [];
  for (const line of lines) {
    if (patterns.some((re) => re.test(line))) {
      matchedLines.push(line);
    }
  }
  return matchedLines;
}

/**
 * @param {{
 *   cfg: Record<string, unknown>,
 *   cache: LogWatchStateCache,
 *   alert: (text: string) => void | Promise<void>,
 *   logger?: { info?: Function, warn?: Function, error?: Function }
 * }} deps
 */
export async function runServiceLogWatchTick(deps) {
  const { cfg, cache, alert, logger } = deps;
  const settings = getLogWatchSettings(cfg);
  if (!settings.enabled) return;

  const services = cfg?.services && typeof cfg.services === 'object' ? cfg.services : {};
  for (const service of settings.includeServices) {
    if (!Object.prototype.hasOwnProperty.call(services, service)) {
      logger?.warn?.(`log_watch skipping unknown service "${service}"`);
      continue;
    }
    const serviceCfg = services[service];
    if (!serviceCfg || typeof serviceCfg !== 'object') continue;

    try {
      const adapter = resolveAdapter(service, serviceCfg);
      const res = await adapter.logs({ lines: settings.lines });
      if (!res.ok) {
        logger?.warn?.(`log_watch logs failed for ${service}: ${String(res.output || '').slice(0, 200)}`);
        continue;
      }

      const lines = String(res.output || '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const matchedLines = findMatches(lines, settings.patterns);
      if (!matchedLines.length) continue;

      const fps = matchedLines.map((line) => fingerprint(service, line));
      const now = Date.now();
      if (!cache.shouldAlert(service, fps, now, settings.cooldownSec)) continue;

      const preview = matchedLines.slice(0, MAX_ALERT_LINES).map((l) => `- ${l}`).join('\n');
      await alert(
        [
          `⚠️ LOG WATCH ${service}`,
          `Matched ${matchedLines.length} line(s) for 500-patterns in last ${settings.lines} lines.`,
          preview,
        ].join('\n'),
      );
    } catch (e) {
      logger?.error?.(`log_watch tick failed for ${service}`, e);
    }
  }
}
