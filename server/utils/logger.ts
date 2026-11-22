type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const SENSITIVE_KEYS = /authorization|api[_-]?key|token|secret|password/i;

function sanitizeContext(ctx?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!ctx) return undefined;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ctx)) {
    if (SENSITIVE_KEYS.test(key)) {
      clean[key] = '[REDACTED]';
    } else if (value instanceof Error) {
      clean[key] = { name: value.name, message: value.message };
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    service: 'crex-obs-studio',
    msg: message,
    ...(context ? { ctx: sanitizeContext(context) } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (msg: string, ctx?: Record<string, unknown>) => log('info', msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => log('warn', msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => log('error', msg, ctx),
  debug: (msg: string, ctx?: Record<string, unknown>) => {
    if (process.env.LOG_LEVEL === 'debug') {
      log('debug', msg, ctx);
    }
  },
};
