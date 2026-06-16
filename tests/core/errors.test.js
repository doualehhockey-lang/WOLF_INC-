// tests/core/errors.test.js
// Custom error hierarchy: class structure, HTTP status codes, code strings,
// message formatting, instanceof chains, and isUserFacingError guard.

import { describe, test, expect } from '@jest/globals';

import {
  AppError,
  ValidationError,
  NotFoundError,
  RateLimitError,
  ExternalServiceError,
  NluError,
  TtsError,
  DatabaseError,
  PipelineTimeoutError,
  isUserFacingError,
} from '../../src/core/errors.js';

// ═════════════════════════════════════════════════════════════════════════════
// 1. AppError — base class
// ═════════════════════════════════════════════════════════════════════════════

describe('AppError', () => {
  test('is an instance of Error', () => {
    expect(new AppError('TEST')).toBeInstanceOf(Error);
  });

  test('name is "AppError"', () => {
    expect(new AppError('CODE').name).toBe('AppError');
  });

  test('code is set from first argument', () => {
    expect(new AppError('MY_CODE').code).toBe('MY_CODE');
  });

  test('default statusCode is 500', () => {
    expect(new AppError('CODE').statusCode).toBe(500);
  });

  test('custom statusCode is respected', () => {
    expect(new AppError('CODE', 418).statusCode).toBe(418);
  });

  test('default context is empty object', () => {
    expect(new AppError('CODE').context).toEqual({});
  });

  test('context is preserved', () => {
    const ctx = { foo: 'bar' };
    expect(new AppError('CODE', 500, ctx).context).toEqual(ctx);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. ValidationError
// ═════════════════════════════════════════════════════════════════════════════

describe('ValidationError', () => {
  test('is an instance of AppError', () => {
    expect(new ValidationError('bad input')).toBeInstanceOf(AppError);
  });

  test('statusCode is 400', () => {
    expect(new ValidationError('msg').statusCode).toBe(400);
  });

  test('code is VALIDATION_ERROR', () => {
    expect(new ValidationError('msg').code).toBe('VALIDATION_ERROR');
  });

  test('message is set from first argument', () => {
    expect(new ValidationError('field is required').message).toBe('field is required');
  });

  test('accepts context object', () => {
    const err = new ValidationError('bad', { field: 'email' });
    expect(err.context).toEqual({ field: 'email' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. NotFoundError
// ═════════════════════════════════════════════════════════════════════════════

describe('NotFoundError', () => {
  test('is an instance of AppError', () => {
    expect(new NotFoundError('Event')).toBeInstanceOf(AppError);
  });

  test('statusCode is 404', () => {
    expect(new NotFoundError('Resource').statusCode).toBe(404);
  });

  test('code is NOT_FOUND', () => {
    expect(new NotFoundError('Resource').code).toBe('NOT_FOUND');
  });

  test('message includes resource name', () => {
    expect(new NotFoundError('Event').message).toContain('Event');
  });

  test('context.resource is set', () => {
    expect(new NotFoundError('Session').context.resource).toBe('Session');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. RateLimitError
// ═════════════════════════════════════════════════════════════════════════════

describe('RateLimitError', () => {
  test('is an instance of AppError', () => {
    expect(new RateLimitError()).toBeInstanceOf(AppError);
  });

  test('statusCode is 429', () => {
    expect(new RateLimitError().statusCode).toBe(429);
  });

  test('code is RATE_LIMITED', () => {
    expect(new RateLimitError().code).toBe('RATE_LIMITED');
  });

  test('default retryAfterSec is 60', () => {
    expect(new RateLimitError().retryAfterSec).toBe(60);
  });

  test('custom retryAfterSec is respected', () => {
    expect(new RateLimitError(120).retryAfterSec).toBe(120);
  });

  test('message is "Too many requests"', () => {
    expect(new RateLimitError().message).toBe('Too many requests');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. ExternalServiceError
// ═════════════════════════════════════════════════════════════════════════════

describe('ExternalServiceError', () => {
  test('is an instance of AppError', () => {
    expect(new ExternalServiceError('Whisper', 'timeout')).toBeInstanceOf(AppError);
  });

  test('statusCode is 503', () => {
    expect(new ExternalServiceError('X', 'error').statusCode).toBe(503);
  });

  test('code is EXTERNAL_SERVICE_ERROR', () => {
    expect(new ExternalServiceError('X', 'error').code).toBe('EXTERNAL_SERVICE_ERROR');
  });

  test('message includes service name and detail', () => {
    const err = new ExternalServiceError('Whisper', 'connection refused');
    expect(err.message).toContain('Whisper');
    expect(err.message).toContain('connection refused');
  });

  test('service field is set', () => {
    expect(new ExternalServiceError('Claude', 'err').service).toBe('Claude');
  });

  test('context.service is set', () => {
    expect(new ExternalServiceError('TTS', 'err').context.service).toBe('TTS');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. NluError
// ═════════════════════════════════════════════════════════════════════════════

describe('NluError', () => {
  test('is an instance of ExternalServiceError', () => {
    expect(new NluError('parse failed')).toBeInstanceOf(ExternalServiceError);
  });

  test('is an instance of AppError', () => {
    expect(new NluError('parse failed')).toBeInstanceOf(AppError);
  });

  test('code is NLU_ERROR', () => {
    expect(new NluError('parse failed').code).toBe('NLU_ERROR');
  });

  test('statusCode is 503 (inherited from ExternalServiceError)', () => {
    expect(new NluError('fail').statusCode).toBe(503);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. TtsError
// ═════════════════════════════════════════════════════════════════════════════

describe('TtsError', () => {
  test('is an instance of ExternalServiceError', () => {
    expect(new TtsError('synth failed')).toBeInstanceOf(ExternalServiceError);
  });

  test('code is TTS_ERROR', () => {
    expect(new TtsError('fail').code).toBe('TTS_ERROR');
  });

  test('statusCode is 503', () => {
    expect(new TtsError('fail').statusCode).toBe(503);
  });

  test('message contains "TTS" service prefix', () => {
    expect(new TtsError('Empty text').message).toContain('TTS');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. DatabaseError
// ═════════════════════════════════════════════════════════════════════════════

describe('DatabaseError', () => {
  test('is an instance of AppError', () => {
    expect(new DatabaseError('query failed')).toBeInstanceOf(AppError);
  });

  test('statusCode is 503', () => {
    expect(new DatabaseError('timeout').statusCode).toBe(503);
  });

  test('code is DATABASE_ERROR', () => {
    expect(new DatabaseError('err').code).toBe('DATABASE_ERROR');
  });

  test('message includes "DB:" prefix', () => {
    expect(new DatabaseError('connection lost').message).toContain('DB:');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. PipelineTimeoutError
// ═════════════════════════════════════════════════════════════════════════════

describe('PipelineTimeoutError', () => {
  test('is an instance of AppError', () => {
    expect(new PipelineTimeoutError(12_000)).toBeInstanceOf(AppError);
  });

  test('statusCode is 504', () => {
    expect(new PipelineTimeoutError(12_000).statusCode).toBe(504);
  });

  test('code is PIPELINE_TIMEOUT', () => {
    expect(new PipelineTimeoutError(12_000).code).toBe('PIPELINE_TIMEOUT');
  });

  test('message includes timeout duration in ms', () => {
    expect(new PipelineTimeoutError(12_000).message).toContain('12000');
  });

  test('context.timeoutMs is set', () => {
    expect(new PipelineTimeoutError(5_000).context.timeoutMs).toBe(5_000);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. isUserFacingError guard
// ═════════════════════════════════════════════════════════════════════════════

describe('isUserFacingError', () => {
  test('returns true for ValidationError (400)', () => {
    expect(isUserFacingError(new ValidationError('bad'))).toBe(true);
  });

  test('returns true for NotFoundError (404)', () => {
    expect(isUserFacingError(new NotFoundError('X'))).toBe(true);
  });

  test('returns true for RateLimitError (429)', () => {
    expect(isUserFacingError(new RateLimitError())).toBe(true);
  });

  test('returns false for ExternalServiceError (503)', () => {
    expect(isUserFacingError(new ExternalServiceError('X', 'err'))).toBe(false);
  });

  test('returns false for DatabaseError (503)', () => {
    expect(isUserFacingError(new DatabaseError('fail'))).toBe(false);
  });

  test('returns false for PipelineTimeoutError (504)', () => {
    expect(isUserFacingError(new PipelineTimeoutError(12_000))).toBe(false);
  });

  test('returns false for TtsError (503)', () => {
    expect(isUserFacingError(new TtsError('fail'))).toBe(false);
  });

  test('returns false for plain Error (not an AppError)', () => {
    expect(isUserFacingError(new Error('generic'))).toBe(false);
  });

  test('returns false for null', () => {
    expect(isUserFacingError(null)).toBe(false);
  });

  test('returns false for AppError with statusCode >= 500', () => {
    expect(isUserFacingError(new AppError('CODE', 500))).toBe(false);
  });

  test('returns true for AppError with statusCode < 500 (e.g. 422)', () => {
    expect(isUserFacingError(new AppError('CODE', 422))).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. Inheritance chain verification
// ═════════════════════════════════════════════════════════════════════════════

describe('Inheritance chain', () => {
  test.each([
<<<<<<< HEAD
    ['ValidationError', new ValidationError('x')],
    ['NotFoundError', new NotFoundError('x')],
    ['RateLimitError', new RateLimitError()],
    ['ExternalServiceError', new ExternalServiceError('x', 'y')],
    ['NluError', new NluError('x')],
    ['TtsError', new TtsError('x')],
    ['DatabaseError', new DatabaseError('x')],
=======
    ['ValidationError',    new ValidationError('x')],
    ['NotFoundError',      new NotFoundError('x')],
    ['RateLimitError',     new RateLimitError()],
    ['ExternalServiceError', new ExternalServiceError('x', 'y')],
    ['NluError',           new NluError('x')],
    ['TtsError',           new TtsError('x')],
    ['DatabaseError',      new DatabaseError('x')],
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    ['PipelineTimeoutError', new PipelineTimeoutError(1000)],
  ])('%s instanceof AppError', (_name, err) => {
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
  });
});
