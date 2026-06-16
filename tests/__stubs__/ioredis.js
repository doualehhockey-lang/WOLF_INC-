// tests/__stubs__/ioredis.js
// Minimal ESM stub for ioredis — allows jest.unstable_mockModule('ioredis', ...)
// to work in test environments where the real ioredis package is not installed.
// This file is mapped via jest moduleNameMapper. Individual tests override it
// with jest.unstable_mockModule() to provide their own test doubles.

export default class Redis {
  constructor() {}
  async connect() {}
  async ping() {}
<<<<<<< HEAD
  async get() {
    return null;
  }
  async set() {
    return 'OK';
  }
  async setex() {
    return 'OK';
  }
  async del() {
    return 1;
  }
  async incr() {
    return 1;
  }
  async expire() {
    return 1;
  }
  async ttl() {
    return -1;
  }
  async getBuffer() {
    return null;
  }
  async eval() {
    return null;
  }
=======
  async get() { return null; }
  async set() { return 'OK'; }
  async setex() { return 'OK'; }
  async del() { return 1; }
  async incr() { return 1; }
  async expire() { return 1; }
  async ttl() { return -1; }
  async getBuffer() { return null; }
  async eval() { return null; }
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  on() {}
}
