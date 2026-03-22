import { Pm2Adapter } from './pm2.js';
import { DockerAdapter } from './docker/index.js';
import { DockerComposeAdapter } from './docker-compose/index.js';
import { SystemdAdapter } from './systemd/index.js';

/**
 * Map of config `type` string to adapter class.
 * @type {Record<string, new (serviceKey: string, serviceCfg: Record<string, unknown>) => import('./adapter.js').RuntimeAdapter>}
 */
export const RUNTIME_ADAPTER_MAP = {
  pm2: Pm2Adapter,
  docker: DockerAdapter,
  'docker-compose': DockerComposeAdapter,
  systemd: SystemdAdapter,
};

/** Single source of truth for supported service runtime types (schema + resolver). */
export function supportedRuntimeTypes() {
  return Object.keys(RUNTIME_ADAPTER_MAP);
}

export const RUNTIME_TYPES = new Set(supportedRuntimeTypes());
