const hasOwn = Object.prototype.hasOwnProperty;

export function hasOwnField(obj, field) {
  return hasOwn.call(obj || {}, field);
}

export function mergeMissingFields(existing, patch, fields) {
  const merged = { ...(patch || {}) };
  for (const field of fields) {
    if (!hasOwnField(merged, field)) {
      merged[field] = existing?.[field];
    }
  }
  return merged;
}
