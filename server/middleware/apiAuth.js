import { requireAuth } from './auth.js';

const PUBLIC_API_ROUTES = [
  { method: 'GET', path: '/health' },
  { method: 'POST', path: '/auth/login' },
  { method: 'GET', path: '/google-drive/callback' },
];

export function isPublicApiRequest(req) {
  return PUBLIC_API_ROUTES.some(
    (route) => req.method === route.method && req.path === route.path,
  );
}

export function requireApiAuth(req, res, next) {
  if (isPublicApiRequest(req)) return next();
  return requireAuth(req, res, next);
}
