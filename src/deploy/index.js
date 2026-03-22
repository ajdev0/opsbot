import { spawn } from 'child_process';
import { existsSync } from 'fs';

const DEFAULT_STEP_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Executes deploy recipes from config only (never Telegram-sourced strings).
 * Uses /bin/sh -c per step with cwd = service.path (required for deploy).
 */
export class DeployRunner {
  /**
   * @param {{ log?: (s: string) => void, stepTimeoutMs?: number }} [opts]
   */
  constructor(opts = {}) {
    this.log = opts.log || (() => {});
    this.stepTimeoutMs = opts.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
  }

  /**
   * @param {string} serviceKey
   * @param {Record<string, unknown>} serviceCfg
   * @returns {Promise<{ ok: boolean, summary: string, steps: number }>}
   */
  async runRecipe(serviceKey, serviceCfg) {
    const steps = Array.isArray(serviceCfg.deploy) ? serviceCfg.deploy : [];
    if (!steps.length) {
      return { ok: false, summary: `No deploy recipe for ${serviceKey}`, steps: 0 };
    }
    const cwd = typeof serviceCfg.path === 'string' ? serviceCfg.path : '';
    if (!cwd || !existsSync(cwd)) {
      return { ok: false, summary: `Invalid or missing path for ${serviceKey}`, steps: 0 };
    }

    let completed = 0;
    const summaries = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (typeof step !== 'string') {
        return { ok: false, summary: `Invalid deploy step ${i + 1}`, steps: completed };
      }
      this.log(`deploy ${serviceKey} step ${i + 1}/${steps.length}: ${step}`);
      const result = await runShStep(step, cwd, this.stepTimeoutMs);
      summaries.push(`[${i + 1}] ${result.ok ? 'ok' : 'fail'}: ${truncate(result.output, 400)}`);
      if (!result.ok) {
        return {
          ok: false,
          summary: `Failed at step ${i + 1}\n${summaries.join('\n')}`,
          steps: completed,
        };
      }
      completed += 1;
    }

    return {
      ok: true,
      summary: `Deploy success\n${completed} steps completed\n${summaries.join('\n')}`,
      steps: completed,
    };
  }
}

function truncate(s, n) {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/**
 * @param {string} command
 * @param {string} cwd
 * @param {number} timeoutMs
 */
function runShStep(command, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn('/bin/sh', ['-c', command], {
      cwd,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    const max = 2 * 1024 * 1024;
    let killedForTimeout = false;
    let finished = false;

    const timer = setTimeout(() => {
      killedForTimeout = true;
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }, 5000);
    }, timeoutMs);

    const finish = (ok, output) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ ok, output });
    };

    child.stdout?.on('data', (d) => {
      out += d.toString();
      if (out.length > max) out = out.slice(-max);
    });
    child.stderr?.on('data', (d) => {
      err += d.toString();
      if (err.length > max) err = err.slice(-max);
    });
    child.on('error', (e) => {
      finish(false, e.message);
    });
    child.on('close', (code) => {
      const combined = [out, err].filter(Boolean).join('\n') || `(exit ${code})`;
      if (killedForTimeout) {
        finish(false, `Timed out after ${timeoutMs}ms\n${combined}`);
      } else {
        finish(code === 0, combined);
      }
    });
  });
}
