import 'dotenv/config';

const DEFAULT_JWT_SECRET = 'phamgia_jwt_secret_change_this_2026';

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET || '';
  if (secret && secret !== DEFAULT_JWT_SECRET) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set to a non-default value in production');
  }

  return secret || DEFAULT_JWT_SECRET;
}
