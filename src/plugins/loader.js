/**
 * Allowlisted plugin loaders only (no arbitrary paths from config).
 * Add entries like: `nginx: () => import('./builtin/nginx/index.js')`
 * @type {Record<string, () => Promise<unknown>>}
 */
export const PLUGIN_LOADERS = {};

/** @type {ReadonlySet<string>} */
export const REGISTERED_PLUGIN_IDS = new Set(Object.keys(PLUGIN_LOADERS));

/**
 * @param {unknown} cfg
 * @param {{ warn?: (s: string) => void, error?: (s: string) => void }} [log]
 * @returns {Promise<Array<{ id: string, plugin: import('./types.js').OpsBotPlugin }>>}
 */
export async function resolveEnabledPlugins(cfg, log = {}) {
  const raw = cfg && typeof cfg === 'object' ? /** @type {Record<string, unknown>} */ (cfg).plugins : undefined;
  const ids = Array.isArray(raw) ? raw : [];
  const out = [];

  for (const id of ids) {
    if (typeof id !== 'string' || !REGISTERED_PLUGIN_IDS.has(id)) {
      if (typeof id === 'string') {
        log.warn?.(`Unknown plugin id "${id}" (not in built-in registry), skipping`);
      }
      continue;
    }
    const load = PLUGIN_LOADERS[id];
    try {
      const mod = await load();
      const plugin = /** @type {{ default?: import('./types.js').OpsBotPlugin }} */ (mod).default;
      if (!plugin || typeof plugin !== 'object' || plugin.id !== id) {
        log.error?.(`Plugin "${id}": invalid export (expected default export with id "${id}")`);
        continue;
      }
      out.push({ id, plugin });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error?.(`Plugin "${id}" failed to load: ${msg}`);
    }
  }

  return out;
}

/**
 * @param {import('commander').Command} program
 * @param {Array<{ id: string, plugin: import('./types.js').OpsBotPlugin }>} resolved
 */
export function registerPluginCli(program, resolved) {
  for (const { plugin } of resolved) {
    if (typeof plugin.registerCli === 'function') {
      try {
        plugin.registerCli(program);
      } catch (e) {
        console.error(`Plugin "${plugin.id}" registerCli failed:`, e);
      }
    }
  }
}

/**
 * @param {Array<{ id: string, plugin: import('./types.js').OpsBotPlugin }>} resolved
 * @returns {Map<string, { pluginId: string, run: (ctx: import('./types.js').TelegramPluginContext) => void | Promise<void> }>}
 */
export function mergeTelegramCommands(resolved) {
  /** @type {Map<string, { pluginId: string, run: (ctx: import('./types.js').TelegramPluginContext) => void | Promise<void> }>} */
  const map = new Map();
  for (const { id: pluginId, plugin } of resolved) {
    const cmds = plugin.telegramCommands;
    if (!cmds || typeof cmds !== 'object') continue;
    for (const [name, fn] of Object.entries(cmds)) {
      if (typeof fn !== 'function' || !/^[a-z0-9_]+$/.test(name)) continue;
      if (map.has(name)) {
        continue;
      }
      map.set(name, { pluginId, run: fn });
    }
  }
  return map;
}
