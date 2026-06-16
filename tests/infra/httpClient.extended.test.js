// tests/infra/httpClient.extended.test.js
// Covers lines 41-44: non-native-fetch branch (agent is passed to fetch options).
// Uses a defineProperty getter trick: first read returns undefined (nativeFetch=false),
// second read (the actual fetch() call) returns the mock function.

import { jest } from '@jest/globals';
import { apiFetch, httpsAgent, httpAgent } from '../../src/infra/http/httpClient.js';

// ═════════════════════════════════════════════════════════════════════════════
// Non-native-fetch branch: lines 42-43 — spread { agent } into fetch options
// ═════════════════════════════════════════════════════════════════════════════

describe('apiFetch — non-native-fetch branch (lines 41-44)', () => {
  let originalDescriptor;

  beforeEach(() => {
    // Save original descriptor so we can restore it
    originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  });

  afterEach(() => {
    // Restore original fetch
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'fetch', originalDescriptor);
    } else {
      delete globalThis.fetch;
    }
  });

  test('passes httpsAgent when fetch is not native (https URL)', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    let readCount = 0;

    // First read (typeof check) → not a function → nativeFetch = false
    // Second read (actual call) → the mock
    Object.defineProperty(globalThis, 'fetch', {
      get() {
        readCount += 1;
        return readCount === 1 ? undefined : mockFetch;
      },
      configurable: true,
    });

    await apiFetch('https://api.example.com/endpoint', { method: 'GET' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/endpoint',
      expect.objectContaining({ agent: httpsAgent, method: 'GET' })
    );
  });

  test('passes httpAgent when fetch is not native (http URL)', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    let readCount = 0;

    Object.defineProperty(globalThis, 'fetch', {
      get() {
        readCount += 1;
        return readCount === 1 ? undefined : mockFetch;
      },
      configurable: true,
    });

    await apiFetch('http://internal.service/endpoint', { method: 'POST' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://internal.service/endpoint',
      expect.objectContaining({ agent: httpAgent })
    );
  });

  test('does NOT pass agent when fetch IS native', async () => {
    // Standard native fetch path: globalThis.fetch is a real function
    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = mockFetch; // set to a function → nativeFetch = true

    await apiFetch('https://api.example.com/v1', {});

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts).not.toHaveProperty('agent');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Agent selection based on URL scheme
// ═════════════════════════════════════════════════════════════════════════════

describe('apiFetch — agent selection', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('selects httpsAgent for https:// URLs', async () => {
    let readCount = 0;
    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    Object.defineProperty(globalThis, 'fetch', {
      get() {
        readCount++;
        return readCount === 1 ? undefined : mockFetch;
      },
      configurable: true,
    });

    await apiFetch('https://secure.api.com/data');
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.agent).toBe(httpsAgent);
  });

  test('selects httpAgent for http:// URLs', async () => {
    let readCount = 0;
    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    Object.defineProperty(globalThis, 'fetch', {
      get() {
        readCount++;
        return readCount === 1 ? undefined : mockFetch;
      },
      configurable: true,
    });

    await apiFetch('http://local.service/path');
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.agent).toBe(httpAgent);
  });
});
