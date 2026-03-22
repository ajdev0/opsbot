/**
 * In-memory monitor state. Alerts only on transitions.
 * @typedef {'UP' | 'DOWN'} HealthState
 */

export class MonitorStateCache {
  constructor() {
    /** @type {Map<string, HealthState | null>} */
    this.previous = new Map();
  }

  /**
   * @param {string} name
   * @param {boolean} healthy
   * @returns {{ alert: boolean, kind?: 'DOWN' | 'RECOVERED', previous: HealthState | null }}
   */
  update(name, healthy) {
    const prev = this.previous.has(name) ? this.previous.get(name) : null;
    const next = healthy ? 'UP' : 'DOWN';
    this.previous.set(name, next);

    if (prev === null) {
      return { alert: !healthy, kind: healthy ? undefined : 'DOWN', previous: prev };
    }
    if (prev === 'UP' && next === 'DOWN') {
      return { alert: true, kind: 'DOWN', previous: prev };
    }
    if (prev === 'DOWN' && next === 'UP') {
      return { alert: true, kind: 'RECOVERED', previous: prev };
    }
    return { alert: false, previous: prev };
  }
}
