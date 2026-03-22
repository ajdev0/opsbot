import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function ts() {
  return new Date().toISOString();
}

export function createLogger({ level = 'info', file } = {}) {
  const min = LEVELS[level] ?? LEVELS.info;

  function write(levelName, args) {
    const line = `[${ts()}] [${levelName.toUpperCase()}] ${args.map(String).join(' ')}\n`;
    if (LEVELS[levelName] >= min) {
      if (levelName === 'error') console.error(line.trimEnd());
      else console.log(line.trimEnd());
    }
    if (file) {
      try {
        const dir = dirname(file);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        appendFileSync(file, line);
      } catch {
        /* ignore log file errors */
      }
    }
  }

  return {
    debug: (...a) => write('debug', a),
    info: (...a) => write('info', a),
    warn: (...a) => write('warn', a),
    error: (...a) => write('error', a),
  };
}
