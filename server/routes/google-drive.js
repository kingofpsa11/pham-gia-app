import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../middleware/auth.js';
import {
  isGoogleDriveConfigured,
  buildGoogleAuthUrl,
  completeOAuth,
  googleRedirectUri,
  saveDriveTokens,
  getDriveTokenRow,
  deleteDriveTokens,
} from '../utils/googleDrive.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'phamgia_jwt_secret_change_this_2026';

function buildState(userId, redirect, appOrigin) {
  return jwt.sign(
    { userId, redirect: redirect || '/cai-dat', origin: appOrigin || '' },
    JWT_SECRET,
    { expiresIn: '15m' },
  );
}

function parseState(state) {
  try {
    return jwt.verify(state, JWT_SECRET);
  } catch {
    return null;
  }
}

function redirectToApp(res, origin, path, query) {
  const base = origin || 'http://localhost:5173';
  const qs = query ? `?${query}` : '';
  return res.redirect(`${base}${path}${qs}`);
}

/** GET /api/google-drive/status */
router.get('/google-drive/status', requireAuth, async (req, res) => {
  try {
    if (!isGoogleDriveConfigured()) {
      return res.json({ connected: false, configured: false, google_email: null });
    }
    const row = await getDriveTokenRow(req.user.id);
    return res.json({
      connected: Boolean(row?.access_token),
      configured: true,
      google_email: row?.google_email || null,
    });
  } catch (err) {
    console.error('GET /google-drive/status error:', err.message);
    return res.status(500).json({ error: 'Không thể kiểm tra kết nối Google Drive' });
  }
});

/** GET /api/google-drive/auth-url */
router.get('/google-drive/auth-url', requireAuth, async (req, res) => {
  try {
    if (!isGoogleDriveConfigured()) {
      return res.status(503).json({
        error: 'Chưa cấu hình Google Drive',
        message:
          'Thêm GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET vào file .env, đăng ký redirect URI trong Google Cloud Console, rồi khởi động lại server.',
      });
    }

    const redirect = String(req.query.redirect || '/cai-dat');
    const appOrigin = String(req.query.app_origin || '');
    const state = buildState(req.user.id, redirect, appOrigin);
    const url = buildGoogleAuthUrl(state);

    return res.json({ url });
  } catch (err) {
    console.error('GET /google-drive/auth-url error:', err.message);
    return res.status(500).json({ error: 'Không thể tạo link xác thực Google Drive' });
  }
});

async function handleGoogleCallback(req, res, callbackPath) {
  const stateRaw = String(req.query.state || '');
  const parsed = parseState(stateRaw);
  const redirectPath = parsed?.redirect || '/cai-dat';
  const appOrigin = parsed?.origin || '';
  const oauthRedirectUri = googleRedirectUri(callbackPath);

  try {
    const errorParam = req.query.error;
    if (errorParam) {
      return redirectToApp(res, appOrigin, redirectPath, `drive_error=${encodeURIComponent(String(errorParam))}`);
    }

    const code = req.query.code;
    if (!code || !parsed?.userId) {
      return redirectToApp(res, appOrigin, redirectPath, 'drive_error=invalid_state');
    }

    if (!isGoogleDriveConfigured()) {
      return redirectToApp(res, appOrigin, redirectPath, 'drive_error=not_configured');
    }

    const { tokenData, googleEmail } = await completeOAuth(String(code), oauthRedirectUri);
    await saveDriveTokens(parsed.userId, tokenData, googleEmail);

    return redirectToApp(res, appOrigin, redirectPath, 'drive_connected=1');
  } catch (err) {
    console.error(`GET ${callbackPath} error:`, err.message);
    return redirectToApp(
      res,
      appOrigin,
      redirectPath,
      `drive_error=server_error&detail=${encodeURIComponent(err.message || '')}`,
    );
  }
}

/** GET /api/google-drive/callback — Google OAuth redirect (public) */
router.get('/google-drive/callback', (req, res) =>
  handleGoogleCallback(req, res, '/api/google-drive/callback'),
);

/** Legacy redirect URI (Google Cloud Console cũ) */
router.get('/google/callback', (req, res) =>
  handleGoogleCallback(req, res, '/api/google/callback'),
);

/** DELETE /api/google-drive/disconnect */
router.delete('/google-drive/disconnect', requireAuth, async (req, res) => {
  try {
    await deleteDriveTokens(req.user.id);
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /google-drive/disconnect error:', err.message);
    return res.status(500).json({ error: 'Không thể ngắt kết nối Google Drive' });
  }
});

export default router;
