// @ts-nocheck
// src/infra/db/knex.js — Knex PostgreSQL connection with graceful fallback when DB unavailable.
import knex from 'knex';
import { config } from '../../core/config.js';
import { childLogger } from '../../core/logger.js';

const log = childLogger('database');

export let db = null;
export let dbAvailable = false;

if (config.db.host) {
  db = knex({
    client: 'pg',
    connection: {
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.name,
      ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
    },
    pool: {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
    },
    migrations: {
      directory: './migrations',
    },
  });

  db.raw('SELECT 1')
    .then(() => {
      dbAvailable = true;
      log.info({ host: config.db.host, db: config.db.name }, 'PostgreSQL connected');
    })
    .catch(err => {
      log.error({ err: err.message }, 'PostgreSQL connection failed — falling back to JSON store');
    });
} else {
  log.info('DB_HOST not set — using JSON file store');
}
