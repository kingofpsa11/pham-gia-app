import dotenv from 'dotenv';

dotenv.config();

export const DEFAULT_JWT_SECRET = 'phamgia_jwt_secret_change_this_2026';

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!secret || secret === DEFAULT_JWT_SECRET) {
    if (isProduction) {
      throw new Error('JWT_SECRET must be set to a non-default value in production');
    }
    return DEFAULT_JWT_SECRET;
  }

  return secret;
}

export function assertJwtSecretConfigured() {
  getJwtSecret();
}
