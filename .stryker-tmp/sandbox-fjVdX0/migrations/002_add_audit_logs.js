// @ts-nocheck
// migrations/002_add_audit_logs.js
// Audit trail for all intents — required for compliance and debugging.

/** @param {import('knex').Knex} knex */
export async function up(knex) {
  await knex.schema.createTable('audit_logs', table => {
    table.increments('id').primary();
    table.string('phone_number', 20).notNullable();
    table.string('call_sid', 100).nullable();
    table.string('action', 100).notNullable(); // 'create_event', 'nlu_analyze', etc.
    table.string('intent', 50).nullable();
    table.jsonb('request_data').nullable();
    table.jsonb('response_data').nullable();
    table.string('status', 20).notNullable(); // 'success' | 'error' | 'timeout'
    table.integer('latency_ms').nullable();
    table.text('error_message').nullable();
    table.string('error_code', 50).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index(['phone_number', 'action']);
    table.index(['phone_number', 'created_at']);
    table.index(['status', 'created_at']);
    table.index(['call_sid']);
  });
}

/** @param {import('knex').Knex} knex */
export async function down(knex) {
  await knex.schema.dropTableIfExists('audit_logs');
}
