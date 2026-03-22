import { RUNTIME_ADAPTER_MAP } from './registry.js';

/**
 * @param {string} serviceKey
 * @param {Record<string, unknown>} serviceCfg
 */
export function resolveAdapter(serviceKey, serviceCfg) {
  const type = serviceCfg?.type;
  if (typeof type !== 'string' || !RUNTIME_ADAPTER_MAP[type]) {
    throw new Error(`Unknown runtime type: ${type}`);
  }
  const Ctor = RUNTIME_ADAPTER_MAP[type];
  return new Ctor(serviceKey, serviceCfg);
}

export { supportedRuntimeTypes } from './registry.js';
