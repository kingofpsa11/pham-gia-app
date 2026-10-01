function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

export function mergeOmittedFields(existing, incoming, fields) {
  const merged = { ...(incoming || {}) };
  for (const field of fields) {
    if (!hasOwn(merged, field)) {
      merged[field] = existing?.[field] ?? null;
    }
  }
  return merged;
}

export function hasProvidedField(obj, key) {
  return hasOwn(obj, key);
}
