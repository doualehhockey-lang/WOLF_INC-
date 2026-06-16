// src/api/middleware/tenant.js — Multi-tenant isolation middleware.
// Extracts tenantId from the JWT payload (req.user.tenantId) or from the
// X-Tenant-Id header as a fallback, defaulting to 'default'.
// Attaches req.tenantId for downstream route handlers.
//
// IMPORTANT: Mount this middleware AFTER requireJwt so req.user is already set.

/**
 * Express middleware — sets req.tenantId from JWT or X-Tenant-Id header.
 * Falls back to 'default' for backward compatibility with single-tenant usage.
 */
export function requireTenant(req, res, next) {
  // Prefer tenantId from the verified JWT payload (set by requireJwt → verifyAccess).
  if (req.user?.tenantId) {
    req.tenantId = req.user.tenantId;
    return next();
  }
  // Fallback: explicit header — restricted to service-to-service calls (API key auth).
  // Regular JWT-authenticated users MUST have tenantId in their token to prevent isolation bypass.
  const headerTenant = req.headers['x-tenant-id'];
  if (typeof headerTenant === 'string' && headerTenant.trim()) {
    // Only allow header-based tenant override for service accounts (API key auth).
    if (req.user?.method === 'apikey' || req.user?.role === 'service') {
      req.tenantId = headerTenant.trim();
    } else {
      req.tenantId = 'default';
    }
  } else {
    req.tenantId = 'default';
  }
  next();
}
