/**
 * Minimal structured logger (zero-dependency). Levels gated by LOG_LEVEL.
 */
const LEVELS: Record<string, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function currentLevel(): number {
  return LEVELS[process.env.LOG_LEVEL ?? 'info'] ?? 20;
}

function log(level: string, msg: string, meta?: Record<string, unknown>): void {
  if (LEVELS[level] < currentLevel()) return;
  const line = {
    t: new Date().toISOString(),
    level,
    msg,
    ...(meta ?? {}),
  };
  const out = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  out.write(JSON.stringify(line) + '\n');
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),
};
