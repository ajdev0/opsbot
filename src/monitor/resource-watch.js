import os from 'os';

const CPU_MODES = new Set(['delta', 'loadavg']);

/**
 * In-memory state for resource threshold transitions.
 */
export class ResourceWatchStateCache {
  constructor() {
    /** @type {{ idle: number, total: number } | null} */
    this.lastCpuSnapshot = null;
    /** @type {Map<'cpu'|'ram', { level: 'normal'|'high', breachTicks: number, recoverTicks: number, lastAlertAtMs: number }>} */
    this.signals = new Map([
      ['cpu', { level: 'normal', breachTicks: 0, recoverTicks: 0, lastAlertAtMs: 0 }],
      ['ram', { level: 'normal', breachTicks: 0, recoverTicks: 0, lastAlertAtMs: 0 }],
    ]);
    /** @type {{ at: string, cpuPct: number | null, ramPct: number, cpuMode: 'delta'|'loadavg', cpuLevel: 'normal'|'high', ramLevel: 'normal'|'high' } | null} */
    this.lastSample = null;
  }
}

/**
 * @param {Record<string, unknown>} cfg
 */
export function getResourceWatchSettings(cfg) {
  const rw = cfg?.resource_watch && typeof cfg.resource_watch === 'object' ? cfg.resource_watch : {};
  const cpuMode = CPU_MODES.has(String(rw.cpu_mode || '')) ? String(rw.cpu_mode) : 'delta';
  return {
    enabled: Boolean(rw.enabled),
    intervalSec: Math.max(10, Number(rw.interval ?? 60)),
    cooldownSec: Math.max(0, Number(rw.cooldown_seconds ?? 600)),
    cpuMode: /** @type {'delta'|'loadavg'} */ (cpuMode),
    cpuThreshold: clampPercent(rw.cpu_threshold ?? 85),
    ramThreshold: clampPercent(rw.ram_threshold ?? 90),
    recoverCpuBelow: clampPercent(rw.recover_cpu_below ?? 75),
    recoverRamBelow: clampPercent(rw.recover_ram_below ?? 80),
    breachTicks: Math.max(1, Math.round(Number(rw.consecutive_breach_ticks ?? 2))),
    recoverTicks: Math.max(1, Math.round(Number(rw.consecutive_recover_ticks ?? 2))),
  };
}

/**
 * @returns {{ idle: number, total: number }}
 */
function readCpuSnapshot() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const c of cpus) {
    idle += c.times.idle;
    total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq + (c.times.steal || 0);
  }
  return { idle, total };
}

/**
 * @param {{ idle: number, total: number }} prev
 * @param {{ idle: number, total: number }} curr
 * @returns {number | null}
 */
function computeDeltaCpuPct(prev, curr) {
  const totalDelta = curr.total - prev.total;
  const idleDelta = curr.idle - prev.idle;
  if (totalDelta <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100)));
}

function readRamPct() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  return totalMem ? Math.round(((totalMem - freeMem) / totalMem) * 100) : 0;
}

/**
 * @param {ResourceWatchStateCache} cache
 * @param {'delta'|'loadavg'} cpuMode
 */
export function sampleResourceUsage(cache, cpuMode) {
  let cpuPct = null;
  if (cpuMode === 'delta') {
    const curr = readCpuSnapshot();
    if (cache.lastCpuSnapshot) {
      cpuPct = computeDeltaCpuPct(cache.lastCpuSnapshot, curr);
    }
    cache.lastCpuSnapshot = curr;
  } else {
    const cores = Math.max(1, os.cpus().length);
    const loadPct = (os.loadavg()[0] / cores) * 100;
    cpuPct = Math.max(0, Math.min(100, Math.round(loadPct)));
  }
  return {
    cpuPct,
    ramPct: readRamPct(),
  };
}

/**
 * @param {ResourceWatchStateCache} cache
 * @param {'cpu'|'ram'} signal
 * @param {number | null} value
 * @param {{ threshold: number, recoverBelow: number, breachTicks: number, recoverTicks: number, cooldownSec: number }} limits
 * @param {number} nowMs
 */
