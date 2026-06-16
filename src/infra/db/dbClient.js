// src/infra/db/dbClient.js — Knex + PostgreSQL connection pool.
// Falls back to null when DB_HOST is not configured (dev / test without Postgres).
// Call destroyDb() on graceful shutdown to drain the pool cleanly.
// Run migrations with: npm run db:migrate

<<<<<<< HEAD
import promClient from 'prom-client';
import { childLogger } from '../../core/logger.js';
import { config } from '../../core/config.js';
=======
import promClient     from 'prom-client';
import { childLogger } from '../../core/logger.js';
import { config }      from '../../core/config.js';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

const log = childLogger('database');

// ── DB metrics ────────────────────────────────────────────────────────────────

const dbPoolAcquired = new promClient.Gauge({
  name: 'wolf_db_pool_acquired',
  help: 'Number of active DB connections currently acquired from the pool',
});

const dbQueryDuration = new promClient.Histogram({
<<<<<<< HEAD
  name: 'wolf_db_query_duration_seconds',
  help: 'Database query execution time in seconds',
  labelNames: ['status'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
=======
  name:       'wolf_db_query_duration_seconds',
  help:       'Database query execution time in seconds',
  labelNames: ['status'],
  buckets:    [0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
});

// ── Knex instance ─────────────────────────────────────────────────────────────

/** Knex instance — null when running without PostgreSQL. */
<<<<<<< HEAD
export let db = null;
/** True once the DB connection has been verified with SELECT 1. */
export let dbAvailable = false;
/**
 * Number of unapplied migrations detected at startup.
 * Non-zero means the running code may not match the database schema.
 * The readiness probe uses this to return 503 until migrations are applied.
 */
export let pendingMigrationCount = 0;
=======
export let db          = null;
/** True once the DB connection has been verified with SELECT 1. */
export let dbAvailable = false;
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

if (config.DB_HOST) {
  // Dynamic import so the module loads even if knex isn't installed.
  const { default: knex } = await import('knex');

  db = knex({
    client: 'pg',
    connection: {
<<<<<<< HEAD
      host: config.DB_HOST,
      port: config.DB_PORT,
      user: config.DB_USER ?? 'postgres',
      password: config.DB_PASSWORD ?? '',
      database: config.DB_NAME ?? 'wolf_engine',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    },
    pool: {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 3_000, // fail fast — pipeline timeout is 10s, can't spend 10s on pool checkout
      idleTimeoutMillis: 30_000,
=======
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
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
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
<<<<<<< HEAD
    db.on('query', q => {
      q.__t = process.hrtime.bigint();
      dbPoolAcquired.inc();
    });
=======
    db.on('query',          (q)     => { q.__t = process.hrtime.bigint(); dbPoolAcquired.inc(); });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    db.on('query-response', (_r, q) => {
      const ms = Number(process.hrtime.bigint() - q.__t) / 1e6;
      dbPoolAcquired.dec();
      dbQueryDuration.observe({ status: 'success' }, ms / 1000);
      if (ms > 500) log.warn({ sql: q.sql?.slice(0, 200), ms }, 'Slow DB query');
    });
<<<<<<< HEAD
    db.on('query-error', (_e, q) => {
=======
    db.on('query-error',    (_e, q) => {
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
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
<<<<<<< HEAD

  // M7 FIX: Check for pending (unapplied) migrations at startup.
  // Without this, a deploy that skips migrations runs against a mismatched schema —
  // producing silent column errors rather than a clear startup failure.
  // This does NOT auto-run migrations (that is a deployment pipeline responsibility).
  // It logs an error and sets a flag so the readiness probe can surface it.
  if (dbAvailable) {
    try {
      const [_completedBatch, pendingMigrations] = await db.migrate.list();
      if (pendingMigrations.length > 0) {
        const names = pendingMigrations.map(m => m.name ?? m.file ?? String(m));
        log.error(
          { pending: names },
          `[STARTUP] ${pendingMigrations.length} database migration(s) are pending. ` +
            'Run "npm run db:migrate" before starting the server. ' +
            'Operating with a mismatched schema will cause runtime errors.'
        );
        // Export the count so the readiness probe can degrade the pod.
        pendingMigrationCount = pendingMigrations.length;
      } else {
        log.info('Database schema is up to date — no pending migrations');
      }
    } catch (err) {
      log.warn(
        { err: err.message },
        'Could not check migration status — knex_migrations table may not exist yet'
      );
    }
  }
=======
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
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
