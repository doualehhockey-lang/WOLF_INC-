// @ts-nocheck
// src/core/errors.js — Custom error hierarchy for Wolf Engine.
export class AppError extends Error {
  constructor(code, statusCode = 500, context = {}) {
    super(code);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.context = context;
  }
}

export class ValidationError extends AppError {
  constructor(message, context = {}) {
    super('VALIDATION_ERROR', 400, context);
    this.message = message;
  }
}

export class NotFoundError extends AppError {
  constructor(resource, context = {}) {
    super('NOT_FOUND', 404, { resource, ...context });
    this.message = `${resource} not found`;
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfterSec = 60) {
    super('RATE_LIMITED', 429, { retryAfterSec });
    this.message = 'Too many requests';
    this.retryAfterSec = retryAfterSec;
  }
}

export class ExternalServiceError extends AppError {
  constructor(service, message, context = {}) {
    super('EXTERNAL_SERVICE_ERROR', 503, { service, ...context });
    this.message = `${service}: ${message}`;
    this.service = service;
  }
}

export class NluError extends ExternalServiceError {
  constructor(message, context = {}) {
    super('NLU', message, context);
    this.code = 'NLU_ERROR';
  }
}

export class TtsError extends ExternalServiceError {
  constructor(message, context = {}) {
    super('TTS', message, context);
    this.code = 'TTS_ERROR';
  }
}

export class DatabaseError extends AppError {
  constructor(message, context = {}) {
    super('DATABASE_ERROR', 503, context);
    this.message = `DB: ${message}`;
  }
}

export class PipelineTimeoutError extends AppError {
  constructor(timeoutMs) {
    super('PIPELINE_TIMEOUT', 504, { timeoutMs });
    this.message = `Pipeline exceeded ${timeoutMs}ms`;
  }
}

export function isUserFacingError(err) {
  return err instanceof AppError && err.statusCode < 500;
}
