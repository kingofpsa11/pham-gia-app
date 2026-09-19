export function mergeOmittedFields(existing, incoming, fields) {
  const merged = { ...(incoming || {}) };
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(merged, field)) {
      merged[field] = existing?.[field];
    }
  }
  return merged;
}

export function preserveExistingTimeForDateOnly(incomingDate, existingDate) {
  const incoming = String(incomingDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(incoming)) return incomingDate;
  const existing = String(existingDate || '').trim();
  const match = existing.match(/^\d{4}-\d{2}-\d{2}[ T](\d{2}:\d{2}:\d{2})/);
  return match ? `${incoming} ${match[1]}` : incomingDate;
}
