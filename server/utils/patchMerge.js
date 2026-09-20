export function hasOwn(obj, field) {
  return Object.prototype.hasOwnProperty.call(obj || {}, field);
}

export function valueOrExisting(patch, existing, field) {
  return hasOwn(patch, field) ? patch[field] : existing?.[field];
}

export function mergePatchFields(existing, patch, fields) {
  const merged = {};
  for (const field of fields) {
    merged[field] = valueOrExisting(patch, existing, field);
  }
  return merged;
}

export function mergeDateKeepingExistingTime(nextValue, existingValue) {
  const next = String(nextValue || '').trim();
  const existing = String(existingValue || '').trim();
  const dateOnly = next.match(/^(\d{4}-\d{2}-\d{2})$/);
  const existingTime = existing.match(/^\d{4}-\d{2}-\d{2}[ T](\d{2}:\d{2}:\d{2})/);
  if (dateOnly && existingTime) {
    return `${dateOnly[1]} ${existingTime[1]}`;
  }
  return nextValue;
}

