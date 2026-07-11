import { requireAuth } from './auth.js';

export const PUBLIC_API_ROUTES = [
  { method: 'GET', path: '/health' },
  { method: 'POST', path: '/auth/login' },
  { method: 'GET', path: '/google-drive/callback' },
];

function normalizePath(path) {
  if (!path) return '/';
  const withoutQuery = String(path).split('?')[0];
  if (withoutQuery === '/') return withoutQuery;
  return withoutQuery.replace(/\/+$/, '') || '/';
}

export function isPublicApiRoute(req) {
  const method = String(req.method || '').toUpperCase();
  const path = normalizePath(req.path || req.url || req.originalUrl || '');
  return PUBLIC_API_ROUTES.some((route) => route.method === method && route.path === path);
}

export function apiAuthGate(req, res, next) {
  if (isPublicApiRoute(req)) {
    return next();
  }

  return requireAuth(req, res, next);
}
