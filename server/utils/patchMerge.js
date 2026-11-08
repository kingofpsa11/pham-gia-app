export function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function fieldOrExisting(body, existing, key) {
  return hasOwn(body, key) ? body[key] : existing?.[key];
}

export function mergeOmittedFields(existing, body, keys) {
  const merged = {};
  for (const key of keys) {
    merged[key] = fieldOrExisting(body, existing, key);
  }
  return merged;
}

export function nullable(value) {
  return value === undefined || value === '' ? null : value;
}
