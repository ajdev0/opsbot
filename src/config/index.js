import { readFileSync, writeFileSync, existsSync } from 'fs';
import yaml from 'js-yaml';
import { ensureOpsbotDir, configPath } from './paths.js';
import { validateConfig } from './schema.js';

/** @returns {Record<string, unknown>} */
export function defaultConfig() {
  return {
    telegram: {
      token: '',
      allowed_chat_ids: [],
    },
    monitors: [],
    log_watch: {
      enabled: false,
      interval: 3600,
      lines: 100,
      patterns: ['\\b500\\b', 'status=500', 'HTTP\\s+500', '" 500 '],
      cooldown_seconds: 3600,
      include_services: [],
    },
    services: {},
    plugins: [],
  };
}

/**
 * @param {{ required?: boolean }} [opts]
 */
export function loadConfig(opts = {}) {
  const { required = true } = opts;
  const path = configPath();
  if (!existsSync(path)) {
    if (required) {
      throw new Error(`Config not found. Run: opsbot init (${path})`);
    }
    return null;
  }
  const raw = readFileSync(path, 'utf8');
  let data;
  try {
    data = yaml.load(raw);
  } catch (e) {
    throw new Error(`Invalid YAML in ${path}: ${e.message}`);
  }
  if (data === null || data === undefined) {
    data = defaultConfig();
  }
  const merged = { ...defaultConfig(), ...data };
  if (data.telegram) merged.telegram = { ...defaultConfig().telegram, ...data.telegram };
  if (data.log_watch) merged.log_watch = { ...defaultConfig().log_watch, ...data.log_watch };
  if (data.services) merged.services = { ...data.services };
  if (data.monitors) merged.monitors = [...data.monitors];
  if (data.plugins) merged.plugins = [...data.plugins];

  const v = validateConfig(merged);
  if (!v.ok) {
    throw new Error(`Invalid config:\n${v.errors.join('\n')}`);
  }
  return merged;
}

/** @param {Record<string, unknown>} cfg */
export function saveConfig(cfg) {
  const v = validateConfig(cfg);
  if (!v.ok) {
    throw new Error(`Invalid config:\n${v.errors.join('\n')}`);
  }
  ensureOpsbotDir();
  const path = configPath();
  const doc = yaml.dump(cfg, { lineWidth: 120, noRefs: true });
  writeFileSync(path, doc, { mode: 0o600 });
}
