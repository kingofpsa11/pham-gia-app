import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

export const DEFAULT_JWT_SECRET = 'phamgia_jwt_secret_change_this_2026';

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && secret === DEFAULT_JWT_SECRET) {
    throw new Error('JWT_SECRET must be configured in production');
  }
  return secret;
}

export function assertJwtSecretConfigured() {
  getJwtSecret();
}

export function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, getJwtSecret());
  } catch {
    return null;
  }
}

/** Gắn req.user nếu có Bearer token hợp lệ; không chặn request. */
export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = verifyToken(token);
  if (payload) {
    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
    };
  }
  next();
}

/** Yêu cầu đăng nhập (JWT từ /api/auth/login). */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = verifyToken(token);
  if (!payload?.id) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Vui lòng đăng nhập lại' });
  }
  req.user = {
    id: payload.id,
    email: payload.email,
    role: payload.role,
  };
  next();
}

/** Yêu cầu quyền admin. */
export function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = verifyToken(token);
  if (!payload?.id) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Vui lòng đăng nhập lại' });
  }
  if (payload.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden', message: 'Chỉ quản trị viên mới được phép' });
  }
  req.user = {
    id: payload.id,
    email: payload.email,
    role: payload.role,
  };
  next();
}
