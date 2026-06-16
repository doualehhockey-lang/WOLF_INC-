// @ts-nocheck
// src/infra/db/dbClient.js — Knex + PostgreSQL connection pool.
// Falls back to null when DB_HOST is not configured (dev / test without Postgres).
// Call destroyDb() on graceful shutdown to drain the pool cleanly.
// Run migrations with: npm run db:migrate

import promClient     from 'prom-client';
import { childLogger } from '../../core/logger.js';
import { config }      from '../../core/config.js';

const log = childLogger('database');

// ── DB metrics ────────────────────────────────────────────────────────────────

const dbPoolAcquired = new promClient.Gauge({
  name: 'wolf_db_pool_acquired',
  help: 'Number of active DB connections currently acquired from the pool',
});

const dbQueryDuration = new promClient.Histogram({
  name:       'wolf_db_query_duration_seconds',
  help:       'Database query execution time in seconds',
  labelNames: ['status'],
  buckets:    [0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

// ── Knex instance ─────────────────────────────────────────────────────────────

/** Knex instance — null when running without PostgreSQL. */
export let db          = null;
/** True once the DB connection has been verified with SELECT 1. */
export let dbAvailable = false;

if (config.DB_HOST) {
  // Dynamic import so the module loads even if knex isn't installed.
  const { default: knex } = await import('knex');

  db = knex({
    client: 'pg',
    connection: {
      host:     config.DB_HOST,
      port:     config.DB_PORT,
      user:     config.DB_USER     ?? 'postgres',
      password: config.DB_PASSWORD ?? '',
      database: config.DB_NAME     ?? 'wolf_engine',
      ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    },
    pool: {
      min:                  2,
      max:                  10,
      acquireTimeoutMillis: 10_000,
      idleTimeoutMillis:    30_000,
      // Knex/pg-pool: test connection before checkout
      afterCreate: (conn, done) => {
        conn.query('SELECT 1', err => done(err, conn));
      },
    },
    migrations: {
      directory: './migrations',
      extension: 'js',
    },
  });

  // ── Query instrumentation (guarded: mock instances may not have .on) ────────
  if (typeof db.on === 'function') {
    db.on('query',          (q)     => { q.__t = process.hrtime.bigint(); dbPoolAcquired.inc(); });
    db.on('query-response', (_r, q) => {
      const ms = Number(process.hrtime.bigint() - q.__t) / 1e6;
      dbPoolAcquired.dec();
      dbQueryDuration.observe({ status: 'success' }, ms / 1000);
      if (ms > 500) log.warn({ sql: q.sql?.slice(0, 200), ms }, 'Slow DB query');
    });
    db.on('query-error',    (_e, q) => {
      dbPoolAcquired.dec();
      if (q.__t) {
        const ms = Number(process.hrtime.bigint() - q.__t) / 1e6;
        dbQueryDuration.observe({ status: 'error' }, ms / 1000);
      }
    });
  }

  // Verify connection eagerly — logs clearly if misconfigured.
  try {
    await db.raw('SELECT 1');
    dbAvailable = true;
    log.info({ host: config.DB_HOST, db: config.DB_NAME ?? 'wolf_engine' }, 'PostgreSQL connected');
  } catch (err) {
    log.error({ err: err.message }, 'PostgreSQL connection failed — falling back to JSON store');
    // Do NOT null-out db here: callers can still attempt queries, they will fail with
    // a clear error rather than a null-dereference.
  }
} else {
  log.info('DB_HOST not set — running without PostgreSQL (JSON file store active)');
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

/** Drain the connection pool. Call on SIGTERM before process.exit(). */
export async function destroyDb() {
  if (db) {
    await db.destroy();
    log.info('PostgreSQL pool destroyed');
  }
}
