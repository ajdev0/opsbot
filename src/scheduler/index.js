/**
 * Named interval jobs. Clear separation from daemon timing logic.
 */
export class Scheduler {
  /**
   * @param {{ logger?: { error: (...args: unknown[]) => void } }} [opts]
   */
  constructor(opts = {}) {
    /** @type {Map<string, ReturnType<typeof setInterval>>} */
    this.jobs = new Map();
    this.logger = opts.logger;
  }

  /**
   * @param {string} name
   * @param {number} intervalMs
   * @param {() => void | Promise<void>} fn
   */
  schedule(name, intervalMs, fn) {
    this.cancel(name);
    const id = setInterval(() => {
      Promise.resolve(fn()).catch((e) => {
        if (this.logger?.error) {
          this.logger.error(`[scheduler:${name}]`, e);
        } else {
          console.error(`[scheduler:${name}]`, e);
        }
      });
    }, intervalMs);
    this.jobs.set(name, id);
  }

  /** @param {string} name */
  cancel(name) {
    const id = this.jobs.get(name);
    if (id) {
      clearInterval(id);
      this.jobs.delete(name);
    }
  }

  stopAll() {
    for (const name of [...this.jobs.keys()]) {
      this.cancel(name);
    }
  }
}
