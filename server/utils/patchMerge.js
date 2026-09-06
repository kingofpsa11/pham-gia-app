export function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

export function mergeOmittedFields(patch, existing, fields) {
  const merged = { ...(patch || {}) };
  for (const field of fields) {
    if (!hasOwn(merged, field)) {
      merged[field] = existing?.[field];
    }
  }
  return merged;
}

export function preserveExistingTimeForDateOnly(nextValue, existingValue) {
  const next = String(nextValue || '').trim();
  const existing = String(existingValue || '').trim();
  const nextDate = next.match(/^(\d{4}-\d{2}-\d{2})$/);
  const existingDateTime = existing.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (nextDate && existingDateTime && nextDate[1] === existingDateTime[1]) {
    return `${nextDate[1]} ${existingDateTime[2]}`;
  }
  return nextValue;
}
