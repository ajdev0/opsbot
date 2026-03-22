import axios from 'axios';
import { MonitorStateCache } from './state.js';

export { MonitorStateCache };

/**
 * @param {{
 *   name: string,
 *   url: string,
 *   timeout?: number,
 *   expected_status?: number
 * }} monitor
 * @returns {Promise<{ name: string, healthy: boolean, latencyMs: number, detail: string }>}
 */
export async function checkHttpMonitor(monitor) {
  const timeout = (monitor.timeout ?? 10) * 1000;
  const expected = monitor.expected_status ?? 200;
  const start = Date.now();
  try {
    const res = await axios.get(monitor.url, {
      timeout,
      validateStatus: () => true,
      maxRedirects: 5,
    });
    const latencyMs = Date.now() - start;
    const ok = res.status === expected;
    const detail = ok ? `HTTP ${res.status} in ${latencyMs}ms` : `HTTP ${res.status} (expected ${expected}) ${latencyMs}ms`;
    return { name: monitor.name, healthy: ok, latencyMs, detail };
  } catch (e) {
    const latencyMs = Date.now() - start;
    const msg = e.code === 'ECONNABORTED' ? `Timeout after ${monitor.timeout ?? 10}s` : e.message;
    return { name: monitor.name, healthy: false, latencyMs, detail: msg };
  }
}

/**
 * @param {Record<string, unknown>} m
 * @param {MonitorStateCache} cache
 * @param {(text: string) => void | Promise<void>} onAlert
 */
export async function runSingleMonitorCheck(m, cache, onAlert) {
  if (!m?.name || !m?.url) return;
  const result = await checkHttpMonitor({
    name: String(m.name),
    url: String(m.url),
    timeout: Number(m.timeout ?? 10),
    expected_status: m.expected_status != null ? Number(m.expected_status) : 200,
  });
  const transition = cache.update(result.name, result.healthy);
  if (transition.alert && transition.kind === 'DOWN') {
    await onAlert(`⚠️ ${result.name} DOWN\n${result.detail}`);
  } else if (transition.alert && transition.kind === 'RECOVERED') {
    await onAlert(`✅ ${result.name} RECOVERED\n${result.detail}`);
  }
}

/**
 * @param {Array<Record<string, unknown>>} monitors
 * @param {MonitorStateCache} cache
 * @param {(text: string) => void | Promise<void>} onAlert
 */
export async function runMonitorTick(monitors, cache, onAlert) {
  if (!Array.isArray(monitors)) return;
  for (const m of monitors) {
    await runSingleMonitorCheck(m, cache, onAlert);
  }
}
