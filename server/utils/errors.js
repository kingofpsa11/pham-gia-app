export function isDbConnectionError(err) {
  const code = err?.code || '';
  return (
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'PROTOCOL_CONNECTION_LOST' ||
    code === 'ER_ACCESS_DENIED_ERROR'
  );
}

export function dbErrorResponse(res, err, fallbackMessage) {
  console.error(fallbackMessage, err.message);
  if (isDbConnectionError(err)) {
    return res.status(503).json({
      error: 'Không kết nối được database',
      message:
        'Hãy mở SSH tunnel: ssh -L 3307:localhost:3306 root@165.22.98.160 rồi chạy lại npm run server',
      code: err.code,
    });
  }
  return res.status(500).json({
    error: fallbackMessage,
    message: err.message,
  });
}
