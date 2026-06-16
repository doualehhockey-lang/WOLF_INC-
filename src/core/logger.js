// src/core/logger.js — Pino structured logger with sensitive data redaction.
// Production: JSON lines → ship to Datadog/ELK/CloudWatch.
// Development: pretty-printed via pino-pretty.
// Never log phone numbers, tokens, passwords, or API keys.

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? 'info',
    base: { service: 'wolf-engine', version: '2.0.0' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        // Phone numbers (GDPR)
<<<<<<< HEAD
        'phone',
        '*.phone',
        'from',
        '*.from',
        'From',
        '*.From',
        // Auth tokens
        'req.headers.authorization',
        'req.headers.cookie',
        'body.apiKey',
        '*.apiKey',
        'accessToken',
        '*.accessToken',
        // Credentials
        'password',
        '*.password',
        'authToken',
        '*.authToken',
=======
        'phone', '*.phone', 'from', '*.from', 'From', '*.From',
        // Auth tokens
        'req.headers.authorization',
        'req.headers.cookie',
        'body.apiKey', '*.apiKey',
        'accessToken', '*.accessToken',
        // Credentials
        'password', '*.password',
        'authToken', '*.authToken',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
        'body.AccountSid',
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
          messageFormat: '{levelLabel} [{service}] {msg}',
        },
      })
    : undefined
);

// Creates a child logger bound to a specific module name.
// Every log line from that module will include { module: 'name' }.
export function childLogger(module) {
  return logger.child({ module });
}
