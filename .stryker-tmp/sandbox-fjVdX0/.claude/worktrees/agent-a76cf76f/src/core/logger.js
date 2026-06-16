// @ts-nocheck
// src/core/logger.js — Pino structured logger with sensitive field redaction.
import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    base: { service: 'wolf-engine', version: '2.0.0' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'phone',
        '*.phone',
        'from',
        '*.from',
        'req.headers.authorization',
        'req.headers.cookie',
        'password',
        '*.password',
        'apiKey',
        '*.apiKey',
      ],
      censor: '[REDACTED]',
    },
  },
  isDev
    ? pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss',
          ignore: 'pid,hostname,service,version',
          messageFormat: '{levelLabel} [{module}] {msg}',
        },
      })
    : undefined
);

export function childLogger(module) {
  return logger.child({ module });
}
