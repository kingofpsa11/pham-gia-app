export function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

export function patchValue(body, existing, key, normalize = (value) => value) {
  if (hasOwn(body, key)) return normalize(body[key]);
  return existing?.[key] ?? null;
}
