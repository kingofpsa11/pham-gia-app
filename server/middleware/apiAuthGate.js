import { requireAuth } from './auth.js';

const PUBLIC_ROUTES = [
  { method: 'GET', path: '/health' },
  { method: 'POST', path: '/auth/login' },
  { method: 'GET', path: '/google-drive/callback' },
];

function isPublicRoute(req) {
  return PUBLIC_ROUTES.some((route) => route.method === req.method && route.path === req.path);
}

export function apiAuthGate(req, res, next) {
  if (isPublicRoute(req)) return next();
  return requireAuth(req, res, next);
}
