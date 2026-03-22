import { RuntimeAdapter } from '../adapter.js';
import { runBinary } from '../../utils/shell.js';

/** Match Telegram `/logs` cap; clamp all journalctl -n requests. */
const JOURNAL_MAX_LINES = 500;

/** Keep `systemctl status` responses bounded for future CLI/Telegram use. */
const STATUS_OUTPUT_MAX = 4000;

/**
 * systemd runtime adapter: system `systemctl` / `journalctl` only (no `--user`), argv-only.
 */
export class SystemdAdapter extends RuntimeAdapter {
  unit() {
    const u = this.serviceCfg.unit || this.serviceCfg.unit_name;
    if (!u) throw new Error(`systemd service ${this.serviceKey} requires unit`);
    return String(u);
  }

  /** @param {number | undefined} lines */
  clampJournalLines(lines) {
    const n = Number(lines);
    const raw = Number.isFinite(n) ? Math.floor(n) : 50;
    return Math.min(JOURNAL_MAX_LINES, Math.max(1, raw));
  }

  async restart() {
    try {
      const { stdout, stderr } = await runBinary('systemctl', ['restart', this.unit()]);
      const msg = (stdout || stderr || '').trim() || 'systemctl restart completed';
      return { ok: true, message: msg };
    } catch (e) {
      return { ok: false, message: e.stderr?.toString?.() || e.message || String(e) };
    }
  }

  async logs(opts = {}) {
    const lines = this.clampJournalLines(opts.lines);
    try {
      const { stdout, stderr } = await runBinary(
        'journalctl',
        ['-u', this.unit(), '-n', String(lines), '--no-pager'],
        { timeout: 60_000 },
      );
      const output = (stdout || stderr || '').trim();
      return { ok: true, output: output || '(no output)' };
    } catch (e) {
      const out = e.stdout?.toString?.() || e.stderr?.toString?.() || e.message;
      return { ok: false, output: out || String(e) };
    }
  }

  async status() {
    try {
      const { stdout, stderr } = await runBinary(
        'systemctl',
        ['status', this.unit(), '--no-pager'],
        { timeout: 60_000, maxBuffer: 2 * 1024 * 1024 },
      );
      const combined = (stdout || stderr || '').trim();
      const text = combined || '(no output)';
      const message = `systemd ${this.unit()}:\n${truncate(text, STATUS_OUTPUT_MAX)}`;
      return { ok: true, message };
    } catch (e) {
      return { ok: false, message: e.stderr?.toString?.() || e.message || String(e) };
    }
  }
}

function truncate(s, n) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
