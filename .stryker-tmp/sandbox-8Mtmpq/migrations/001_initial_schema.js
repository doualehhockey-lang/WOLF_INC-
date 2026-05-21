// @ts-nocheck
// migrations/001_initial_schema.js
// Run with: npm run db:migrate

/** @param {import('knex').Knex} knex */
export async function up(knex) {
  // Users (multi-tenant root)
  await knex.schema.createTable('users', table => {
    table.string('phone_number', 20).primary();
    table.string('name', 100).nullable();
    table.string('language', 5).defaultTo('fr');
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);

    table.index(['is_active']);
  });

  // Events (appointments per user)
  await knex.schema.createTable('events', table => {
    table.increments('id').primary();
    table
      .string('phone_number', 20)
      .notNullable()
      .references('phone_number')
      .inTable('users')
      .onDelete('CASCADE');
    table.string('subject', 255).notNullable();
    table.date('date').notNullable();
    table.time('time').notNullable().defaultTo('00:00');
    table.text('description').nullable();
    table.timestamps(true, true);
    table.timestamp('deleted_at').nullable(); // soft delete

    table.index(['phone_number', 'date']);
    table.index(['phone_number', 'deleted_at']);
  });

  // Sessions (in-call conversational state)
  await knex.schema.createTable('sessions', table => {
    table.string('call_sid', 100).primary();
    table.string('phone_number', 20).nullable();
    table.jsonb('turns').defaultTo('[]');
    table.string('pending_intent', 50).nullable();
    table.date('pending_date').nullable();
    table.time('pending_time').nullable();
    table.string('pending_subject', 255).nullable();
    table.string('lang', 5).defaultTo('fr');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('expires_at').defaultTo(knex.raw("CURRENT_TIMESTAMP + INTERVAL '15 minutes'"));

    table.index(['phone_number']);
    table.index(['expires_at']);
  });
}

/** @param {import('knex').Knex} knex */
export async function down(knex) {
  await knex.schema.dropTableIfExists('sessions');
  await knex.schema.dropTableIfExists('events');
  await knex.schema.dropTableIfExists('users');
}
