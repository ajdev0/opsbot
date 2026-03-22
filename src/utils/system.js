import os from 'os';
import { runBinary } from './shell.js';

function cpuUsagePercent() {
  const cpus = os.cpus();
  if (!cpus.length) return 0;
  let idle = 0;
  let total = 0;
  for (const c of cpus) {
    idle += c.times.idle;
    total +=
      c.times.user +
      c.times.nice +
      c.times.sys +
      c.times.idle +
      c.times.irq +
      (c.times.steal || 0);
  }
  const busy = total - idle;
  return Math.min(100, Math.round((busy / total) * 100));
}

export async function getHostStatus() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const ramPct = totalMem ? Math.round(((totalMem - freeMem) / totalMem) * 100) : 0;

  let diskPct = null;
  let diskLine = 'n/a';
  try {
    const { stdout } = await runBinary('df', ['-P', '/']);
    const lines = stdout.trim().split('\n');
    if (lines[1]) {
      const parts = lines[1].split(/\s+/);
      const use = parts[parts.length - 2];
      if (use && use.endsWith('%')) {
        diskPct = parseInt(use, 10);
        diskLine = `${use} on /`;
      }
    }
  } catch {
    diskLine = 'unavailable';
  }

  let uptimeHuman = `${Math.floor(os.uptime() / 86400)}d`;
  try {
    const { stdout } = await runBinary('uptime', ['-p']);
    uptimeHuman = stdout.trim() || uptimeHuman;
  } catch {
    const s = os.uptime();
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    uptimeHuman = d > 0 ? `${d}d ${h}h` : `${h}h`;
  }

  const cpu = cpuUsagePercent();

  return {
    cpuPct: cpu,
    ramPct,
    diskPct,
    diskLine,
    uptimeHuman,
    loadavg: os.loadavg(),
  };
}

export function formatStatusSummary(s) {
  return [
    `CPU: ${s.cpuPct}%`,
    `RAM: ${s.ramPct}%`,
    `Disk: ${s.diskPct != null ? `${s.diskPct}%` : s.diskLine}`,
    `Uptime: ${s.uptimeHuman}`,
  ].join('\n');
}
