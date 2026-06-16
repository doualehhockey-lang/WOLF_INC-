// @ts-nocheck
// src/features/nlu/context.builder.js — Builds contextual prompts from conversation history.
export function buildContextualMessage(text, context) {
  if (!context) return text;
  return `${context}\n\nNouveau message à analyser : "${text}"`;
}
