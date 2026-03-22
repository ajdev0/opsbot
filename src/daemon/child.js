import { startDaemon } from './index.js';

startDaemon().catch((err) => {
  console.error('[opsbot-daemon]', err);
  process.exit(1);
});
