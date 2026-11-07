export const DEFAULT_JWT_SECRET = 'phamgia_jwt_secret_change_this_2026';

export function getJwtSecret(env = process.env) {
  const secret = env.JWT_SECRET;
  if (secret) return secret;
  if (env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be configured in production');
  }
  return DEFAULT_JWT_SECRET;
}
