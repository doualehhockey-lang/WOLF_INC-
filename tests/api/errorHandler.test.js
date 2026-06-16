// tests/api/errorHandler.test.js
// Tests the error handler and notFound middlewares.

import { jest } from '@jest/globals';
import { AppError, ValidationError, NotFoundError } from '../../src/core/errors.js';

// Stub the logger to prevent noise in test output
jest.unstable_mockModule('../../src/core/logger.js', () => ({
<<<<<<< HEAD
  logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} },
=======
  logger:      { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} },
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  childLogger: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }),
}));

const { errorHandler, notFound } = await import('../../src/api/middleware/errorHandler.js');

function _mockRes() {
  const res = { _status: 200, _body: null };
<<<<<<< HEAD
  res.status = s => {
    res._status = s;
    return res;
  };
  res.json = b => {
    res._body = b;
    return res;
  };
=======
  res.status  = (s) => { res._status = s; return res; };
  res.json    = (b) => { res._body   = b; return res; };
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  return res;
}

function _mockReq(overrides = {}) {
  return { id: 'req-1', method: 'GET', url: '/test', path: '/test', ...overrides };
}

describe('errorHandler', () => {
  const next = () => {};

  test('returns 500 for generic Error', () => {
    const res = _mockRes();
    errorHandler(new Error('boom'), _mockReq(), res, next);
    expect(res._status).toBe(500);
    expect(res._body.error).toBe('INTERNAL_ERROR');
  });

  test('returns 400 for ValidationError', () => {
    const res = _mockRes();
    errorHandler(new ValidationError('bad input'), _mockReq(), res, next);
    expect(res._status).toBe(400);
    expect(res._body.error).toBe('VALIDATION_ERROR');
  });

  test('returns 404 for NotFoundError', () => {
    const res = _mockRes();
    errorHandler(new NotFoundError('Event'), _mockReq(), res, next);
    expect(res._status).toBe(404);
    expect(res._body.error).toBe('NOT_FOUND');
  });

  test('uses err.statusCode when present', () => {
    const res = _mockRes();
    const err = new AppError('CUSTOM', 418);
    errorHandler(err, _mockReq(), res, next);
    expect(res._status).toBe(418);
  });
});

describe('notFound', () => {
  test('returns 404 JSON', () => {
    const res = _mockRes();
    notFound(_mockReq({ method: 'DELETE', path: '/ghost' }), res);
    expect(res._status).toBe(404);
    expect(res._body.error).toBe('NOT_FOUND');
    expect(res._body.message).toContain('/ghost');
  });
});
