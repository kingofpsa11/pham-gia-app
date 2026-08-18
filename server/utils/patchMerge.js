export function mergeOmittedFields(input, existing, fields) {
  const merged = { ...(input || {}) };
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(merged, field) || merged[field] === undefined) {
      merged[field] = existing?.[field] ?? null;
    }
  }
  return merged;
}
