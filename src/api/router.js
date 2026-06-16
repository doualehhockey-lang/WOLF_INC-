// src/api/router.js — Root Express router.
// Mounts all feature routers and REST endpoints.
// Order matters: Twilio HMAC is applied only on /twilio routes.

<<<<<<< HEAD
import crypto from 'crypto';
import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { register } from '../core/metrics.js';
import { twilioHmac } from './middleware/twilioHmac.js';
import { validateBody, ReplyBodySchema } from './middleware/validation.js';
import { requireJwt } from '../features/auth/auth.middleware.js';
import { requireTenant } from './middleware/tenant.js';
import { authRouter } from '../features/auth/auth.router.js';
import { voiceRouter } from '../features/voice/voice.router.js';
import { smsRouter } from '../features/sms/sms.router.js';
import { autoReply, getTones } from '../features/responder/responder.service.js';
import { childLogger } from '../core/logger.js';
import { config } from '../core/config.js';
import { adminRouter as _adminRouter } from '../features/admin/admin.router.js';
import { makeSecurityMiddleware } from '../services/security.js';
import { db, dbAvailable, pendingMigrationCount } from '../infra/db/dbClient.js';
import { redis, isRedisAvailable } from '../infra/redis/redisClient.js';
import { validateBusinessHours } from '../core/businessHours.js';
import { notifyStaff } from '../features/notifications/notification.service.js';
import { readTenantSettings } from '../core/tenantSettings.js';

const log = childLogger('router');
export const router = Router();

// ── Public booking rate limiter (in-memory, max 10 per IP per hour) ──────────
const _bookingRateMap = new Map(); // key: IP, value: { count, resetAt }

function _bookingRateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  let entry = _bookingRateMap.get(ip);

  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + 60 * 60 * 1000 }; // 1 hour window
    _bookingRateMap.set(ip, entry);
  }

  entry.count += 1;

  if (entry.count > 10) {
    return res
      .status(429)
      .json({ error: 'RATE_LIMIT', message: 'Trop de reservations. Reessayez plus tard.' });
  }

  next();
}

// Cleanup stale entries every 10 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [ip, entry] of _bookingRateMap) {
      if (now >= entry.resetAt) _bookingRateMap.delete(ip);
    }
  },
  10 * 60 * 1000
).unref();

=======
import { Router }          from 'express';
import { register }        from '../core/metrics.js';
import { twilioHmac }      from './middleware/twilioHmac.js';
import { validateBody, ReplyBodySchema } from './middleware/validation.js';
import { requireJwt }      from '../features/auth/auth.middleware.js';
import { authRouter }      from '../features/auth/auth.router.js';
import { voiceRouter }     from '../features/voice/voice.router.js';
import { smsRouter }       from '../features/sms/sms.router.js';
import { autoReply, getTones } from '../features/responder/responder.service.js';
import { childLogger }     from '../core/logger.js';
import { config }          from '../core/config.js';
import { adminRouter }     from '../features/admin/admin.router.js';
import { makeSecurityMiddleware } from '../services/security.js';

const log    = childLogger('router');
export const router = Router();

>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
// Prometheus metrics auth:
//  - dev/test:  no auth (open for local scraping)
//  - prod with METRICS_TOKEN: static Bearer token (standard Prometheus pattern)
//  - prod without METRICS_TOKEN: falls back to JWT security middleware
const _metricsAuth = (() => {
  if (config.NODE_ENV !== 'production') return (_req, _res, next) => next();
  const metricsToken = process.env.METRICS_TOKEN;
  if (metricsToken) {
    return (req, res, next) => {
      const auth = req.headers.authorization ?? '';
<<<<<<< HEAD
      // Timing-safe comparison to prevent token brute-force via timing side-channel.
      const expected = `Bearer ${metricsToken}`;
      if (
        auth.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(expected))
      )
        return next();
=======
      if (auth === `Bearer ${metricsToken}`) return next();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      res.status(401).set('WWW-Authenticate', 'Bearer realm="wolf-metrics"').end();
    };
  }
  return makeSecurityMiddleware({ resource: 'metrics', skipRateLimit: true });
})();

