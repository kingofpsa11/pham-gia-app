export const DEFAULT_JWT_SECRET = 'phamgia_jwt_secret_change_this_2026';

export function getJwtSecret() {
  const configured = process.env.JWT_SECRET;
  const secret = configured || DEFAULT_JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && (!configured || configured === DEFAULT_JWT_SECRET)) {
    throw new Error('JWT_SECRET must be set to a non-default value in production');
  }
  return secret;
}
