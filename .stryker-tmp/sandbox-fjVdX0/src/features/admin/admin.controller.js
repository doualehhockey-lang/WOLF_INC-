// @ts-nocheck
// src/features/admin/admin.controller.js — lightweight admin controller stubs.
// These are intentionally minimal: real implementations should call
// repositories / DB services. They exist so the frontend admin UI
// has a secure backend surface to call and for tests to exercise auth.

export async function listUsers(req, res) {
  res.json({ users: [] });
}

export async function createUser(req, res) {
  res.status(201).json({ id: 'u_new', ...req.body });
}

export async function updateUser(req, res) {
  res.json({ id: req.params.id, ...req.body });
}

export async function deleteUser(req, res) {
  res.status(204).end();
}

export async function listApiKeys(req, res) {
  res.json({ keys: [] });
}

export async function createApiKey(req, res) {
  res.status(201).json({ id: 'k_new', ...req.body });
}

export async function revokeApiKey(req, res) {
  res.status(204).end();
}

export async function fetchSecurityLogs(req, res) {
  res.json({ events: [], total: 0 });
}

export async function triggerCanary(req, res) {
  res.json({ ok: true, tag: req.body.tag });
}

export async function promoteCanary(req, res) {
  res.json({ ok: true });
}

export async function rollbackDeploy(req, res) {
  res.json({ ok: true, tag: req.body.tag });
}

export async function fetchK8sPods(req, res) {
  res.json([]);
}

export async function fetchK8sHpa(req, res) {
  res.json([]);
}

export async function fetchGrafanaPanels(req, res) {
  res.json({ panels: [] });
}
