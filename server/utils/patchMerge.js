export function hasOwnValue(source, key) {
  return Object.prototype.hasOwnProperty.call(source ?? {}, key);
}

export function patchValue(source, existing, key) {
  return hasOwnValue(source, key) ? source[key] : existing?.[key];
}
