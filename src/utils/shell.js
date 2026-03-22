import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Run a fixed binary with argument array only. No user-controlled command strings.
 * @param {string} file - absolute path or binary on PATH
 * @param {string[]} args
 * @param {{ cwd?: string, timeout?: number, maxBuffer?: number }} [opts]
 */
export async function runBinary(file, args, opts = {}) {
  const { cwd, timeout = 120_000, maxBuffer = 10 * 1024 * 1024 } = opts;
  return execFileAsync(file, args, {
    cwd,
    timeout,
    maxBuffer,
    encoding: 'utf8',
    env: { ...process.env },
  });
}
