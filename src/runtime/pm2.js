import { RuntimeAdapter } from './adapter.js';
import { runBinary } from '../utils/shell.js';

export class Pm2Adapter extends RuntimeAdapter {
  pm2Name() {
    const n = this.serviceCfg.pm2_name || this.serviceKey;
    return String(n);
  }

  async restart() {
    try {
      const { stdout, stderr } = await runBinary('pm2', ['restart', this.pm2Name()]);
      const msg = (stdout || stderr || '').trim() || 'pm2 restart completed';
      return { ok: true, message: msg };
    } catch (e) {
      return { ok: false, message: e.stderr?.toString?.() || e.message || String(e) };
    }
  }

  async logs(opts = {}) {
    const lines = opts.lines ?? 50;
    try {
      const { stdout, stderr } = await runBinary('pm2', [
        'logs',
        this.pm2Name(),
        '--lines',
        String(lines),
        '--nostream',
      ]);
      const output = (stdout || stderr || '').trim();
      return { ok: true, output: output || '(no output)' };
    } catch (e) {
      const out = e.stdout?.toString?.() || e.stderr?.toString?.() || e.message;
      return { ok: false, output: out || String(e) };
    }
  }

  async status() {
    try {
      const { stdout } = await runBinary('pm2', ['jlist']);
      const list = JSON.parse(stdout || '[]');
      const name = this.pm2Name();
      const proc = list.find((p) => p.name === name || p.pm2_env?.name === name);
      if (!proc) {
        return { ok: true, message: `PM2 process "${name}" not found in jlist` };
      }
      const st = proc.pm2_env?.status || proc.status || 'unknown';
      return { ok: true, message: `PM2 ${name}: ${st}` };
    } catch (e) {
      return { ok: false, message: e.message || String(e) };
    }
  }
}
