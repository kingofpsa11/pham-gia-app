import { requireAuth } from './auth.js';

const PUBLIC_API_PATHS = new Set([
  '/health',
  '/auth/login',
  '/google-drive/callback',
]);

export function apiAuthGate(req, res, next) {
  if (req.method === 'OPTIONS' || PUBLIC_API_PATHS.has(req.path)) {
    return next();
  }
  return requireAuth(req, res, next);
}
