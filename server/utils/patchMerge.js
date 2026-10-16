export function hasPatchField(body, field) {
  return Object.prototype.hasOwnProperty.call(body || {}, field);
}

export function patchValue(body, existing, field) {
  return hasPatchField(body, field) ? body[field] : existing?.[field];
}

export function patchString(body, existing, field, defaultValue = '') {
  const value = patchValue(body, existing, field);
  return value ?? defaultValue;
}

export function patchNullable(body, existing, field) {
  const value = patchValue(body, existing, field);
  return value || null;
}

export function patchNumber(body, existing, field, defaultValue = 0) {
  const value = patchValue(body, existing, field);
  return value ?? defaultValue;
}
