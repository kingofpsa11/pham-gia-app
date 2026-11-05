export function hasPatchValue(patch, key) {
  return Object.prototype.hasOwnProperty.call(patch ?? {}, key);
}

export function patchValue(patch, existing, key, fallback = null) {
  if (hasPatchValue(patch, key)) return patch[key];
  if (existing && Object.prototype.hasOwnProperty.call(existing, key)) {
    return existing[key];
  }
  return fallback;
}

export function patchNullable(patch, existing, key) {
  const value = patchValue(patch, existing, key);
  return value === undefined || value === '' ? null : value;
}

export function patchText(patch, existing, key, fallback = '') {
  const value = patchValue(patch, existing, key, fallback);
  return value == null ? fallback : value;
}
