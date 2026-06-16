// tests/setup.js — Jest globalSetup: sets required env vars before any module loads.
// This file runs in the main Jest process before test workers start,
// ensuring config.js Zod validation passes without a real .env file.

export default async function setup() {
<<<<<<< HEAD
  process.env.BASE_URL = 'http://localhost:3000';
  process.env.PHONE_SALT = 'testsalt1234567890__padding__';
  process.env.JWT_SECRET = 'testjwtsecret__padding__1234567890abcdef';
  process.env.JWT_REFRESH_SECRET = 'testrefresh__padding__1234567890abcdef';
  process.env.API_KEYS = 'test-key-abc123';
  process.env.NODE_ENV = 'test';
=======
  process.env.BASE_URL            = 'http://localhost:3000';
  process.env.PHONE_SALT          = 'testsalt1234567890__padding__';
  process.env.JWT_SECRET          = 'testjwtsecret__padding__1234567890abcdef';
  process.env.JWT_REFRESH_SECRET  = 'testrefresh__padding__1234567890abcdef';
  process.env.API_KEYS            = 'test-key-abc123';
  process.env.NODE_ENV            = 'test';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}
