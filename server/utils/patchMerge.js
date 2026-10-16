export function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

export function patchValue(body, existing, key) {
  return hasOwn(body, key) ? body[key] : existing?.[key];
}

export function nullableValue(value) {
  return value === undefined || value === '' ? null : value;
}
