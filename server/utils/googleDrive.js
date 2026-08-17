import { query, queryOne } from '../db.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const GOOGLE_REDIRECT_PATH =
  process.env.GOOGLE_REDIRECT_PATH || '/api/google-drive/callback';
const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export function isGoogleDriveConfigured() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

export function googleRedirectUri(path = GOOGLE_REDIRECT_PATH) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${APP_URL}${normalized}`;
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

async function exchangeCodeForTokens(code, redirectUri = googleRedirectUri()) {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
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
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,mimeType,webViewLink,webContentLink',
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

  const data = await uploadResp.json();
  if (data.mimeType === 'application/vnd.google-apps.spreadsheet') {
    console.warn('Drive converted xlsx to Google Sheets:', data.id);
  }
  return data;
}

export async function completeOAuth(code, redirectUri) {
  const tokenData = await exchangeCodeForTokens(code, redirectUri || googleRedirectUri());
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
  if (!result?.id) return null;
  // Link tải trực tiếp file .xlsx (không mở Google Sheets editor)
  return result.webContentLink || `https://drive.google.com/uc?export=download&id=${result.id}`;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

function driveEscape(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export async function driveApi(accessToken, path, { method = 'GET', query: qs, body } = {}) {
  const url = new URL(`https://www.googleapis.com/drive/v3/${path.replace(/^\//, '')}`);
  if (qs) {
    for (const [k, v] of Object.entries(qs)) {
      if (v != null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  let resp;
  try {
    resp = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      const timeoutErr = new Error('Google Drive hết thời gian chờ');
      timeoutErr.status = 504;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  const text = await resp.text().catch(() => '');
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!resp.ok) {
    const msg = data?.error?.message || data?.error_description || text || `Drive HTTP ${resp.status}`;
    const err = new Error(msg);
    err.status = resp.status;
    err.code = data?.error?.errors?.[0]?.reason || data?.error?.status;
    throw err;
  }
  return data;
}

export async function getDriveFile(accessToken, fileId, fields = 'id,name,webViewLink,trashed,parents') {
  if (!fileId) return null;
  try {
    return await driveApi(accessToken, `files/${fileId}`, { qs: { fields, supportsAllDrives: 'true' } });
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

export async function searchDriveFolders(accessToken, q, pageSize = 50, maxFiles = 50) {
  const files = [];
  let pageToken = '';
  const limit = Math.max(1, Number(maxFiles) || 50);
  do {
    const data = await driveApi(accessToken, 'files', {
      qs: {
        q,
        spaces: 'drive',
        pageSize: String(Math.max(1, Math.min(pageSize, limit - files.length))),
        fields: 'nextPageToken,files(id,name,parents)',
        corpora: 'user',
        ...(pageToken ? { pageToken } : {}),
      },
    });
    files.push(...(data.files || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken && files.length < limit);
  return files;
}

export async function listChildFolders(accessToken, parentId) {
  const parent = parentId || 'root';
  return searchDriveFolders(
    accessToken,
    `'${driveEscape(parent)}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`,
    100,
    200,
  );
}

export async function findChildFolder(accessToken, parentId, name) {
  const safe = driveEscape(name);
  const parent = parentId || 'root';
  const files = await searchDriveFolders(
    accessToken,
    `'${driveEscape(parent)}' in parents and name='${safe}' and mimeType='${FOLDER_MIME}' and trashed=false`,
    10,
  );
  return files[0] || null;
}

export async function createDriveFolder(accessToken, name, parentId) {
  return driveApi(accessToken, 'files', {
    method: 'POST',
    qs: { fields: 'id,name,webViewLink,parents', supportsAllDrives: 'true' },
    body: {
      name,
      mimeType: FOLDER_MIME,
      parents: parentId ? [parentId] : undefined,
    },
  });
}

export async function renameDriveFile(accessToken, fileId, name) {
  return driveApi(accessToken, `files/${fileId}`, {
    method: 'PATCH',
    qs: { fields: 'id,name,webViewLink,trashed,parents', supportsAllDrives: 'true' },
    body: { name },
  });
}

export async function ensureChildFolder(accessToken, parentId, name) {
  const existing = await findChildFolder(accessToken, parentId, name);
  if (existing) return { ...existing, created: false };
  const created = await createDriveFolder(accessToken, name, parentId);
  return { ...created, created: true };
}
