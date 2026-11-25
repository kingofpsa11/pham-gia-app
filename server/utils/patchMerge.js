export function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

export function patchValue(body, existing, key) {
  return hasOwn(body, key) ? body[key] : existing?.[key];
}

export function patchNullable(body, existing, key) {
  const value = patchValue(body, existing, key);
  return value === '' || value === undefined ? null : value;
}

export function patchString(body, existing, key, fallback = '') {
  const value = patchValue(body, existing, key);
  return value === undefined || value === null ? fallback : value;
}

export function patchNumber(body, existing, key, fallback = 0) {
  const value = patchValue(body, existing, key);
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
