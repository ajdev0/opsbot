import { RuntimeAdapter } from '../adapter.js';
import { runBinary } from '../../utils/shell.js';

/**
 * Docker Compose runtime adapter. Project-scoped: all compose commands use cwd = service path.
 * Separate from DockerAdapter (single container name, no compose project semantics).
 */
export class DockerComposeAdapter extends RuntimeAdapter {
  cwd() {
    const p = this.serviceCfg.path;
    if (typeof p !== 'string' || !p) {
      throw new Error(`docker-compose service ${this.serviceKey} requires path (compose project directory)`);
    }
    return p;
  }

  /** @returns {string[]} optional -f flags after `compose` */
  composeFileArgs() {
    const args = [];
    const file = this.serviceCfg.compose_file || this.serviceCfg.composeFile;
    if (file) {
      args.push('-f', String(file));
    }
    return args;
  }

  /** @param {...string} tail tokens after `docker compose` + file args */
  dockerComposeArgv(...tail) {
    return ['compose', ...this.composeFileArgs(), ...tail];
  }

  serviceName() {
    return this.serviceCfg.compose_service ? String(this.serviceCfg.compose_service) : null;
  }

  composeRunOpts() {
    return { cwd: this.cwd() };
  }

  async restart() {
    try {
      const svc = this.serviceName();
      const argv = this.dockerComposeArgv('restart', ...(svc ? [svc] : []));
      const { stdout, stderr } = await runBinary('docker', argv, this.composeRunOpts());
      const msg = (stdout || stderr || '').trim() || 'compose restart completed';
      return { ok: true, message: msg };
    } catch (e) {
      return { ok: false, message: e.stderr?.toString?.() || e.message || String(e) };
    }
  }

  async logs(opts = {}) {
    const lines = opts.lines ?? 50;
    try {
      const svc = this.serviceName();
      const argv = this.dockerComposeArgv(
        'logs',
        '--no-color',
        '--tail',
        String(lines),
        ...(svc ? [svc] : []),
      );
      const { stdout, stderr } = await runBinary('docker', argv, this.composeRunOpts());
      const output = (stdout || stderr || '').trim();
      return { ok: true, output: output || '(no output)' };
    } catch (e) {
      const out = e.stdout?.toString?.() || e.stderr?.toString?.() || e.message;
      return { ok: false, output: out || String(e) };
    }
  }

  async status() {
    try {
      const { stdout } = await runBinary(
        'docker',
        this.dockerComposeArgv('ps', '--format', 'json'),
        this.composeRunOpts(),
      );
      const svc = this.serviceName();
      const cwd = this.cwd();
      if (!svc) {
        return { ok: true, message: `Compose project at ${cwd}:\n${truncate(stdout, 800)}` };
      }
      const lines = stdout.trim().split('\n').filter(Boolean);
      const found = lines.map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      });
      const row = found.find((r) => r && (r.Service === svc || r.Name?.includes(svc)));
      if (!row) {
        return { ok: true, message: `Compose service "${svc}" not found in ps output` };
      }
      return { ok: true, message: `Compose ${svc}: ${row.State || row.Status || JSON.stringify(row)}` };
    } catch (e) {
      return { ok: false, message: e.stderr?.toString?.() || e.message || String(e) };
    }
  }

  /**
   * @param {{ runRecipe: (k: string, c: Record<string, unknown>) => Promise<{ ok: boolean, summary: string, steps: number }> }} runner
   */
  async deploy(runner) {
    const steps = Array.isArray(this.serviceCfg.deploy) ? this.serviceCfg.deploy : [];
    if (steps.length > 0) {
      return runner.runRecipe(this.serviceKey, this.serviceCfg);
    }
    try {
      const svc = this.serviceName();
      const argv = this.dockerComposeArgv('up', '-d', ...(svc ? [svc] : []));
      const { stdout, stderr } = await runBinary('docker', argv, this.composeRunOpts());
      const msg = (stdout || stderr || '').trim() || 'compose up -d completed';
      return { ok: true, summary: msg, steps: 0 };
    } catch (e) {
      return {
        ok: false,
        summary: e.stderr?.toString?.() || e.message || String(e),
        steps: 0,
      };
    }
  }
}

function truncate(s, n) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
