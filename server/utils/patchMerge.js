export function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function patchValue(body, existing, key, normalize = (value) => value) {
  if (!hasOwn(body, key)) return existing?.[key] ?? null;
  return normalize(body[key]);
}

export function nullableValue(value) {
  return value === undefined || value === '' ? null : value;
}

export function emptyStringValue(value) {
  return value === undefined || value === null ? '' : value;
}
