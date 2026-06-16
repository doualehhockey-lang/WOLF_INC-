<<<<<<< HEAD
// src/features/admin/admin.controller.js
// Gestion des opérateurs, clés API, logs de sécurité, usage.

import crypto from 'crypto';
import { db, dbAvailable } from '../../infra/db/dbClient.js';
import { childLogger } from '../../core/logger.js';

const log = childLogger('admin');

function noDb(res) {
  return res.status(503).json({ error: 'DB_UNAVAILABLE', message: 'Database not configured' });
}

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, (err, buf) =>
      err ? reject(err) : resolve(buf.toString('hex'))
    )
  );
  return `$scrypt$${salt}$${hash}`;
}

function randomPassword() {
  return crypto.randomBytes(12).toString('base64url');
}

function generateApiKey() {
  return `wlf_${crypto.randomBytes(32).toString('hex')}`;
}

// ── User management ──────────────────────────────────────────────────────────

export async function listUsers(req, res, next) {
  if (!dbAvailable) return noDb(res);
  try {
    const users = await db('operator_users')
      .select('id', 'email', 'name', 'role', 'is_active', 'last_login_at', 'created_at')
      .orderBy('created_at', 'desc');
    res.json({ users });
  } catch (err) {
    next(err);
  }
}

export async function createUser(req, res, next) {
  if (!dbAvailable) return noDb(res);
  const { email, name, role = 'readonly', password } = req.body ?? {};
  if (!email || !name) {
    return res
      .status(400)
      .json({ error: 'VALIDATION_ERROR', message: 'email and name are required' });
  }
  if (!['admin', 'operator', 'readonly'].includes(role)) {
    return res
      .status(400)
      .json({ error: 'VALIDATION_ERROR', message: 'role must be admin|operator|readonly' });
  }
  try {
    const password_hash = password ? await hashPassword(password) : null;
    const [user] = await db('operator_users')
      .insert({ email, name, role, password_hash })
      .returning(['id', 'email', 'name', 'role', 'is_active', 'created_at']);
    log.info({ email, role, actor: req.user?.sub }, 'Operator user created');
    res.status(201).json({ user });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'CONFLICT', message: 'Email already exists' });
    }
    next(err);
  }
}

