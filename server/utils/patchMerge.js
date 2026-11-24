export function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj ?? {}, key);
}

export function mergePatchFields(existing, patch, fields) {
  const merged = {};
  for (const field of fields) {
    merged[field] = hasOwn(patch, field) ? patch[field] : existing?.[field];
  }
  return merged;
}

export function nullable(value) {
  return value === '' || value === undefined ? null : value;
}

export function dateInputWithExistingTime(value, existingValue) {
  const raw = String(value || '').trim();
  const existing = String(existingValue || '');
  const existingTime = existing.match(/[ T](\d{2}:\d{2}:\d{2})/)?.[1];
  if (!raw || !existingTime || /\d{1,2}:\d{2}:\d{2}/.test(raw)) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw} ${existingTime}`;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw) || /^\d{1,2}-\d{1,2}-\d{4}$/.test(raw)) {
    return `${raw} ${existingTime}`;
  }
  return value;
}
