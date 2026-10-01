export function mergeMissingFields(body, existing, fields) {
  const merged = { ...(body || {}) };
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(merged, field)) {
      merged[field] = existing?.[field];
    }
  }
  return merged;
}

export function mergeDateWithExistingTime(dateValue, existingDateTime) {
  const dateOnly = String(dateValue || '').match(/^(\d{4}-\d{2}-\d{2})$/);
  const existingTime = String(existingDateTime || '').match(/\d{4}-\d{2}-\d{2}[ T](\d{2}:\d{2}:\d{2})/);
  if (!dateOnly || !existingTime) return dateValue;
  return `${dateOnly[1]} ${existingTime[1]}`;
}
