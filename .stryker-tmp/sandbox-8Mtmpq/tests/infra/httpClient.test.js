// @ts-nocheck
// tests/infra/httpClient.test.js
// Unit tests for httpClient.js — verifies agent selection and fetch delegation.

import { jest } from '@jest/globals';
import https from 'https';
import http  from 'http';
import { apiFetch, httpsAgent, httpAgent } from '../../src/infra/http/httpClient.js';

describe('httpClient', () => {
  test('exports an https.Agent with keepAlive', () => {
    expect(httpsAgent).toBeInstanceOf(https.Agent);
    expect(httpsAgent.keepAlive).toBe(true);
  });

  test('exports an http.Agent with keepAlive', () => {
    expect(httpAgent).toBeInstanceOf(http.Agent);
    expect(httpAgent.keepAlive).toBe(true);
  });

  test('apiFetch delegates to global fetch', async () => {
    const mockResponse = { ok: true, status: 200 };
    const mockFetch    = jest.fn().mockResolvedValue(mockResponse);
    const originalFetch = globalThis.fetch;

    globalThis.fetch = mockFetch;
    try {
      const result = await apiFetch('https://example.com/api', { method: 'GET' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api',
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toBe(mockResponse);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('apiFetch merges caller options', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;
    try {
      await apiFetch('https://api.example.com', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ x: 1 }),
      });
      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.method).toBe('POST');
      expect(opts.headers['Content-Type']).toBe('application/json');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