function evaluateSignal(cache, signal, value, limits, nowMs) {
  if (value == null) return null;
  const st = cache.signals.get(signal);
  if (!st) return null;

  if (st.level === 'normal') {
    if (value >= limits.threshold) {
      st.breachTicks += 1;
      st.recoverTicks = 0;
    } else {
      st.breachTicks = 0;
      st.recoverTicks = 0;
    }

    if (st.breachTicks >= limits.breachTicks && canAlert(st.lastAlertAtMs, nowMs, limits.cooldownSec)) {
      st.level = 'high';
      st.breachTicks = 0;
      st.recoverTicks = 0;
      st.lastAlertAtMs = nowMs;
      return { kind: 'HIGH', signal, value };
    }
    return null;
  }

  // st.level === 'high'
  if (value <= limits.recoverBelow) {
    st.recoverTicks += 1;
    st.breachTicks = 0;
  } else {
    st.recoverTicks = 0;
    st.breachTicks = 0;
  }

  if (st.recoverTicks >= limits.recoverTicks && canAlert(st.lastAlertAtMs, nowMs, limits.cooldownSec)) {
    st.level = 'normal';
    st.breachTicks = 0;
    st.recoverTicks = 0;
    st.lastAlertAtMs = nowMs;
    return { kind: 'RECOVERED', signal, value };
  }
  return null;
}

/**
 * @param {{
 *   cfg: Record<string, unknown>,
 *   cache: ResourceWatchStateCache,
 *   alert: (text: string) => void | Promise<void>,
 *   logger?: { info?: Function, warn?: Function, error?: Function }
 * }} deps
 */
export async function runResourceWatchTick(deps) {
  const { cfg, cache, alert, logger } = deps;
  const settings = getResourceWatchSettings(cfg);
  if (!settings.enabled) return;

  const nowMs = Date.now();
  const sample = sampleResourceUsage(cache, settings.cpuMode);

  const cpuEvent = evaluateSignal(
    cache,
    'cpu',
    sample.cpuPct,
    {
      threshold: settings.cpuThreshold,
      recoverBelow: settings.recoverCpuBelow,
      breachTicks: settings.breachTicks,
      recoverTicks: settings.recoverTicks,
      cooldownSec: settings.cooldownSec,
    },
    nowMs,
  );
  const ramEvent = evaluateSignal(
    cache,
    'ram',
    sample.ramPct,
    {
      threshold: settings.ramThreshold,
      recoverBelow: settings.recoverRamBelow,
      breachTicks: settings.breachTicks,
      recoverTicks: settings.recoverTicks,
      cooldownSec: settings.cooldownSec,
    },
    nowMs,
  );

  cache.lastSample = {
    at: new Date(nowMs).toISOString(),
    cpuPct: sample.cpuPct,
    ramPct: sample.ramPct,
    cpuMode: settings.cpuMode,
    cpuLevel: cache.signals.get('cpu')?.level || 'normal',
    ramLevel: cache.signals.get('ram')?.level || 'normal',
  };

  const events = [cpuEvent, ramEvent].filter(Boolean);
  for (const ev of events) {
    const modeSuffix = ev.signal === 'cpu' ? ` (${settings.cpuMode})` : '';
    if (ev.kind === 'HIGH') {
      await alert(
        `⚠️ RESOURCE WATCH ${ev.signal.toUpperCase()} HIGH${modeSuffix}\nValue: ${ev.value}% (threshold ${ev.signal === 'cpu' ? settings.cpuThreshold : settings.ramThreshold}%)`,
      );
    } else if (ev.kind === 'RECOVERED') {
      await alert(
        `✅ RESOURCE WATCH ${ev.signal.toUpperCase()} RECOVERED${modeSuffix}\nValue: ${ev.value}% (recover below ${ev.signal === 'cpu' ? settings.recoverCpuBelow : settings.recoverRamBelow}%)`,
      );
    }
  }

  if (events.length > 0) {
    logger?.info?.(`resource_watch events: ${events.map((e) => `${e.signal}:${e.kind}`).join(', ')}`);
  }
}

/**
 * @param {Record<string, unknown>} cfg
 * @returns {{
 *   settings: ReturnType<typeof getResourceWatchSettings>,
 *   sample: { cpuPct: number | null, ramPct: number }
 * }}
 */
export function snapshotResourceWatchStatus(cfg) {
  const settings = getResourceWatchSettings(cfg);
  const cache = new ResourceWatchStateCache();
  const sample = sampleResourceUsage(cache, settings.cpuMode);
  return { settings, sample };
}

function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function canAlert(lastAlertAtMs, nowMs, cooldownSec) {
  return nowMs - lastAlertAtMs >= Math.max(0, Number(cooldownSec || 0) * 1000);
}
