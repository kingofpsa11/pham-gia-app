import { requireAuth } from './auth.js';

export function isPublicApiRequest(req) {
  // /api/auth is mounted before this gate. The Google OAuth redirect must stay
  // public so Google can complete the browser callback.
  return req.method === 'GET' && req.path === '/google-drive/callback';
}

export function apiAuthGate(req, res, next) {
  if (isPublicApiRequest(req)) return next();
  return requireAuth(req, res, next);
}
