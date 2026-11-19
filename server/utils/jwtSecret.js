export const DEFAULT_JWT_SECRET = 'phamgia_jwt_secret_change_this_2026';

export function getJwtSecret({ env = process.env } = {}) {
  const configured = env.JWT_SECRET;
  if (env.NODE_ENV === 'production' && (!configured || configured === DEFAULT_JWT_SECRET)) {
    throw new Error('JWT_SECRET must be set to a strong non-default value in production');
  }
  return configured || DEFAULT_JWT_SECRET;
}
