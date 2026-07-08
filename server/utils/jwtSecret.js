export const DEFAULT_JWT_SECRET = 'phamgia_jwt_secret_change_this_2026';

export function getJwtSecret() {
  const configuredSecret = process.env.JWT_SECRET?.trim();
  const secret = configuredSecret || DEFAULT_JWT_SECRET;

  if (process.env.NODE_ENV === 'production' && secret === DEFAULT_JWT_SECRET) {
    throw new Error('JWT_SECRET must be set to a unique value in production');
  }

  return secret;
}
