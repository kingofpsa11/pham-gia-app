export function hasPatchValue(body, key) {
  return Object.prototype.hasOwnProperty.call(body || {}, key);
}

export function patchValue(body, existing, key, fallback = null) {
  if (hasPatchValue(body, key)) return body[key];
  return existing?.[key] ?? fallback;
}

export function nullablePatchValue(body, existing, key) {
  if (!hasPatchValue(body, key)) return existing?.[key] ?? null;
  return body[key] || null;
}

export function numericPatchValue(body, existing, key, fallback = 0) {
  if (!hasPatchValue(body, key)) return existing?.[key] ?? fallback;
  return Number(body[key]) || 0;
}
