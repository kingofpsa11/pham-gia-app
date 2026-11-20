export function mergeOmittedFields(existing, incoming, fields) {
  const merged = { ...(incoming || {}) };
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(merged, field)) {
      merged[field] = existing?.[field] ?? null;
    }
  }
  return merged;
}

