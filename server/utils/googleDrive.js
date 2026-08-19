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

export const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';

export function isDriveFolder(file) {
  return Boolean(file?.id) && file.mimeType === FOLDER_MIME && file.trashed !== true;
}

export function foldDriveName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function driveNamesEqual(a, b) {
  return foldDriveName(a) === foldDriveName(b);
}

function driveEscape(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export async function driveApi(accessToken, path, { method = 'GET', query: qs, body, apiVersion = 'v3' } = {}) {
  const version = apiVersion === 'v2' ? 'v2' : 'v3';
  const url = new URL(`https://www.googleapis.com/drive/${version}/${path.replace(/^\//, '')}`);
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

export async function getDriveFile(accessToken, fileId, fields = 'id,name,mimeType,webViewLink,trashed,parents,createdTime,shortcutDetails') {
  if (!fileId) return null;
  try {
    return await driveApi(accessToken, `files/${fileId}`, { qs: { fields, supportsAllDrives: 'true' } });
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

async function listDriveFiles(accessToken, q, pageSize = 50, maxFiles = 50) {
  const files = [];
  let pageToken = '';
  const limit = Math.max(1, Number(maxFiles) || 50);
  do {
    const data = await driveApi(accessToken, 'files', {
      qs: {
        q,
        pageSize: String(Math.max(1, Math.min(pageSize, limit - files.length))),
        fields: 'nextPageToken,files(id,name,parents,mimeType,trashed,shortcutDetails,webViewLink,createdTime)',
        supportsAllDrives: 'true',
        ...(pageToken ? { pageToken } : {}),
      },
    });
    files.push(...(data.files || []).filter((f) => f?.id && f.trashed !== true));
    pageToken = data.nextPageToken || '';
  } while (pageToken && files.length < limit);
  return files;
}

function uniqueById(files) {
  const seen = new Set();
  const out = [];
  for (const f of files || []) {
    if (!f?.id || seen.has(f.id)) continue;
    seen.add(f.id);
    out.push(f);
  }
  return out;
}

function queryLooksHonored(files, expectedName) {
  if (!files.length) return true;
  if (files.length > 20) return false;
  if (!expectedName) return files.length <= 20;
  return files.every((f) => driveNamesEqual(f.name, expectedName));
}

function looksLikeGlobalFolderDump(files) {
  if ((files || []).length >= 40) return true;
  const names = (files || []).map((f) => foldDriveName(f.name));
  const hasYear = names.some((n) => /^\d{4}$/.test(n));
  const hasHopDong = names.includes(foldDriveName('Hợp đồng'));
  const hasBV = names.includes('bv');
  const hasDauRa = names.includes(foldDriveName('Đầu ra'));
  if (hasYear && hasHopDong && (hasBV || hasDauRa)) return true;
  const contractLike = (files || []).filter((f) => /^\d{1,2}\s+\S+/.test(String(f.name || ''))).length;
  return contractLike >= 3;
}

export async function searchDriveFolders(accessToken, q, pageSize = 50, maxFiles = 50) {
  const files = await listDriveFiles(accessToken, q, pageSize, maxFiles);
  return files.filter((f) => isDriveFolder(f));
}

export async function resolveToFolder(accessToken, fileOrId) {
  if (!fileOrId) return null;
  let file = typeof fileOrId === 'string'
    ? await getDriveFile(accessToken, fileOrId)
    : fileOrId;
  if (!file?.id || file.trashed === true) return null;
  if (!file.mimeType) {
    file = await getDriveFile(accessToken, file.id) || file;
  }
  if (file.mimeType === SHORTCUT_MIME) {
    const targetId = file.shortcutDetails?.targetId
      || (await getDriveFile(accessToken, file.id, 'id,shortcutDetails'))?.shortcutDetails?.targetId;
    if (!targetId) return null;
    const target = await getDriveFile(accessToken, targetId);
    return isDriveFolder(target) ? target : null;
  }
  if (isDriveFolder(file)) return file;
  if (file.id && !file.mimeType) {
    const again = await getDriveFile(accessToken, file.id);
    return isDriveFolder(again) ? again : null;
  }
  return null;
}

export async function listDirectItems(accessToken, parentId, maxFiles = 25, { strict = true } = {}) {
  const parent = parentId || 'root';
  const files = await listDriveFiles(
    accessToken,
    `'${driveEscape(parent)}' in parents and trashed=false`,
    maxFiles,
    maxFiles,
  );
  const withParent = files.filter((f) => (f.parents || []).includes(parent));
  if (withParent.length) return withParent;
  if (!strict) return files;
  if (!files.length || looksLikeGlobalFolderDump(files)) return [];
  if (files.length <= 20) return files;
  return [];
}

export async function findFoldersByNames(accessToken, names) {
  const wanted = [...new Set((names || []).map((n) => String(n || '').trim()).filter(Boolean))];
  if (!wanted.length) return [];
  const matches = [];
  for (const name of wanted) {
    let files = await listDriveFiles(
      accessToken,
      `name='${driveEscape(name)}' and trashed=false`,
      50,
      50,
    );
    if (!files.some((f) => wanted.some((n) => driveNamesEqual(f.name, n)))) {
      files = await listDriveFiles(
        accessToken,
        `name contains '${driveEscape(name)}' and trashed=false`,
        50,
        50,
      );
    }
    for (const f of files) {
      if (!wanted.some((n) => driveNamesEqual(f.name, n))) continue;
      const resolved = await resolveToFolder(accessToken, f.id || f);
      if (resolved) matches.push(resolved);
      else if (f.id) matches.push(f);
    }
  }
  return uniqueById(matches);
}

export async function findFolderByNames(accessToken, names) {
  const found = await findFoldersByNames(accessToken, names);
  return found[0] || null;
}

export async function listChildFolders(accessToken, parentId) {
  const parent = parentId || 'root';
  const files = await searchDriveFolders(
    accessToken,
    `'${driveEscape(parent)}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`,
    50,
    50,
  );
  const withParent = files.filter((f) => (f.parents || []).includes(parent));
  if (withParent.length) return withParent;
  if (!files.length || looksLikeGlobalFolderDump(files)) return [];
  if (queryLooksHonored(files)) return files;
  return [];
}

function foldersNamed(files, want) {
  return uniqueById((files || []).filter((f) => isDriveFolder(f) && driveNamesEqual(f.name, want)));
}

function sortOldestFirst(files) {
  return [...(files || [])].sort((a, b) =>
    String(a.createdTime || '').localeCompare(String(b.createdTime || '')),
  );
}

export async function findAllFoldersNamed(accessToken, name, maxFiles = 100) {
  const want = String(name || '').trim();
  if (!want) return [];
  const files = await listDriveFiles(
    accessToken,
    `name='${driveEscape(want)}' and mimeType='${FOLDER_MIME}' and trashed=false`,
    100,
    maxFiles,
  );
  return foldersNamed(files, want);
}

export async function moveToParent(accessToken, fileId, parentId) {
  if (!fileId || !parentId || parentId === 'root') {
    return getDriveFile(accessToken, fileId);
  }
  try {
    const current = await getDriveFile(accessToken, fileId, 'id,name,mimeType,parents,webViewLink,trashed');
    const oldParents = current?.parents || [];
    const removeParents = oldParents.filter((p) => p !== parentId);
    return await driveApi(accessToken, `files/${fileId}`, {
      method: 'PATCH',
      qs: {
        addParents: parentId,
        ...(removeParents.length ? { removeParents: removeParents.join(',') } : {}),
        supportsAllDrives: 'true',
        fields: 'id,name,mimeType,parents,webViewLink,trashed,createdTime',
      },
    });
  } catch (err) {
    console.warn('moveToParent:', err.message || err);
    return getDriveFile(accessToken, fileId);
  }
}

export async function findChildFolder(accessToken, parentId, name) {
  const want = String(name || '').trim();
  if (!want || !parentId) return null;

  const queried = await listDriveFiles(
    accessToken,
    `'${driveEscape(parentId)}' in parents and name='${driveEscape(want)}' and mimeType='${FOLDER_MIME}' and trashed=false`,
    50,
    50,
  );
  const named = foldersNamed(queried, want);
  const underParent = named.filter((f) => (f.parents || []).includes(parentId));
  if (underParent.length) return sortOldestFirst(underParent)[0];
  if (named.length && queryLooksHonored(queried, want)) return sortOldestFirst(named)[0];

  if (/^\d{4}$/.test(want)) {
    const all = await findAllFoldersNamed(accessToken, want, 100);
    if (all.length) return sortOldestFirst(all)[0];
  }
  return null;
}

export async function createDriveFolder(accessToken, name, parentId) {
  let parent = parentId || undefined;
  if (parent && parent !== 'root') {
    const real = await resolveToFolder(accessToken, parent);
    parent = real?.id || parent;
  }
  const created = await driveApi(accessToken, 'files', {
    method: 'POST',
    qs: { fields: 'id,name,mimeType,webViewLink,parents', supportsAllDrives: 'true' },
    body: {
      name,
      mimeType: FOLDER_MIME,
      parents: parent ? [parent] : undefined,
    },
  });
  if (!isDriveFolder(created)) {
    const err = new Error('Google Drive trả về file không phải thư mục');
    err.status = 500;
    throw err;
  }
  if (!parent) return created;
  return enforceFolderParent(accessToken, created, parent);
}

/** Chia sẻ folder cho email khác (Drive 404 nếu mở bằng tài khoản không có quyền). */
export async function shareDriveFile(accessToken, fileId, email, role = 'writer') {
  const address = String(email || '').trim().toLowerCase();
  if (!fileId || !address || !address.includes('@')) return false;
  try {
    await driveApi(accessToken, `files/${fileId}/permissions`, {
      method: 'POST',
      qs: {
        supportsAllDrives: 'true',
        sendNotificationEmail: 'false',
      },
      body: {
        type: 'user',
        role,
        emailAddress: address,
      },
    });
    return true;
  } catch (err) {
    const msg = String(err?.message || '');
    if (err?.status === 400 || err?.status === 409 || /already|exists|owner/i.test(msg)) {
      return true;
    }
    console.warn('shareDriveFile:', address, err.message || err);
    return false;
  }
}

export async function renameDriveFile(accessToken, fileId, name) {
  return driveApi(accessToken, `files/${fileId}`, {
    method: 'PATCH',
    qs: { fields: 'id,name,webViewLink,trashed,parents', supportsAllDrives: 'true' },
    body: { name },
  });
}

export async function ensureChildFolder(accessToken, parentId, name, { fallbackRoot = true } = {}) {
  let parent = parentId || 'root';
  if (parent !== 'root') {
    const parentFile = await resolveToFolder(accessToken, parent);
    if (!isDriveFolder(parentFile)) {
      if (!fallbackRoot) {
        const err = new Error('Thư mục cha không hợp lệ trên Google Drive');
        err.status = 400;
        throw err;
      }
      parent = 'root';
    } else {
      parent = parentFile.id;
    }
  }
  const existing = await findChildFolder(accessToken, parent, name);
  if (isDriveFolder(existing) && driveNamesEqual(existing.name, name)) {
    return { ...existing, created: false };
  }
  if (/^\d{4}$/.test(String(name || '').trim())) {
    const named = await findAllFoldersNamed(accessToken, name, 50);
    if (named.length) {
      const under = named.filter((f) => (f.parents || []).includes(parent));
      const pick = (under[0] || sortOldestFirst(named)[0]);
      if (pick) return { ...pick, created: false };
    }
  }
  const created = await createDriveFolder(accessToken, name, parent);
  return { ...created, created: true };
}

function fromV2File(file) {
  if (!file?.id) return file;
  const parents = Array.isArray(file.parents)
    ? file.parents.map((p) => (typeof p === 'string' ? p : p?.id)).filter(Boolean)
    : [];
  return {
    ...file,
    name: file.name || file.title,
    webViewLink: file.webViewLink || file.alternateLink,
    parents: parents.length ? parents : file.parents,
  };
}

export async function listChildIdsV2(accessToken, folderId) {
  if (!folderId) return [];
  const data = await driveApi(accessToken, `files/${folderId}/children`, {
    apiVersion: 'v2',
    qs: { maxResults: '200' },
  });
  return [...new Set((data?.items || []).map((item) => item?.id).filter(Boolean))];
}

export async function listChildrenV2(accessToken, folderId) {
  const ids = await listChildIdsV2(accessToken, folderId);
  const out = [];
  for (const id of ids) {
    const file = await getDriveFile(accessToken, id);
    if (file && file.trashed !== true) out.push(fromV2File(file));
  }
  return out;
}

export async function insertChildV2(accessToken, parentId, childId) {
  if (!parentId || !childId) return false;
  try {
    await driveApi(accessToken, `files/${parentId}/children`, {
      method: 'POST',
      apiVersion: 'v2',
      body: { id: childId },
    });
    return true;
  } catch (err) {
    const msg = String(err?.message || '');
    if (err?.status === 409 || /already/i.test(msg)) return true;
    console.warn('insertChildV2:', err.message || err);
    return false;
  }
}

export async function enforceFolderParent(accessToken, folder, parentId) {
  if (!folder?.id || !parentId) return folder;
  await insertChildV2(accessToken, parentId, folder.id);
  const moved = await moveToParent(accessToken, folder.id, parentId);
  return isDriveFolder(moved) ? moved : folder;
}

export async function createChildFolder(accessToken, name, parentId) {
  const parentFile = parentId && parentId !== 'root'
    ? await resolveToFolder(accessToken, parentId)
    : null;
  const parent = parentFile?.id || parentId || undefined;

  let created = null;
  try {
    const raw = await driveApi(accessToken, 'files', {
      method: 'POST',
      apiVersion: 'v2',
      qs: { supportsAllDrives: 'true' },
      body: {
        title: name,
        mimeType: FOLDER_MIME,
        parents: parent ? [{ id: parent }] : undefined,
      },
    });
    created = fromV2File(raw);
    if (created && !created.mimeType) created.mimeType = FOLDER_MIME;
  } catch (err) {
    console.warn('createChildFolder v2:', err.message || err);
  }

  if (!isDriveFolder(created)) {
    created = await createDriveFolder(accessToken, name, parent);
  }
  if (!isDriveFolder(created) || !parent) return created;
  return enforceFolderParent(accessToken, created, parent);
}
