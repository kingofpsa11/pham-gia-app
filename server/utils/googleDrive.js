import { query, queryOne } from '../db.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export function isGoogleDriveConfigured() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

export function googleRedirectUri() {
  return `${APP_URL}/api/google-drive/callback`;
}

export function buildGoogleAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeCodeForTokens(code) {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: googleRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  return resp.json();
}

async function refreshGoogleToken(refreshToken) {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await resp.json();
  if (!data.access_token) return null;
  return data;
}

async function fetchGoogleEmail(accessToken) {
  const resp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) return '';
  const profile = await resp.json();
  return profile.email || '';
}

export async function saveDriveTokens(userId, tokenData, googleEmail) {
  const expiry = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000);
  const expirySql = expiry.toISOString().slice(0, 19).replace('T', ' ');

  await query(
    `INSERT INTO google_drive_tokens
       (user_id, access_token, refresh_token, token_expiry, google_email)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       access_token = VALUES(access_token),
       refresh_token = IF(VALUES(refresh_token) != '', VALUES(refresh_token), refresh_token),
       token_expiry = VALUES(token_expiry),
       google_email = VALUES(google_email),
       updated_at = CURRENT_TIMESTAMP`,
    [
      userId,
      tokenData.access_token,
      tokenData.refresh_token || '',
      expirySql,
      googleEmail,
    ],
  );
}

export async function getDriveTokenRow(userId) {
  return queryOne(
    `SELECT access_token, refresh_token, token_expiry, google_email
     FROM google_drive_tokens WHERE user_id = ? LIMIT 1`,
    [userId],
  );
}

export async function deleteDriveTokens(userId) {
  await query('DELETE FROM google_drive_tokens WHERE user_id = ?', [userId]);
}

export async function getValidAccessToken(userId) {
  const row = await getDriveTokenRow(userId);
  if (!row?.access_token) return null;

  let accessToken = row.access_token;
  const expiry = row.token_expiry ? new Date(row.token_expiry) : null;
  const needsRefresh = !expiry || expiry.getTime() - Date.now() < 60_000;

  if (needsRefresh && row.refresh_token) {
    const refreshed = await refreshGoogleToken(row.refresh_token);
    if (refreshed?.access_token) {
      accessToken = refreshed.access_token;
      const newExpiry = new Date(Date.now() + (refreshed.expires_in || 3600) * 1000);
      const expirySql = newExpiry.toISOString().slice(0, 19).replace('T', ' ');
      await query(
        `UPDATE google_drive_tokens
         SET access_token = ?, token_expiry = ?, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
        [accessToken, expirySql, userId],
      );
    }
  }

  return accessToken;
}

export async function uploadBufferToDrive(accessToken, fileName, buffer) {
  const metadata = {
    name: fileName,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  const boundary = '-------phamgia_boundary';
  const metaJson = JSON.stringify(metadata);
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaJson}\r\n--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`,
    'utf8',
  );
  const suffix = Buffer.from(`\r\n--${boundary}--`, 'utf8');
  const body = Buffer.concat([prefix, buffer, suffix]);

  const uploadResp = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(body.length),
      },
      body,
    },
  );

  if (!uploadResp.ok) {
    const errText = await uploadResp.text().catch(() => '');
    console.error('Drive upload failed:', uploadResp.status, errText);
    return null;
  }

  return uploadResp.json();
}

export async function completeOAuth(code) {
  const tokenData = await exchangeCodeForTokens(code);
  if (!tokenData.access_token) {
    throw new Error(tokenData.error_description || tokenData.error || 'Token exchange failed');
  }
  const googleEmail = await fetchGoogleEmail(tokenData.access_token);
  return { tokenData, googleEmail };
}

export async function uploadExcelToUserDrive(userId, fileName, buffer) {
  if (!userId) return null;
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return null;
  const result = await uploadBufferToDrive(accessToken, fileName, buffer);
  return result?.webViewLink || null;
}
