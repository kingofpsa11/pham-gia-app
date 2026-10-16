export function patchValue(body, existing, key) {
  return Object.prototype.hasOwnProperty.call(body, key) ? body[key] : existing[key];
}

export function patchText(body, existing, key) {
  return patchValue(body, existing, key) || '';
}

export function patchNullable(body, existing, key) {
  return patchValue(body, existing, key) || null;
}

export function patchNumber(body, existing, key, defaultValue = 0) {
  return Number(patchValue(body, existing, key)) || defaultValue;
}