export async function updateUser(req, res, next) {
  if (!dbAvailable) return noDb(res);
  const { id } = req.params;
  const { name, email, is_active } = req.body ?? {};
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (email !== undefined) patch.email = email;
  if (is_active !== undefined) patch.is_active = Boolean(is_active);
  if (!Object.keys(patch).length) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Nothing to update' });
  }
  patch.updated_at = new Date();
  try {
    const count = await db('operator_users').where({ id }).update(patch);
    if (!count) return res.status(404).json({ error: 'NOT_FOUND', message: 'User not found' });
    const user = await db('operator_users')
      .where({ id })
      .select('id', 'email', 'name', 'role', 'is_active', 'last_login_at', 'created_at')
      .first();
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req, res, next) {
  if (!dbAvailable) return noDb(res);
  const { id } = req.params;
  if (req.user?.sub === id) {
    return res
      .status(400)
      .json({ error: 'VALIDATION_ERROR', message: 'Cannot delete your own account' });
  }
  try {
    const count = await db('operator_users').where({ id }).delete();
    if (!count) return res.status(404).json({ error: 'NOT_FOUND', message: 'User not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function updateUserRole(req, res, next) {
  if (!dbAvailable) return noDb(res);
  const { id } = req.params;
  const { role } = req.body ?? {};
  if (!['admin', 'operator', 'readonly'].includes(role)) {
    return res
      .status(400)
      .json({ error: 'VALIDATION_ERROR', message: 'role must be admin|operator|readonly' });
  }
  try {
    const count = await db('operator_users').where({ id }).update({ role, updated_at: new Date() });
    if (!count) return res.status(404).json({ error: 'NOT_FOUND', message: 'User not found' });
    res.json({ ok: true, role });
  } catch (err) {
    next(err);
  }
}

export async function resetUserPassword(req, res, next) {
  if (!dbAvailable) return noDb(res);
  const { id } = req.params;
  try {
    const user = await db('operator_users').where({ id }).select('id', 'email').first();
    if (!user) return res.status(404).json({ error: 'NOT_FOUND', message: 'User not found' });
    const tempPassword = randomPassword();
    await db('operator_users')
      .where({ id })
      .update({ password_hash: await hashPassword(tempPassword), updated_at: new Date() });
    res.json({
      ok: true,
      tempPassword,
      message: 'Temporary password set — share securely; it cannot be retrieved again',
    });
  } catch (err) {
    next(err);
  }
}

// ── API key management ───────────────────────────────────────────────────────

export async function listApiKeys(req, res, next) {
  if (!dbAvailable) return noDb(res);
  try {
    const keys = await db('api_keys')
      .select(
        'id',
        'name',
        'key_prefix',
        'role',
        'is_revoked',
        'last_used_at',
        'expires_at',
        'created_at',
        'revoked_at'
      )
      .orderBy('created_at', 'desc');
    res.json({
      keys: keys.map(k => ({
        id: k.id,
        name: k.name,
        prefix: k.key_prefix,
        role: k.role,
        revoked: k.is_revoked,
        lastUsed: k.last_used_at,
        expiresAt: k.expires_at,
        createdAt: k.created_at,
        revokedAt: k.revoked_at,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function createApiKey(req, res, next) {
  if (!dbAvailable) return noDb(res);
  const { name, role = 'service', expiresAt } = req.body ?? {};
  if (!name) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'name is required' });
  }
  if (!['admin', 'service', 'readonly'].includes(role)) {
    return res
      .status(400)
      .json({ error: 'VALIDATION_ERROR', message: 'role must be admin|service|readonly' });
  }
  try {
    const fullKey = generateApiKey();
    const key_hash = sha256(fullKey);
    const key_prefix = fullKey.slice(0, 12);
    const [key] = await db('api_keys')
      .insert({
        name,
        key_hash,
        key_prefix,
        role,
        created_by: req.user?.sub ?? null,
        expires_at: expiresAt ?? null,
      })
      .returning(['id', 'name', 'key_prefix', 'role', 'created_at', 'expires_at']);
    log.info({ keyId: key.id, name, role }, 'API key created');
    res.status(201).json({
      key: fullKey,
      id: key.id,
      name: key.name,
      prefix: key.key_prefix,
      role: key.role,
      message: 'Store this key — it cannot be retrieved again',
    });
  } catch (err) {
    next(err);
  }
}

export async function revokeApiKey(req, res, next) {
  if (!dbAvailable) return noDb(res);
  const { id } = req.params;
  try {
    const updated = await db('api_keys')
      .where({ id, is_revoked: false })
      .update({ is_revoked: true, revoked_at: new Date() })
      .returning(['id']);
    if (!updated.length) {
      const key = await db('api_keys').where({ id }).select('id', 'is_revoked').first();
      if (!key) return res.status(404).json({ error: 'NOT_FOUND', message: 'API key not found' });
      return res.status(409).json({ error: 'CONFLICT', message: 'Key already revoked' });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function rotateApiKey(req, res, next) {
  if (!dbAvailable) return noDb(res);
  const { id } = req.params;
  try {
    const existing = await db('api_keys')
      .where({ id })
      .select('id', 'name', 'role', 'is_revoked')
      .first();
    if (!existing)
      return res.status(404).json({ error: 'NOT_FOUND', message: 'API key not found' });
    if (existing.is_revoked) {
      return res.status(409).json({ error: 'CONFLICT', message: 'Cannot rotate a revoked key' });
    }
    const fullKey = generateApiKey();
    const key_hash = sha256(fullKey);
    const key_prefix = fullKey.slice(0, 12);
    let newKey;
    await db.transaction(async trx => {
      await trx('api_keys').where({ id }).update({ is_revoked: true, revoked_at: new Date() });
      [newKey] = await trx('api_keys')
        .insert({
          name: existing.name,
          key_hash,
          key_prefix,
          role: existing.role,
          created_by: req.user?.sub ?? null,
        })
        .returning(['id', 'name', 'key_prefix', 'role', 'created_at']);
    });
    res.json({
      key: fullKey,
      id: newKey.id,
      name: newKey.name,
      prefix: newKey.key_prefix,
      role: newKey.role,
      message: 'Old key revoked. Store new key — it cannot be retrieved again',
    });
  } catch (err) {
    next(err);
  }
}

// ── Security logs ─────────────────────────────────────────────────────────────

export async function fetchSecurityLogs(req, res, next) {
  if (!dbAvailable) {
    return res
      .status(503)
      .json({ error: 'DB_UNAVAILABLE', message: 'Audit logs require a database connection' });
  }
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? '50', 10), 1), 100);
    const before = req.query.before;
    let query = db('audit_logs')
      .select(
        'id',
        'phone_number',
        'action',
        'provider',
        'nlu_strategy',
        'request_id',
        'ip_hash',
        'created_at'
      )
      .orderBy('created_at', 'desc')
      .limit(limit + 1);
    if (before) query = query.where('created_at', '<', new Date(before).toISOString());
    const rows = await query;
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    res.json({
      data,
      pagination: {
        limit,
        hasMore,
        nextCursor: hasMore ? new Date(data[data.length - 1].created_at).toISOString() : null,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── Usage / billing ───────────────────────────────────────────────────────────

export async function getUsageSummaryHandler(req, res, next) {
  try {
    const { tenantId = 'default', from, to, groupBy = 'day' } = req.query;
    const { getUsageSummary } = await import('../usage/usage.service.js');
    const data = await getUsageSummary({ tenantId, from, to, groupBy });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getUsageTotalsHandler(req, res, next) {
  try {
    const tenantId = req.query.tenantId ?? 'default';
    const days = parseInt(req.query.days ?? '30', 10);
    const { getUsageTotals } = await import('../usage/usage.service.js');
    const data = await getUsageTotals({ tenantId, days });
    res.json({ data });
  } catch (err) {
    next(err);
  }
=======
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
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}
