const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

export function mergeOmittedFields(body, existing, fields) {
  const merged = { ...(body || {}) };
  for (const field of fields) {
    if (!hasOwn(merged, field)) {
      merged[field] = existing?.[field] ?? null;
    }
  }
  return merged;
}

export function hasTimePart(value) {
  return /(?:T|\s)\d{2}:\d{2}(?::\d{2})?/.test(String(value || ''));
}

export function preserveExistingTimeIfDateOnly(parsedDateTime, originalValue, existingDateTime) {
  if (!originalValue || hasTimePart(originalValue)) return parsedDateTime;
  const existingTime = String(existingDateTime || '').match(/(?:T|\s)(\d{2}:\d{2}:\d{2})/);
  if (!existingTime) return parsedDateTime;
  return `${String(parsedDateTime).slice(0, 10)} ${existingTime[1]}`;
}
