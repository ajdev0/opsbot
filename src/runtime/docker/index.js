import { RuntimeAdapter } from '../adapter.js';
import { runBinary } from '../../utils/shell.js';

/**
 * Docker runtime adapter. Uses argv arrays only (no shell).
 *
 * status(): prefers `docker ps -a` (name filter is substring match in Docker — we then
 * narrow to exact container name when possible). If no matching row, falls back to
 * `docker inspect` for stopped/edge cases.
 */
export class DockerAdapter extends RuntimeAdapter {
  containerName() {
    return String(this.serviceCfg.container || this.serviceCfg.docker_name || this.serviceKey);
  }

  async restart() {
    try {
      const { stdout, stderr } = await runBinary('docker', ['restart', this.containerName()]);
      const msg = (stdout || stderr || '').trim() || 'docker restart completed';
      return { ok: true, message: msg };
    } catch (e) {
      return { ok: false, message: e.stderr?.toString?.() || e.message || String(e) };
    }
  }

  async logs(opts = {}) {
    const lines = opts.lines ?? 50;
    try {
      const { stdout, stderr } = await runBinary('docker', [
        'logs',
        '--tail',
        String(lines),
        this.containerName(),
      ]);
      const output = (stdout || stderr || '').trim();
      return { ok: true, output: output || '(no output)' };
    } catch (e) {
      const out = e.stdout?.toString?.() || e.stderr?.toString?.() || e.message;
      return { ok: false, output: out || String(e) };
    }
  }

  async status() {
    const name = this.containerName();
    try {
      const { stdout } = await runBinary('docker', [
        'ps',
        '-a',
        '--filter',
        `name=${name}`,
        '--format',
        '{{.Names}}\t{{.Status}}',
      ]);
      const rows = stdout
        .trim()
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const target = normalizeContainerName(name);
      const exact = rows.filter((line) => rowMatchesName(line, target));

      if (exact.length === 1) {
        const statusPart = exact[0].includes('\t') ? exact[0].split('\t').slice(1).join('\t').trim() : exact[0];
        return { ok: true, message: `Docker ${name}: ${statusPart || '(unknown status)'}` };
      }
      if (exact.length > 1) {
        return {
          ok: true,
          message: `Docker ${name}: multiple exact name matches (${exact.length}); ${exact[0]}`,
        };
      }
      return await statusViaInspect(name);
    } catch (e) {
      const msg = e.stderr?.toString?.() || e.message || String(e);
      const viaInspect = await statusViaInspect(name);
      if (viaInspect.ok) return viaInspect;
      return { ok: false, message: msg };
    }
  }
}

function normalizeContainerName(s) {
  return String(s || '').replace(/^\//, '').trim();
}

/** @param {string} line ps --format "Names\\tStatus" */
function rowMatchesName(line, target) {
  const tab = line.indexOf('\t');
  const namesCol = tab >= 0 ? line.slice(0, tab) : line;
  const parts = namesCol.split(',').map((p) => normalizeContainerName(p));
  return parts.some((p) => p === target);
}

async function statusViaInspect(name) {
  try {
    const { stdout } = await runBinary('docker', ['inspect', '-f', '{{.State.Status}}', name]);
    return { ok: true, message: `Docker ${name}: ${stdout.trim()}` };
  } catch (e) {
    return { ok: false, message: e.stderr?.toString?.() || e.message || String(e) };
  }
}
