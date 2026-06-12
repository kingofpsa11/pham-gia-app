const LEGACY_DEFAULT_JWT_SECRET = 'phamgia_jwt_secret_change_this_2026';

export function getJwtSecret() {
  const secret = (process.env.JWT_SECRET || '').trim();

  if (!secret || secret === LEGACY_DEFAULT_JWT_SECRET) {
    throw new Error('JWT_SECRET must be set to a unique, non-default secret');
  }

  return secret;
}

export function assertJwtSecretConfigured() {
  getJwtSecret();
}
