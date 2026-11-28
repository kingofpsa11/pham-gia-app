function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

export function mergeOmittedFields(body, existing, fields) {
  const merged = { ...(body || {}) };
  for (const field of fields) {
    if (!hasOwn(merged, field) && existing && hasOwn(existing, field)) {
      merged[field] = existing[field];
    }
  }
  return merged;
}

export function hasField(body, field) {
  return hasOwn(body, field);
}

export function preserveTimeForDateOnly(dateValue, existingDateValue) {
  const date = String(dateValue || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return dateValue;

  const existing = String(existingDateValue || '');
  const time = existing.match(/^\d{4}-\d{2}-\d{2}[ T](\d{2}:\d{2}:\d{2})/);
  return time ? `${date} ${time[1]}` : dateValue;
}
