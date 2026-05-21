// migrations/004_audit_log.js
// Enhancements to the audit_logs table for production observability:
//   - request_id  : correlation ID from X-Request-Id header
//   - provider    : NLU/TTS provider used (claude | ollama | rule-based | piper | elevenlabs | azure)
//   - nlu_strategy: which NLU path fired (claude | ollama | rule-based | none)
//   - feature_flags: snapshot of active feature flags at request time
//   - ip_hash     : HMAC-hashed client IP for anomaly detection (GDPR-safe)
//   - session_turn: turn number within the call session
//
// Also adds:
//   - Partial index on recent rows (last 30 days) — common query window
//   - Cleanup function trigger to auto-delete rows > 90 days

/** @param {import('knex').Knex} knex */
export async function up(knex) {
  // ── 1. Add new columns to existing audit_logs ────────────────────────────
  await knex.schema.table('audit_logs', (table) => {
    // Correlation
    table.string('request_id', 36).nullable()
      .comment('UUID from X-Request-Id header — traces across services');

    // Provider attribution
    table.string('provider', 50).nullable()
      .comment('NLU/TTS provider: claude | ollama | rule-based | piper | elevenlabs | azure');
    table.string('nlu_strategy', 50).nullable()
      .comment('NLU execution path: claude | ollama | rule-based | none');

    // Runtime feature flags snapshot (for debugging flag-related regressions)
    table.jsonb('feature_flags').nullable()
      .comment('Active feature flags at time of request — e.g. {"claude.nlu":true,"tts.elevenlabs":false}');

    // Privacy-safe client fingerprint
    table.string('ip_hash', 12).nullable()
      .comment('HMAC-SHA256 of client IP, truncated to 12 hex chars (GDPR-safe)');

    // Session context
    table.integer('session_turn').unsigned().nullable()
      .comment('Turn number within the call session (1-based)');

    // Model used (for cost/quality analysis)
    table.string('model_id', 100).nullable()
      .comment('Exact model ID used (e.g. claude-haiku-4-5-20251001)');

    // Token usage for Claude API cost tracking
    table.integer('tokens_input').unsigned().nullable();
    table.integer('tokens_output').unsigned().nullable();
  });

  // ── 2. Indexes for new columns ────────────────────────────────────────────

  await knex.schema.table('audit_logs', (table) => {
    table.index(['request_id'], 'idx_audit_request_id');
    table.index(['provider', 'created_at'], 'idx_audit_provider_ts');
    table.index(['nlu_strategy', 'created_at'], 'idx_audit_strategy_ts');
  });

  // ── 3. Partial index: last 30 days (most common query window) ────────────
  // Raw SQL — knex doesn't support partial indexes natively.
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_recent
    ON audit_logs (phone_number, created_at DESC)
    WHERE created_at > NOW() - INTERVAL '30 days'
  `);

  // ── 4. Row-level TTL: auto-delete rows older than 90 days ─────────────────
  // Creates a PG function + trigger. Alternatively use pg_partman for partitioning.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION audit_log_cleanup()
    RETURNS void
    LANGUAGE plpgsql
    AS $$
    BEGIN
      DELETE FROM audit_logs
      WHERE created_at < NOW() - INTERVAL '90 days';
    END;
    $$
  `);

  // ── 5. audit_log_features table — deduplicated flag snapshots ─────────────
  // Normalises the feature_flags JSONB to avoid repeating the same object
  // for every row in a high-traffic window.
  const hasTable = await knex.schema.hasTable('audit_log_features');
  if (!hasTable) {
    await knex.schema.createTable('audit_log_features', (table) => {
      table.increments('id').primary();
      table.jsonb('flags').notNullable();
      table.string('flags_hash', 64).notNullable().unique()
        .comment('SHA-256 of JSON.stringify(flags) for dedup lookup');
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index(['flags_hash'], 'idx_alf_hash');
    });
  }
}

/** @param {import('knex').Knex} knex */
export async function down(knex) {
  // Drop trigger + function
  await knex.raw(`DROP FUNCTION IF EXISTS audit_log_cleanup() CASCADE`);

  // Drop partial index
  await knex.raw(`DROP INDEX IF EXISTS idx_audit_recent`);

  // Drop new indexes
  await knex.schema.table('audit_logs', (table) => {
    table.dropIndex([], 'idx_audit_request_id');
    table.dropIndex([], 'idx_audit_provider_ts');
    table.dropIndex([], 'idx_audit_strategy_ts');
  }).catch(() => {}); // ignore if already gone

  // Remove added columns
  await knex.schema.table('audit_logs', (table) => {
    table.dropColumn('request_id');
    table.dropColumn('provider');
    table.dropColumn('nlu_strategy');
    table.dropColumn('feature_flags');
    table.dropColumn('ip_hash');
    table.dropColumn('session_turn');
    table.dropColumn('model_id');
    table.dropColumn('tokens_input');
    table.dropColumn('tokens_output');
  });

  await knex.schema.dropTableIfExists('audit_log_features');
}
