export function preserveOmittedFields(input, existing, fieldNames) {
  const source = input || {};
  const current = existing || {};
  const merged = { ...source };
  for (const field of fieldNames) {
    if (!Object.prototype.hasOwnProperty.call(source, field)) {
      merged[field] = current[field];
    }
  }
  return merged;
}
