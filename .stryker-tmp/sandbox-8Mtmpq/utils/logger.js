// @ts-nocheck
// utils/logger.js — Pino structured logger
// Replaces all console.log/error/warn calls with structured, queryable logs.
// Production: JSON lines → ship to Datadog/ELK/CloudWatch
// Development: pretty-printed via pino-pretty

import pino from 'pino';
import { config } from '../env.js';

const isDev = config.nodeEnv !== 'production';

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    base: { service: 'wolf-engine', version: '1.0.0' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['req.headers.authorization', 'body.authToken', 'body.AccountSid'],
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
          messageFormat: '{levelLabel} [{service}] {msg}',
        },
      })
    : undefined
);

// Child loggers per module — carry module name in every log line
export function childLogger(module) {
  return logger.child({ module });
}
