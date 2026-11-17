export function hasPatchField(patch, field) {
  return Object.prototype.hasOwnProperty.call(patch || {}, field);
}

export function patchedValue(patch, existing, field, normalize = (value) => value) {
  if (!hasPatchField(patch, field)) return existing?.[field];
  return normalize(patch[field], existing?.[field]);
}

export function nullableText(value) {
  return value || null;
}

export function nullableValue(value) {
  return value ?? null;
}
