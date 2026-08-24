const DEFAULT_JWT_SECRET = 'phamgia_jwt_secret_change_this_2026';

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && secret === DEFAULT_JWT_SECRET) {
    const err = new Error('JWT_SECRET must be configured in production');
    err.status = 500;
    throw err;
  }
  return secret;
}
