/** mysql2 can mis-handle LIMIT/OFFSET as prepared params — use safe integers in SQL. */
export function parsePaging(query, defaultLimit = 20) {
  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1);
  const limit = Math.min(
    Math.max(1, parseInt(String(query.limit || String(defaultLimit)), 10) || defaultLimit),
    5000
  );
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function sqlLimitOffset(limit, offset) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 5000);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  return `LIMIT ${safeLimit} OFFSET ${safeOffset}`;
}
