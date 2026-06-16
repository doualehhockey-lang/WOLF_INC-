// @ts-nocheck
// jest.stryker.config.cjs — Jest configuration for Stryker mutation testing.
// Same as the main jest config (package.json#jest) but WITHOUT globalSetup,
// because Stryker's sandbox doesn't include the tests/ directory.
// Env vars required by config.js Zod validation are set below instead.

// Set required env vars before any module loads
process.env.BASE_URL            = 'http://localhost:3000';
process.env.PHONE_SALT          = 'testsalt1234567890__padding__';
process.env.JWT_SECRET          = 'testjwtsecret__padding__1234567890abcdef';
process.env.JWT_REFRESH_SECRET  = 'testrefresh__padding__1234567890abcdef';
process.env.API_KEYS            = 'test-key-abc123';
process.env.NODE_ENV            = 'test';

const base = require('./package.json').jest;

// CRITICAL: ESM test files (jest.unstable_mockModule / await import) require
// --experimental-vm-modules. This must be set here AND in the Stryker process
// env so Jest worker sub-processes inherit it.
process.env.NODE_OPTIONS = '--experimental-vm-modules';

module.exports = {
  ...base,
  globalSetup:            undefined,   // omit — tests/setup.js not in Stryker sandbox
  testEnvironment:        'node',
  testPathIgnorePatterns: ['<rootDir>/frontend/', '<rootDir>/.stryker-tmp/'],
};
