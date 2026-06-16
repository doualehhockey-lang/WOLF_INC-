// frontend/tests/jest.setup.js
import '@testing-library/jest-dom';
<<<<<<< HEAD
import { jest } from '@jest/globals';
=======
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

// Silence Next.js router warnings in tests.
jest.mock('next/router', () => ({
  useRouter: () => ({
    pathname: '/',
<<<<<<< HEAD
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn().mockResolvedValue(undefined),
    query: {},
    asPath: '/',
    events: { on: jest.fn(), off: jest.fn() },
=======
    push:     jest.fn(),
    replace:  jest.fn(),
    prefetch: jest.fn().mockResolvedValue(undefined),
    query:    {},
    asPath:   '/',
    events:   { on: jest.fn(), off: jest.fn() },
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  }),
}));

// Mock next/link to render a plain <a>.
jest.mock('next/link', () => {
  const Link = ({ href, children, ...rest }) => (
<<<<<<< HEAD
    <a href={href} {...rest}>
      {children}
    </a>
=======
    <a href={href} {...rest}>{children}</a>
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  );
  Link.displayName = 'Link';
  return Link;
});

// Stub window.matchMedia (not implemented in jsdom).
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
<<<<<<< HEAD
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
=======
    matches:              false,
    media:                query,
    onchange:             null,
    addListener:          jest.fn(),
    removeListener:       jest.fn(),
    addEventListener:     jest.fn(),
    removeEventListener:  jest.fn(),
    dispatchEvent:        jest.fn(),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  })),
});

// Stub localStorage.
const _store = {};
Object.defineProperty(window, 'localStorage', {
  value: {
<<<<<<< HEAD
    getItem: k => _store[k] ?? null,
    setItem: (k, v) => {
      _store[k] = String(v);
    },
    removeItem: k => {
      delete _store[k];
    },
    clear: () => {
      Object.keys(_store).forEach(k => delete _store[k]);
    },
  },
});

// Stub ResizeObserver (not implemented in jsdom — needed by Recharts).
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

=======
    getItem:    k => _store[k] ?? null,
    setItem:    (k, v) => { _store[k] = String(v); },
    removeItem: k => { delete _store[k]; },
    clear:      () => { Object.keys(_store).forEach(k => delete _store[k]); },
  },
});

>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
// Stub sessionStorage identically.
const _session = {};
Object.defineProperty(window, 'sessionStorage', {
  value: {
<<<<<<< HEAD
    getItem: k => _session[k] ?? null,
    setItem: (k, v) => {
      _session[k] = String(v);
    },
    removeItem: k => {
      delete _session[k];
    },
    clear: () => {
      Object.keys(_session).forEach(k => delete _session[k]);
    },
=======
    getItem:    k => _session[k] ?? null,
    setItem:    (k, v) => { _session[k] = String(v); },
    removeItem: k => { delete _session[k]; },
    clear:      () => { Object.keys(_session).forEach(k => delete _session[k]); },
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  },
});
