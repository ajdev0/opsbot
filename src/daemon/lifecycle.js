import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { pidPath, ensureOpsbotDir } from '../config/paths.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function readDaemonPid() {
  const p = pidPath();
  if (!existsSync(p)) return null;
  const n = parseInt(readFileSync(p, 'utf8').trim(), 10);
  return Number.isFinite(n) ? n : null;
}

export function isDaemonRunning() {
  const pid = readDaemonPid();
  if (pid == null) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function startDaemonProcess() {
  if (isDaemonRunning()) {
    throw new Error(`Daemon already running (pid ${readDaemonPid()})`);
  }
  ensureOpsbotDir();
  const childPath = join(__dirname, 'child.js');
  const child = fork(childPath, [], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, OPSBOT_DAEMON: '1' },
  });
  child.unref();
  writeFileSync(pidPath(), String(child.pid), { mode: 0o644 });
  return child.pid;
}

export async function stopDaemonProcess() {
  const pid = readDaemonPid();
  if (pid == null) {
    throw new Error('Daemon does not appear to be running (no pid file)');
  }
  try {
    process.kill(pid, 0);
  } catch {
    if (existsSync(pidPath())) unlinkSync(pidPath());
    throw new Error('Stale pid file removed. Daemon was not running.');
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch (e) {
    if (e && e.code === 'ESRCH') {
      if (existsSync(pidPath())) unlinkSync(pidPath());
      throw new Error('Daemon process not found (stale pid file removed)');
    }
    throw e;
  }

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      process.kill(pid, 0);
    } catch {
      if (existsSync(pidPath())) unlinkSync(pidPath());
      return;
    }
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    /* ignore */
  }
  if (existsSync(pidPath())) unlinkSync(pidPath());
}
