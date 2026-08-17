import { parseNamFromDate } from './soTrungNam.js';
import { parseSoHopDongBan } from './soChungTu.js';
import { query, queryOne } from '../db.js';
import {
  getValidAccessToken,
  getDriveFile,
  searchDriveFolders,
  listChildFolders,
  ensureChildFolder,
  renameDriveFile,
} from './googleDrive.js';

const SUBFOLDERS = ['BV', 'Đầu ra', 'Đầu vào'];
const HOP_DONG_DIR = 'Hợp đồng';
const CACHE_KEY = 'drive_folder_cache';

export function sanitizeDriveName(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function shortKhachHang(ten) {
  let s = sanitizeDriveName(ten);
  const prefixes = [
    /^công ty tnhh mtv\s+/i,
    /^công ty tnhh\s+/i,
    /^công ty cổ phần\s+/i,
    /^công ty cp\s+/i,
    /^công ty\s+/i,
    /^cty tnhh\s+/i,
    /^cty cp\s+/i,
    /^cty\s+/i,
    /^cong ty tnhh mtv\s+/i,
    /^cong ty tnhh\s+/i,
    /^cong ty co phan\s+/i,
    /^cong ty cp\s+/i,
    /^cong ty\s+/i,
  ];
  for (const re of prefixes) s = s.replace(re, '');
  const words = s.split(' ').filter(Boolean);
  if (!words.length) return 'KH';
  if (words[0].length <= 2 && words[1]) return `${words[0]} ${words[1]}`.slice(0, 24);
  return words[0].slice(0, 24);
}

export function shortDuAn(ten) {
  return sanitizeDriveName(ten).slice(0, 40);
}

export function sttTuSoHopDong(soHopDong) {
  const parsed = parseSoHopDongBan(soHopDong);
  return parsed?.stt || null;
}

export function buildTenFolderHopDong(soHopDong, tenKhachHang, tenDuAn, sttOverride) {
  const stt = sttOverride || sttTuSoHopDong(soHopDong) || 1;
  const sttStr = String(stt).padStart(2, '0');
  const kh = shortKhachHang(tenKhachHang);
  const duAn = shortDuAn(tenDuAn);
  if (kh && duAn) return `${sttStr} ${kh} - ${duAn}`;
  if (kh) return `${sttStr} ${kh}`;
  if (duAn) return `${sttStr} ${duAn}`;
  return sttStr;
}

function folderStt(name) {
  const m = String(name || '').trim().match(/^(\d{1,4})(?:\s|$)/);
  return m ? parseInt(m[1], 10) : null;
}

function findFolderByStt(folders, stt) {
  const prefix = String(stt).padStart(2, '0');
  return (folders || []).find((f) => new RegExp(`^${prefix}(?:\\s|$)`).test(String(f.name || '').trim()));
}

async function loadCache() {
  try {
    const row = await queryOne('SELECT value FROM cau_hinh WHERE `key` = ?', [CACHE_KEY]);
    if (!row?.value) return {};
    return JSON.parse(row.value);
  } catch {
    return {};
  }
}

async function saveCache(cache) {
  try {
    const value = JSON.stringify(cache);
    const existing = await queryOne('SELECT `key` FROM cau_hinh WHERE `key` = ?', [CACHE_KEY]);
    if (existing) {
      await query('UPDATE cau_hinh SET value = ?, updated_at = NOW() WHERE `key` = ?', [value, CACHE_KEY]);
    } else {
      await query('INSERT INTO cau_hinh (`key`, value, updated_at) VALUES (?, ?, NOW())', [CACHE_KEY, value]);
    }
  } catch (err) {
    console.warn('drive_folder_cache save skipped:', err.message);
  }
}

async function validCachedFolder(accessToken, id) {
  if (!id) return null;
  const file = await getDriveFile(accessToken, id, 'id,name,trashed');
  if (!file || file.trashed) return null;
  return file;
}

async function findPhamGiaRoot(accessToken, cache) {
  const cached = await validCachedFolder(accessToken, cache.rootId);
  if (cached) return cached;

  const names = ['00 Phạm Gia', 'Phạm Gia'];
  for (const name of names) {
    const found = await searchDriveFolders(
      accessToken,
      `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      5,
      5,
    );
    if (found[0]) {
      cache.rootId = found[0].id;
      await saveCache(cache);
      return found[0];
    }
  }
  return null;
}

async function ensureYearFolder(accessToken, nam, cache) {
  const yearName = String(nam);
  cache.years = cache.years || {};
  const cached = await validCachedFolder(accessToken, cache.years[yearName]);
  if (cached) return cached;

  const root = await findPhamGiaRoot(accessToken, cache);
  const parentId = root?.id || 'root';
  const yearFolder = await ensureChildFolder(accessToken, parentId, yearName);
  cache.years[yearName] = yearFolder.id;
  if (root?.id) cache.rootId = root.id;
  await saveCache(cache);
  return yearFolder;
}

async function ensureSubfolders(accessToken, parentId) {
  const created = await Promise.all(SUBFOLDERS.map((name) => ensureChildFolder(accessToken, parentId, name)));
  const ids = {};
  SUBFOLDERS.forEach((name, i) => {
    ids[name] = created[i].id;
  });
  return ids;
}

function permissionHint(err) {
  const status = err?.status;
  const msg = String(err?.message || '');
  if (status === 403 || /insufficient|access not granted|scope/i.test(msg)) {
    return 'Google Drive chưa đủ quyền tạo thư mục. Vào Cài đặt → Google Drive, ngắt kết nối rồi kết nối lại.';
  }
  if (status === 504 || /hết thời gian chờ/i.test(msg)) {
    return 'Google Drive phản hồi chậm. Thử lại sau vài giây.';
  }
  return msg || 'Không tạo được thư mục Google Drive';
}

/**
 * Tạo (hoặc tái sử dụng) cây folder:
 * {năm}/Hợp đồng/{STT KH - dự án}/{BV, Đầu ra, Đầu vào}
 */
export async function ensureHopDongDriveFolders({ userId, hopDong, tenKhachHang }) {
  if (!userId) {
    return { warning: 'Chưa đăng nhập nên chưa tạo được folder Google Drive' };
  }
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    return { warning: 'Chưa kết nối Google Drive. Vào Cài đặt để kết nối rồi lưu lại hợp đồng.' };
  }

  try {
    const existingId = String(hopDong.id_folder_du_an || '').trim();
    const customName = sanitizeDriveName(hopDong.ten_folder_du_an);
    if (existingId) {
      const current = await getDriveFile(accessToken, existingId);
      if (current && !current.trashed) {
        if (customName && customName !== current.name) {
          await renameDriveFile(accessToken, current.id, customName);
          current.name = customName;
        }
        await ensureSubfolders(accessToken, current.id);
        return {
          id_folder: current.id,
          ten_folder: current.name,
          webViewLink: current.webViewLink || `https://drive.google.com/drive/folders/${current.id}`,
          created: false,
        };
      }
    }

    const cache = await loadCache();
    const nam = parseNamFromDate(hopDong.ngay_hop_dong);
    const yearFolder = await ensureYearFolder(accessToken, nam, cache);
    const hopDongRoot = await ensureChildFolder(accessToken, yearFolder.id, HOP_DONG_DIR);
    const siblings = await listChildFolders(accessToken, hopDongRoot.id);

    let stt = sttTuSoHopDong(hopDong.so_hop_dong);
    if (!stt) {
      let max = 0;
      for (const f of siblings) {
        const n = folderStt(f.name);
        if (n) max = Math.max(max, n);
      }
      stt = max + 1;
    }

    const wantedName = customName || buildTenFolderHopDong(
      hopDong.so_hop_dong,
      tenKhachHang,
      hopDong.ten_du_an,
      stt,
    );

    const exact = (siblings || []).find((f) => f.name === wantedName);
    const existingByStt = customName ? null : findFolderByStt(siblings, stt);

    let contractFolder = exact || existingByStt;
    let created = false;
    if (!contractFolder) {
      contractFolder = await ensureChildFolder(accessToken, hopDongRoot.id, wantedName);
      created = !!contractFolder.created;
    }

    await ensureSubfolders(accessToken, contractFolder.id);
    const detail = await getDriveFile(accessToken, contractFolder.id);

    return {
      id_folder: contractFolder.id,
      ten_folder: detail?.name || contractFolder.name || wantedName,
      webViewLink: detail?.webViewLink || `https://drive.google.com/drive/folders/${contractFolder.id}`,
      created,
    };
  } catch (err) {
    console.error('ensureHopDongDriveFolders:', err.message || err);
    return { warning: permissionHint(err) };
  }
}
