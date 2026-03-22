import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';

const OPSBOT_DIR_NAME = '.opsbot';

export function opsbotDir() {
  const fromEnv = typeof process.env.OPSBOT_HOME === 'string' ? process.env.OPSBOT_HOME.trim() : '';
  if (fromEnv) return fromEnv;
  return join(homedir(), OPSBOT_DIR_NAME);
}

export function configPath() {
  return join(opsbotDir(), 'config.yaml');
}

export function pidPath() {
  return join(opsbotDir(), 'daemon.pid');
}

export function daemonLogPath() {
  return join(opsbotDir(), 'daemon.log');
}

export function ensureOpsbotDir() {
  const dir = opsbotDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}
