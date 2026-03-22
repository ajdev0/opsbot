/**
 * Runtime adapter contract. Telegram and CLI dispatch through this interface only.
 */
export class RuntimeAdapter {
  /**
   * @param {string} serviceKey - config key
   * @param {Record<string, unknown>} serviceCfg
   */
  constructor(serviceKey, serviceCfg) {
    this.serviceKey = serviceKey;
    this.serviceCfg = serviceCfg;
  }

  /** @returns {Promise<{ ok: boolean, message: string }>} */
  async restart() {
    throw new Error('restart() not implemented');
  }

  /**
   * @param {{ lines?: number }} [opts]
   * @returns {Promise<{ ok: boolean, output: string }>}
   */
  async logs(opts = {}) {
    void opts;
    throw new Error('logs() not implemented');
  }

  /** @returns {Promise<{ ok: boolean, message: string }>} */
  async status() {
    throw new Error('status() not implemented');
  }

  /**
   * Deploy uses recipes from config only.
   * @param {{ runRecipe: (k: string, c: Record<string, unknown>) => Promise<{ ok: boolean, summary: string, steps: number }> }} runner
   */
  async deploy(runner) {
    return runner.runRecipe(this.serviceKey, this.serviceCfg);
  }
}
