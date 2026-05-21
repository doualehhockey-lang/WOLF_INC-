// tests/features/agent/intent.normalizer.test.js

import { normalizeIntent } from '../../../src/features/agent/intent.normalizer.js';

describe('normalizeIntent', () => {
  test.each([
    ['create',          'create_event'],
    ['créer',           'create_event'],
    ['ajouter',         'create_event'],
    ['new appointment', 'create_event'],
    ['book a meeting',  'create_event'],
    ['cancel',          'cancel_event'],
    ['annuler',         'cancel_event'],
    ['supprimer',       'cancel_event'],
    ['delete event',    'cancel_event'],
    ['update',          'update_event'],
    ['modifier',        'update_event'],
    ['déplacer rdv',    'update_event'],
    ['list',            'list_events'],
    ['agenda',          'list_events'],
    ['afficher',        'list_events'],
    ['lister',          'list_events'],
  ])('"%s" → %s', (input, expected) => {
    expect(normalizeIntent(input)).toBe(expected);
  });

  test('returns "unknown" for null/undefined', () => {
    expect(normalizeIntent(null)).toBe('unknown');
    expect(normalizeIntent(undefined)).toBe('unknown');
    expect(normalizeIntent('')).toBe('unknown');
  });

  test('returns "unknown" for unrecognized strings', () => {
    expect(normalizeIntent('foobar xyz')).toBe('unknown');
    expect(normalizeIntent('hello world')).toBe('unknown');
  });

  test('is case-insensitive', () => {
    expect(normalizeIntent('CREATE')).toBe('create_event');
    expect(normalizeIntent('CANCEL')).toBe('cancel_event');
  });
});
