// @ts-nocheck
// src/features/nlu/strategies/base.strategy.js — Abstract NLU strategy interface.
export class NluStrategy {
  async analyze(_text, _options = {}) {
    throw new Error('Not implemented');
  }
}
