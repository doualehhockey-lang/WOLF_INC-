// frontend/tests/jest.setup.js
import '@testing-library/jest-dom';

// Silence Next.js router warnings in tests.
jest.mock('next/router', () => ({
  useRouter: () => ({
    pathname: '/',
    push:     jest.fn(),
    replace:  jest.fn(),
    prefetch: jest.fn().mockResolvedValue(undefined),
    query:    {},
    asPath:   '/',
    events:   { on: jest.fn(), off: jest.fn() },
  }),
}));

// Mock next/link to render a plain <a>.
jest.mock('next/link', () => {
  const Link = ({ href, children, ...rest }) => (
    <a href={href} {...rest}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

// Stub window.matchMedia (not implemented in jsdom).
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches:              false,
    media:                query,
    onchange:             null,
    addListener:          jest.fn(),
    removeListener:       jest.fn(),
    addEventListener:     jest.fn(),
    removeEventListener:  jest.fn(),
    dispatchEvent:        jest.fn(),
  })),
});

// Stub localStorage.
const _store = {};
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem:    k => _store[k] ?? null,
    setItem:    (k, v) => { _store[k] = String(v); },
    removeItem: k => { delete _store[k]; },
    clear:      () => { Object.keys(_store).forEach(k => delete _store[k]); },
  },
});

// Stub sessionStorage identically.
const _session = {};
Object.defineProperty(window, 'sessionStorage', {
  value: {
    getItem:    k => _session[k] ?? null,
    setItem:    (k, v) => { _session[k] = String(v); },
    removeItem: k => { delete _session[k]; },
    clear:      () => { Object.keys(_session).forEach(k => delete _session[k]); },
  },
});
