// frontend/tests/jest.globals.js — Global setup for Jest (runs before each test file).
// This file is referenced in package.json jest.setupFiles.

// Silence process.env warnings in test environment.
process.env.NODE_ENV = 'test';
