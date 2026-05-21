// @ts-nocheck
// config/database.js — Knex + PostgreSQL connection pool
//
// SETUP (one-time):
//   1. Install PostgreSQL: https://www.postgresql.org/download/windows/
//   2. Create database:  createdb wolf_engine
//   3. Set env vars in .env:
//        DB_HOST=localhost
//        DB_PORT=5432
//        DB_USER=postgres
//        DB_PASSWORD=yourpassword
//        DB_NAME=wolf_engine
//   4. Run migrations: npm run db:migrate
//
// The app falls back to the JSON file store if DB_HOST is not set,
// so you can run without PostgreSQL during development.

import knex from 'knex';
import { childLogger } from '../utils/logger.js';

const log = childLogger('database');

const DB_HOST = process.env.DB_HOST;

// If DB_HOST is not configured, export a null db so callers can check
export let db = null;
export let dbAvailable = false;

if (DB_HOST) {
  db = knex({
    client: 'pg',
    connection: {
      host: DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'wolf_engine',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
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

  // Verify connection on startup
  db.raw('SELECT 1')
    .then(() => {
      dbAvailable = true;
      log.info({ host: DB_HOST, db: process.env.DB_NAME || 'wolf_engine' }, 'PostgreSQL connected');
    })
    .catch(err => {
      log.error({ err: err.message }, 'PostgreSQL connection failed — falling back to JSON store');
    });
} else {
  log.info('DB_HOST not set — using JSON file store (set DB_HOST to enable PostgreSQL)');
}