// ── Prometheus metrics (internal — restrict in prod via network policy) ────────
router.get('/metrics', _metricsAuth, async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// ── Health checks ─────────────────────────────────────────────────────────────
router.get('/health/live', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

<<<<<<< HEAD
// H2 FIX: Readiness probe now checks actual dependencies.
// Previously only checked heap — a pod could be "ready" while DB and Redis were down,
// causing Kubernetes to route traffic to a pod that can't serve any real requests.
router.get('/health/ready', async (_req, res) => {
  const mem = process.memoryUsage();
  const heapPct = mem.heapUsed / mem.heapTotal;

  const checks = { heap: 'ok', db: 'ok', redis: 'ok', migrations: 'ok' };
  let degraded = false;

  // Migration check — fail readiness if the schema is behind the deployed code.
  if (pendingMigrationCount > 0) {
    checks.migrations = `${pendingMigrationCount}_pending`;
    degraded = true;
  }

  // Heap check
  if (heapPct > 0.95) {
    checks.heap = 'critical';
    degraded = true;
  }

  // Database check — only if DB is configured
  if (dbAvailable) {
    try {
      await db.raw('SELECT 1');
    } catch {
      checks.db = 'error';
      degraded = true;
    }
  } else {
    checks.db = 'unavailable'; // not configured — not a failure
  }

  // Redis check — only if Redis is configured and currently connected.
  // Uses isRedisAvailable() (live getter) rather than the stale exported constant.
  if (isRedisAvailable() && redis) {
    try {
      await redis.ping();
    } catch {
      checks.redis = 'error';
      degraded = true;
    }
  } else {
    checks.redis = 'unavailable'; // not configured — not a failure
  }

  const status = degraded ? 503 : 200;
  res.status(status).json({
    status: degraded ? 'degraded' : 'ok',
    checks,
    heapPct: heapPct.toFixed(2),
    uptime: process.uptime(),
  });
=======
router.get('/health/ready', (_req, res) => {
  const mem     = process.memoryUsage();
  const heapPct = mem.heapUsed / mem.heapTotal;
  if (heapPct > 0.95) {
    return res.status(503).json({
      status: 'degraded', reason: 'memory_pressure', heapPct: heapPct.toFixed(2),
    });
  }
  res.json({ status: 'ok', heapPct: heapPct.toFixed(2), uptime: process.uptime() });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
});

// ── Auth ──────────────────────────────────────────────────────────────────────
router.use('/auth', authRouter);

// ── Twilio voice + SMS (HMAC-verified) ────────────────────────────────────────
router.use('/twilio', twilioHmac, voiceRouter);
router.use('/twilio', twilioHmac, smsRouter);

// ── Auto-responder (JWT-protected) ────────────────────────────────────────────
router.get('/tones', (_req, res) => res.json({ tones: getTones() }));

router.post('/reply', requireJwt, validateBody(ReplyBodySchema), async (req, res, next) => {
  const { content, tone } = req.validated;
  try {
    const reply = await autoReply(content, tone);
    res.json({ reply, tone: tone ?? config.SMS_TONE });
  } catch (err) {
    log.error({ err: err.message }, '/reply autoReply failed');
    next(err);
  }
});

<<<<<<< HEAD
// ── Events — liste/création de rendez-vous (JWT-protected) ───────────────────

router.get('/api/events', requireJwt, requireTenant, async (req, res, next) => {
  try {
    const { date } = req.query;
    const tenantId = req.tenantId;
    if (dbAvailable) {
      let query = db('events')
        .whereNull('deleted_at')
        .where('tenant_id', tenantId)
        .orderBy([
          { column: 'date', order: 'asc' },
          { column: 'time', order: 'asc' },
        ])
        .select(
          'id',
          'user_key',
          'subject',
          'date',
          'time',
          'created_at',
          'client_phone',
          'status',
          'reminder_24h_sent',
          'reminder_2h_sent'
        );
      if (date) query = query.where('date', date);
      const events = await query;
      return res.json({ events });
    }
    // Fallback JSON store — read file, filter by date and tenant
    const filePath = config.EVENTS_FILE;
    if (!existsSync(filePath)) return res.json({ events: [] });
    const all = JSON.parse(readFileSync(filePath, 'utf8'));
    const events = date
      ? all.filter(e => e.date === date && !e.deleted_at && (e.tenant_id ?? 'default') === tenantId)
      : all.filter(e => !e.deleted_at && (e.tenant_id ?? 'default') === tenantId);
    res.json({ events });
  } catch (err) {
    next(err);
  }
});

router.post('/api/events', requireJwt, requireTenant, async (req, res, next) => {
  try {
    const {
      subject,
      date,
      time,
      user_key = 'admin',
      client_name,
      client_phone,
      service,
    } = req.body ?? {};
    if (!date) return res.status(400).json({ error: 'date est requis' });

    // Business hours validation
    const validation = validateBusinessHours(req.tenantId, date, time || '00:00');
    if (!validation.valid) {
      return res.status(400).json({ error: validation.code, message: validation.error });
    }

    if (dbAvailable) {
      const [event] = await db('events')
        .insert({
          tenant_id: req.tenantId,
          user_key,
          subject: subject || service || 'Rendez-vous',
          date,
          time: time || '00:00',
          client_phone: client_phone || null,
          status: 'confirmed',
        })
        .returning([
          'id',
          'user_key',
          'subject',
          'date',
          'time',
          'created_at',
          'client_phone',
          'status',
        ]);

      // Notify staff (fire-and-forget)
      notifyStaff(
        req.tenantId,
        {
          client_name: client_name || subject || 'Client',
          date,
          time: time || '00:00',
          service: subject || service || 'Rendez-vous',
        },
        'created'
      ).catch(err => log.warn({ err: err.message }, 'Staff notification failed'));

      return res.status(201).json({ event });
    }
    res.status(503).json({ error: 'DB_UNAVAILABLE' });
  } catch (err) {
    next(err);
  }
});

router.delete('/api/events/:id', requireJwt, requireTenant, async (req, res, next) => {
  try {
    if (!dbAvailable) return res.status(503).json({ error: 'DB_UNAVAILABLE' });

    // Fetch event before deletion to have data for notification
    const event = await db('events')
      .where({ id: req.params.id, tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .first('id', 'subject', 'date', 'time', 'user_key', 'client_phone');

    await db('events')
      .where({ id: req.params.id, tenant_id: req.tenantId })
      .update({ deleted_at: db.fn.now(), status: 'cancelled' });

    // Notify staff (fire-and-forget)
    if (event) {
      notifyStaff(
        req.tenantId,
        {
          client_name: event.user_key || 'Client',
          date: event.date,
          time: event.time,
          service: event.subject,
        },
        'cancelled'
      ).catch(err => log.warn({ err: err.message }, 'Staff notification failed'));
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Analytics (JWT-protected, per-tenant) ────────────────────────────────────

const JOURS_SEMAINE = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function _parsePeriod(period) {
  const match = /^(\d+)d$/.exec(period);
  if (!match) return 30;
  const days = parseInt(match[1], 10);
  if ([7, 30, 90].includes(days)) return days;
  return 30;
}

function _dateRangeStart(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

router.get('/api/analytics/overview', requireJwt, requireTenant, async (req, res, next) => {
  try {
    const days = _parsePeriod(req.query.period || '30d');
    const periodLabel = `${days}d`;
    const startDate = _dateRangeStart(days);
    const tenantId = req.tenantId;

    const empty = {
      period: periodLabel,
      totalAppointments: 0,
      confirmedAppointments: 0,
      cancelledAppointments: 0,
      cancellationRate: 0,
      totalCalls: 0,
      totalSmsInbound: 0,
      totalSmsOutbound: 0,
      noShowRate: 0,
      busiestDay: '-',
      busiestHour: '-',
      avgAppointmentsPerDay: 0,
      newClientsCount: 0,
    };

    if (!dbAvailable) return res.json(empty);

    // All event stats in one query
    const eventsStats = await db('events')
      .where('tenant_id', tenantId)
      .whereNull('deleted_at')
      .where('date', '>=', startDate)
      .select(
        db.raw('COUNT(*)::int AS total'),
        db.raw("COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed"),
        db.raw("COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled"),
        db.raw("COUNT(*) FILTER (WHERE status = 'no-show')::int AS no_show")
      )
      .first();

    const total = eventsStats?.total ?? 0;
    const confirmed = eventsStats?.confirmed ?? 0;
    const cancelled = eventsStats?.cancelled ?? 0;
    const noShow = eventsStats?.no_show ?? 0;

    // Busiest day of week
    const busiestDayRow = await db('events')
      .where('tenant_id', tenantId)
      .whereNull('deleted_at')
      .where('date', '>=', startDate)
      .select(db.raw('EXTRACT(DOW FROM date::date)::int AS dow'), db.raw('COUNT(*)::int AS cnt'))
      .groupBy('dow')
      .orderBy('cnt', 'desc')
      .first();

    // Busiest hour
    const busiestHourRow = await db('events')
      .where('tenant_id', tenantId)
      .whereNull('deleted_at')
      .where('date', '>=', startDate)
      .whereNotNull('time')
      .select(
        db.raw('SUBSTRING(time::text FROM 1 FOR 2)::int AS hour'),
        db.raw('COUNT(*)::int AS cnt')
      )
      .groupBy('hour')
      .orderBy('cnt', 'desc')
      .first();

    // New clients: client_phone that appeared for the first time in this period
    const newClientsResult = await db.raw(
      `
      SELECT COUNT(*)::int AS cnt
      FROM (
        SELECT client_phone
        FROM events
        WHERE tenant_id = ? AND deleted_at IS NULL AND client_phone IS NOT NULL
        GROUP BY client_phone
        HAVING MIN(date) >= ?
      ) sub
    `,
      [tenantId, startDate]
    );
    const newClientsCount = newClientsResult?.rows?.[0]?.cnt ?? 0;

    // Usage events
    const usageStats = await db('usage_events')
      .where('tenant_id', tenantId)
      .where('created_at', '>=', startDate)
      .select(
        db.raw(
          "SUM(CASE WHEN event_type IN ('CALL_START') THEN value ELSE 0 END)::int AS total_calls"
        ),
        db.raw(
          "SUM(CASE WHEN event_type = 'SMS_INBOUND' THEN value ELSE 0 END)::int AS sms_inbound"
        ),
        db.raw(
          "SUM(CASE WHEN event_type = 'SMS_OUTBOUND' THEN value ELSE 0 END)::int AS sms_outbound"
        )
      )
      .first();

    const cancellationRate = total > 0 ? Math.round((cancelled / total) * 1000) / 10 : 0;
    const noShowRate = confirmed > 0 ? Math.round((noShow / confirmed) * 1000) / 10 : 0;
    const avgPerDay = days > 0 ? Math.round((total / days) * 10) / 10 : 0;

    res.json({
      period: periodLabel,
      totalAppointments: total,
      confirmedAppointments: confirmed,
      cancelledAppointments: cancelled,
      cancellationRate,
      totalCalls: usageStats?.total_calls ?? 0,
      totalSmsInbound: usageStats?.sms_inbound ?? 0,
      totalSmsOutbound: usageStats?.sms_outbound ?? 0,
      noShowRate,
      busiestDay: busiestDayRow ? JOURS_SEMAINE[busiestDayRow.dow] : '-',
      busiestHour:
        busiestHourRow !== null && busiestHourRow !== undefined ? `${busiestHourRow.hour}h` : '-',
      avgAppointmentsPerDay: avgPerDay,
      newClientsCount,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/api/analytics/daily', requireJwt, requireTenant, async (req, res, next) => {
  try {
    const days = _parsePeriod(req.query.period || '30d');
    const periodLabel = `${days}d`;
    const startDate = _dateRangeStart(days);
    const tenantId = req.tenantId;

    if (!dbAvailable) return res.json({ period: periodLabel, data: [] });

    // Appointments per day
    const dailyEvents = await db('events')
      .where('tenant_id', tenantId)
      .whereNull('deleted_at')
      .where('date', '>=', startDate)
      .select(
        'date',
        db.raw('COUNT(*)::int AS appointments'),
        db.raw("COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancellations")
      )
      .groupBy('date')
      .orderBy('date', 'asc');

    // Usage per day (calls + sms)
    const dailyUsage = await db('usage_events')
      .where('tenant_id', tenantId)
      .where('created_at', '>=', startDate)
      .select(
        db.raw('created_at::date AS date'),
        db.raw("SUM(CASE WHEN event_type = 'CALL_START' THEN value ELSE 0 END)::int AS calls"),
        db.raw(
          "SUM(CASE WHEN event_type IN ('SMS_INBOUND','SMS_OUTBOUND') THEN value ELSE 0 END)::int AS sms"
        )
      )
      .groupBy(db.raw('created_at::date'))
      .orderBy('date', 'asc');

    // Merge by date
    const usageMap = {};
    for (const row of dailyUsage) {
      const dateStr =
        typeof row.date === 'string'
          ? row.date.slice(0, 10)
          : new Date(row.date).toISOString().slice(0, 10);
      usageMap[dateStr] = { calls: row.calls, sms: row.sms };
    }

    const data = dailyEvents.map(row => {
      const dateStr =
        typeof row.date === 'string'
          ? row.date.slice(0, 10)
          : new Date(row.date).toISOString().slice(0, 10);
      const usage = usageMap[dateStr] || { calls: 0, sms: 0 };
      return {
        date: dateStr,
        appointments: row.appointments,
        cancellations: row.cancellations,
        calls: usage.calls,
        sms: usage.sms,
      };
    });

    res.json({ period: periodLabel, data });
  } catch (err) {
    next(err);
  }
});

router.get('/api/analytics/services', requireJwt, requireTenant, async (req, res, next) => {
  try {
    const days = _parsePeriod(req.query.period || '30d');
    const periodLabel = `${days}d`;
    const startDate = _dateRangeStart(days);
    const tenantId = req.tenantId;

    if (!dbAvailable) return res.json({ period: periodLabel, data: [] });

    const services = await db('events')
      .where('tenant_id', tenantId)
      .whereNull('deleted_at')
      .where('date', '>=', startDate)
      .whereNotNull('subject')
      .select('subject AS service', db.raw('COUNT(*)::int AS count'))
      .groupBy('subject')
      .orderBy('count', 'desc');

    const totalCount = services.reduce((sum, s) => sum + s.count, 0);

    const data = services.map(s => ({
      service: s.service,
      count: s.count,
      percentage: totalCount > 0 ? Math.round((s.count / totalCount) * 1000) / 10 : 0,
    }));

    res.json({ period: periodLabel, data });
  } catch (err) {
    next(err);
  }
});

// ── Settings salon (JWT-protected, per-tenant) ───────────────────────────────

const DATA_DIR = './data';

// Whitelist: tenant IDs must be alphanumeric with hyphens/underscores only.
const SAFE_TENANT_ID = /^[a-zA-Z0-9_-]+$/;

function _settingsFile(tenantId) {
  if (!tenantId || !SAFE_TENANT_ID.test(tenantId)) {
    throw new Error('Invalid tenant ID');
  }
  return `${DATA_DIR}/settings-${tenantId}.json`;
}

function _readSettings(tenantId) {
  try {
    const file = _settingsFile(tenantId);
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  } catch {
    return {};
  }
}

router.get('/api/settings', requireJwt, requireTenant, (req, res) => {
  res.json(_readSettings(req.tenantId));
});

router.patch('/api/settings', requireJwt, requireTenant, (req, res, next) => {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const current = _readSettings(req.tenantId);
    const updated = { ...current, ...req.body, updatedAt: new Date().toISOString() };
    writeFileSync(_settingsFile(req.tenantId), JSON.stringify(updated, null, 2));
    res.json({ ok: true, settings: updated });
  } catch (err) {
    next(err);
  }
});

// ── Public booking endpoints (no auth) ──────────────────────────────────────

// GET /api/book/:tenantId/info — public salon info for the booking page
router.get('/api/book/:tenantId/info', async (req, res, next) => {
  try {
    const { tenantId } = req.params;

    // Verify tenant exists in DB
    if (dbAvailable) {
      const tenant = await db('tenants').where({ id: tenantId }).select('id', 'name').first();
      if (!tenant)
        return res.status(404).json({ error: 'TENANT_NOT_FOUND', message: 'Salon introuvable' });
    }

    const settings = readTenantSettings(tenantId);

    // If no settings file and no tenant in DB, 404
    if (!settings || (Object.keys(settings).length === 0 && !dbAvailable)) {
      return res.status(404).json({ error: 'TENANT_NOT_FOUND', message: 'Salon introuvable' });
    }

    res.json({
      salonName: settings.salonName || 'Salon',
      openTime: settings.openTime || '09:00',
      closeTime: settings.closeTime || '19:00',
      closedDays: Array.isArray(settings.closedDays) ? settings.closedDays : [],
      services:
        Array.isArray(settings.services) && settings.services.length > 0
          ? settings.services
          : ['Consultation', 'Rendez-vous standard'],
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/book/:tenantId/slots?date=YYYY-MM-DD — available time slots
router.get('/api/book/:tenantId/slots', async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const { date } = req.query;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Le parametre "date" est requis au format YYYY-MM-DD',
      });
    }

    // Check if date is in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const requestedDate = new Date(date + 'T12:00:00');
    requestedDate.setHours(0, 0, 0, 0);
    if (requestedDate < today) {
      return res.json({ date, slots: [] });
    }

    const settings = readTenantSettings(tenantId);
    const openTime = settings.openTime || '09:00';
    const closeTime = settings.closeTime || '19:00';
    const closedDays = Array.isArray(settings.closedDays) ? settings.closedDays : [];

    // Check if it's a closed day (uses same convention as businessHours.js)
    const jsDay = new Date(date + 'T12:00:00').getDay();
    const settingsDay = jsDay === 0 ? 6 : jsDay - 1;
    if (closedDays.includes(settingsDay)) {
      return res.json({ date, slots: [] });
    }

    // Generate 30-min slots between openTime and closeTime
    const [openH, openM] = openTime.split(':').map(Number);
    const [closeH, closeM] = closeTime.split(':').map(Number);
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    const allSlots = [];
    for (let m = openMinutes; m < closeMinutes; m += 30) {
      const hh = String(Math.floor(m / 60)).padStart(2, '0');
      const mm = String(m % 60).padStart(2, '0');
      allSlots.push(`${hh}:${mm}`);
    }

    // Remove already booked slots
    let bookedTimes = [];
    if (dbAvailable) {
      const booked = await db('events')
        .where({ tenant_id: tenantId, date })
        .whereNull('deleted_at')
        .whereNot('status', 'cancelled')
        .select('time');
      bookedTimes = booked.map(e => {
        // Normalize time to HH:MM (handle HH:MM:SS from DB)
        const t = (e.time || '').toString();
        return t.length > 5 ? t.slice(0, 5) : t;
      });
    }

    const availableSlots = allSlots.filter(s => !bookedTimes.includes(s));

    res.json({ date, slots: availableSlots });
  } catch (err) {
    next(err);
  }
});

// POST /api/book/:tenantId — create a public booking
router.post('/api/book/:tenantId', _bookingRateLimit, async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const { clientName, clientPhone, service, date, time } = req.body ?? {};

    // Validate required fields
    if (!clientName || typeof clientName !== 'string' || !clientName.trim()) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Le nom est requis' });
    }
    if (!clientPhone || typeof clientPhone !== 'string' || clientPhone.trim().length < 8) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Le numero de telephone est invalide (min 8 caracteres)',
      });
    }
    if (!service || typeof service !== 'string' || !service.trim()) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Le service est requis' });
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res
        .status(400)
        .json({ error: 'VALIDATION_ERROR', message: 'La date est requise au format YYYY-MM-DD' });
    }
    if (!time || !/^\d{2}:\d{2}$/.test(time)) {
      return res
        .status(400)
        .json({ error: 'VALIDATION_ERROR', message: "L'heure est requise au format HH:MM" });
    }

    // Business hours validation
    const validation = validateBusinessHours(tenantId, date, time);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.code, message: validation.error });
    }

    if (!dbAvailable) {
      return res.status(503).json({ error: 'DB_UNAVAILABLE' });
    }

    // Verify tenant exists
    const tenant = await db('tenants').where({ id: tenantId }).select('id').first();
    if (!tenant) {
      return res.status(404).json({ error: 'TENANT_NOT_FOUND', message: 'Salon introuvable' });
    }

    // Check slot is still available
    const existing = await db('events')
      .where({ tenant_id: tenantId, date, time })
      .whereNull('deleted_at')
      .whereNot('status', 'cancelled')
      .first('id');

    if (existing) {
      return res.status(409).json({ error: 'SLOT_TAKEN', message: 'Ce creneau est deja pris' });
    }

    // Insert event
    await db('events').insert({
      tenant_id: tenantId,
      user_key: 'web-booking',
      subject: service.trim(),
      date,
      time,
      client_phone: clientPhone.trim(),
      status: 'confirmed',
    });

    // Notify staff (fire-and-forget)
    notifyStaff(
      tenantId,
      {
        client_name: clientName.trim(),
        date,
        time,
        service: service.trim(),
      },
      'created'
    ).catch(err => log.warn({ err: err.message }, 'Staff notification failed'));

    res.status(201).json({ ok: true, message: 'Votre rendez-vous est confirme !' });
  } catch (err) {
    next(err);
  }
});

=======
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
// Admin routes are mounted by the application factory in src/api/server.js
