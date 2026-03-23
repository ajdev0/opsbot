import { RUNTIME_TYPES } from '../runtime/registry.js';
import { REGISTERED_PLUGIN_IDS } from '../plugins/loader.js';

/** Conservative unit name check (not full systemd grammar). */
function systemdUnitFieldError(fieldLabel, value) {
  if (typeof value !== 'string' || !value.trim()) {
    return `${fieldLabel} must be a non-empty string`;
  }
  const s = value.trim();
  if (s.startsWith('-')) {
    return `${fieldLabel} must not start with "-"`;
  }
  if (!/^[a-zA-Z0-9_.:@-]+$/.test(s)) {
    return `${fieldLabel} contains invalid characters (use typical unit names, e.g. nginx.service)`;
  }
  return null;
}

/**
 * @param {unknown} cfg
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateConfig(cfg) {
  const errors = [];

  if (!cfg || typeof cfg !== 'object') {
    return { ok: false, errors: ['Config must be an object'] };
  }

  const telegram = cfg.telegram;
  if (!telegram || typeof telegram !== 'object') {
    errors.push('telegram section is required');
  } else {
    if (!telegram.token || typeof telegram.token !== 'string' || !telegram.token.trim()) {
      errors.push('telegram.token is required');
    }
    if (!Array.isArray(telegram.allowed_chat_ids) || telegram.allowed_chat_ids.length === 0) {
      errors.push('telegram.allowed_chat_ids must be a non-empty array');
    } else {
      for (const id of telegram.allowed_chat_ids) {
        if (typeof id !== 'number' || !Number.isFinite(id)) {
          errors.push(`telegram.allowed_chat_ids must be numeric; got ${id}`);
        }
      }
    }
  }

  if (cfg.plugins !== undefined) {
    if (!Array.isArray(cfg.plugins)) {
      errors.push('plugins must be an array of plugin id strings');
    } else {
      cfg.plugins.forEach((id, i) => {
        if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)) {
          errors.push(`plugins[${i}] must be a non-empty plugin id (lowercase letters, digits, hyphen)`);
        } else if (!REGISTERED_PLUGIN_IDS.has(id)) {
          errors.push(`plugins[${i}] unknown or unavailable plugin: ${id}`);
        }
      });
    }
  }

  if (cfg.monitors !== undefined) {
    if (!Array.isArray(cfg.monitors)) {
      errors.push('monitors must be an array');
    } else {
      cfg.monitors.forEach((m, i) => {
        if (!m || typeof m !== 'object') {
          errors.push(`monitors[${i}] must be an object`);
          return;
        }
        if (!m.name || typeof m.name !== 'string') {
          errors.push(`monitors[${i}].name is required`);
        }
        if (!m.url || typeof m.url !== 'string') {
          errors.push(`monitors[${i}].url is required`);
        }
        if (m.interval !== undefined) {
          const n = Number(m.interval);
          if (!Number.isFinite(n) || n < 5) {
            errors.push(`monitors[${i}].interval must be a number >= 5`);
          }
        }
        if (m.timeout !== undefined) {
          const n = Number(m.timeout);
          if (!Number.isFinite(n) || n < 1) {
            errors.push(`monitors[${i}].timeout must be a number >= 1`);
          }
        }
        if (m.expected_status !== undefined) {
          const n = Number(m.expected_status);
          if (!Number.isFinite(n) || n < 100 || n > 599) {
            errors.push(`monitors[${i}].expected_status must be an HTTP status code`);
          }
        }
      });
    }
  }

  if (cfg.log_watch !== undefined) {
    const lw = cfg.log_watch;
    if (!lw || typeof lw !== 'object' || Array.isArray(lw)) {
      errors.push('log_watch must be an object');
    } else {
      if (lw.enabled !== undefined && typeof lw.enabled !== 'boolean') {
        errors.push('log_watch.enabled must be a boolean');
      }
      if (lw.interval !== undefined) {
        const n = Number(lw.interval);
        if (!Number.isFinite(n) || n < 300) {
          errors.push('log_watch.interval must be a number >= 300');
        }
      }
      if (lw.lines !== undefined) {
        const n = Number(lw.lines);
        if (!Number.isFinite(n) || n < 1 || n > 500) {
          errors.push('log_watch.lines must be a number between 1 and 500');
        }
      }
      if (lw.cooldown_seconds !== undefined) {
        const n = Number(lw.cooldown_seconds);
        if (!Number.isFinite(n) || n < 60) {
          errors.push('log_watch.cooldown_seconds must be a number >= 60');
        }
      }
      if (lw.patterns !== undefined) {
        if (!Array.isArray(lw.patterns) || lw.patterns.length === 0) {
          errors.push('log_watch.patterns must be a non-empty array of regex strings');
        } else {
          lw.patterns.forEach((p, i) => {
            if (typeof p !== 'string' || !p.trim()) {
              errors.push(`log_watch.patterns[${i}] must be a non-empty string`);
              return;
            }
            try {
              // Validate regex string early so runtime job cannot fail at startup.
              // eslint-disable-next-line no-new
              new RegExp(p, 'i');
            } catch (e) {
              errors.push(`log_watch.patterns[${i}] invalid regex: ${e.message}`);
            }
          });
        }
      }
      if (!Array.isArray(lw.include_services)) {
        errors.push('log_watch.include_services must be an array of service keys');
      } else {
        lw.include_services.forEach((s, i) => {
          if (typeof s !== 'string' || !s.trim()) {
            errors.push(`log_watch.include_services[${i}] must be a non-empty string`);
          } else if (!/^[a-zA-Z0-9_-]+$/.test(s)) {
            errors.push(`log_watch.include_services[${i}] has invalid characters`);
          }
        });
      }
    }
  }

  if (cfg.resource_watch !== undefined) {
    const rw = cfg.resource_watch;
    if (!rw || typeof rw !== 'object' || Array.isArray(rw)) {
      errors.push('resource_watch must be an object');
    } else {
      if (rw.enabled !== undefined && typeof rw.enabled !== 'boolean') {
        errors.push('resource_watch.enabled must be a boolean');
      }
      if (rw.interval !== undefined) {
        const n = Number(rw.interval);
        if (!Number.isFinite(n) || n < 10) {
          errors.push('resource_watch.interval must be a number >= 10');
        }
      }
      if (rw.cpu_mode !== undefined && rw.cpu_mode !== 'delta' && rw.cpu_mode !== 'loadavg') {
        errors.push('resource_watch.cpu_mode must be one of: delta, loadavg');
      }
      if (rw.cpu_threshold !== undefined) {
        const n = Number(rw.cpu_threshold);
        if (!Number.isFinite(n) || n < 1 || n > 100) {
          errors.push('resource_watch.cpu_threshold must be a number between 1 and 100');
        }
      }
      if (rw.ram_threshold !== undefined) {
        const n = Number(rw.ram_threshold);
        if (!Number.isFinite(n) || n < 1 || n > 100) {
          errors.push('resource_watch.ram_threshold must be a number between 1 and 100');
        }
      }
      if (rw.recover_cpu_below !== undefined) {
        const n = Number(rw.recover_cpu_below);
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          errors.push('resource_watch.recover_cpu_below must be a number between 0 and 100');
        }
      }
      if (rw.recover_ram_below !== undefined) {
        const n = Number(rw.recover_ram_below);
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          errors.push('resource_watch.recover_ram_below must be a number between 0 and 100');
        }
      }
      if (rw.cooldown_seconds !== undefined) {
        const n = Number(rw.cooldown_seconds);
        if (!Number.isFinite(n) || n < 0) {
          errors.push('resource_watch.cooldown_seconds must be a number >= 0');
        }
      }
      if (rw.consecutive_breach_ticks !== undefined) {
        const n = Number(rw.consecutive_breach_ticks);
        if (!Number.isInteger(n) || n < 1) {
          errors.push('resource_watch.consecutive_breach_ticks must be an integer >= 1');
        }
      }
      if (rw.consecutive_recover_ticks !== undefined) {
        const n = Number(rw.consecutive_recover_ticks);
        if (!Number.isInteger(n) || n < 1) {
          errors.push('resource_watch.consecutive_recover_ticks must be an integer >= 1');
        }
      }

      if (rw.cpu_threshold !== undefined && rw.recover_cpu_below !== undefined) {
        const th = Number(rw.cpu_threshold);
        const rec = Number(rw.recover_cpu_below);
        if (Number.isFinite(th) && Number.isFinite(rec) && rec >= th) {
          errors.push('resource_watch.recover_cpu_below must be lower than resource_watch.cpu_threshold');
        }
      }
      if (rw.ram_threshold !== undefined && rw.recover_ram_below !== undefined) {
        const th = Number(rw.ram_threshold);
        const rec = Number(rw.recover_ram_below);
        if (Number.isFinite(th) && Number.isFinite(rec) && rec >= th) {
          errors.push('resource_watch.recover_ram_below must be lower than resource_watch.ram_threshold');
        }
      }
    }
  }

  if (cfg.services !== undefined) {
    if (typeof cfg.services !== 'object' || Array.isArray(cfg.services)) {
      errors.push('services must be a map of name -> service config');
    } else {
      for (const [name, svc] of Object.entries(cfg.services)) {
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
          errors.push(`Invalid service key "${name}" (use alphanumeric, _, -)`);
        }
        if (!svc || typeof svc !== 'object') {
          errors.push(`services.${name} must be an object`);
          continue;
        }
        if (!svc.type || typeof svc.type !== 'string' || !RUNTIME_TYPES.has(svc.type)) {
          errors.push(`services.${name}.type must be one of: ${[...RUNTIME_TYPES].sort().join(', ')}`);
        }
        if (svc.path !== undefined && typeof svc.path !== 'string') {
          errors.push(`services.${name}.path must be a string`);
        }
        if (svc.deploy !== undefined) {
          if (!Array.isArray(svc.deploy)) {
            errors.push(`services.${name}.deploy must be an array of shell steps`);
          } else {
            svc.deploy.forEach((step, j) => {
              if (typeof step !== 'string' || !step.trim()) {
                errors.push(`services.${name}.deploy[${j}] must be a non-empty string`);
              }
            });
          }
        }
        if (svc.type === 'pm2') {
          const pm2 = svc.pm2_name || name;
          if (typeof pm2 !== 'string' || !pm2.trim()) {
            errors.push(`services.${name}.pm2_name (or key) must be a non-empty string`);
          }
        }
        if (svc.type === 'docker') {
          if (svc.container !== undefined && (typeof svc.container !== 'string' || !svc.container.trim())) {
            errors.push(`services.${name}.container must be a non-empty string when set`);
          }
          if (svc.docker_name !== undefined && (typeof svc.docker_name !== 'string' || !svc.docker_name.trim())) {
            errors.push(`services.${name}.docker_name must be a non-empty string when set`);
          }
        }
        if (svc.type === 'docker-compose') {
          if (typeof svc.path !== 'string' || !svc.path.trim()) {
            errors.push(`services.${name}.path is required for docker-compose (compose project directory)`);
          }
          if (svc.compose_file !== undefined && (typeof svc.compose_file !== 'string' || !svc.compose_file.trim())) {
            errors.push(`services.${name}.compose_file must be a non-empty string when set`);
          }
          if (svc.composeFile !== undefined && (typeof svc.composeFile !== 'string' || !String(svc.composeFile).trim())) {
            errors.push(`services.${name}.composeFile must be a non-empty string when set`);
          }
          if (svc.compose_service !== undefined && (typeof svc.compose_service !== 'string' || !svc.compose_service.trim())) {
            errors.push(`services.${name}.compose_service must be a non-empty string when set`);
          }
        }
        if (svc.type === 'systemd') {
          if (!svc.unit && !svc.unit_name) {
            errors.push(`services.${name} must set unit (or unit_name) for systemd type`);
          }
          if (svc.unit !== undefined) {
            const err = systemdUnitFieldError(`services.${name}.unit`, svc.unit);
            if (err) errors.push(err);
          }
          if (svc.unit_name !== undefined) {
            const err = systemdUnitFieldError(`services.${name}.unit_name`, svc.unit_name);
            if (err) errors.push(err);
          }
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
