// migrations/003_add_indexes.js
// Performance indexes for common query patterns.

/** @param {import('knex').Knex} knex */
export async function up(knex) {
  // Events: sorted listing (most common query)
  await knex.schema.table('events', table => {
    table.index(['phone_number', 'date', 'time'], 'idx_events_phone_date_time');
    table.index(['phone_number', 'deleted_at', 'date'], 'idx_events_phone_active_date');
  });

  // Audit logs: error rate queries + per-user history
  await knex.schema.table('audit_logs', table => {
    table.index(['status', 'created_at'], 'idx_audit_status_ts');
    table.index(['call_sid', 'created_at'], 'idx_audit_callsid_ts');
  });

  // Sessions: cleanup of expired rows
  await knex.schema.table('sessions', table => {
    table.index(['expires_at'], 'idx_sessions_expires');
  });
}

/** @param {import('knex').Knex} knex */
export async function down(knex) {
  await knex.schema.table('events', table => {
    table.dropIndex([], 'idx_events_phone_date_time');
    table.dropIndex([], 'idx_events_phone_active_date');
  });
  await knex.schema.table('audit_logs', table => {
    table.dropIndex([], 'idx_audit_status_ts');
    table.dropIndex([], 'idx_audit_callsid_ts');
  });
  await knex.schema.table('sessions', table => {
    table.dropIndex([], 'idx_sessions_expires');
  });
}
