const INSECURE_SECRET_PATTERNS = [
  /change[_-]?this/i,
  /replace[_-]?with/i,
  /^your[_-]?jwt[_-]?secret$/i,
  /^jwt[_-]?secret$/i,
  /^secret$/i,
];

export function getJwtSecret() {
  const secret = (process.env.JWT_SECRET || '').trim();
  if (!secret) {
    throw new Error('JWT_SECRET is required');
  }
  if (secret.length < 32 || INSECURE_SECRET_PATTERNS.some((pattern) => pattern.test(secret))) {
    throw new Error('JWT_SECRET must be a non-placeholder secret with at least 32 characters');
  }
  return secret;
}
