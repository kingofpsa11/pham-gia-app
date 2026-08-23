import { parseNamFromDate } from './soTrungNam.js';
import { parseSoHopDongBan } from './soChungTu.js';
import { query, queryOne } from '../db.js';
import {
  getValidAccessToken,
  getDriveTokenRow,
  getDriveFile,
  listChildFolders,
  listDirectItems,
  findFoldersByNames,
  resolveToFolder,
  ensureChildFolder,
  createDriveFolder,
  renameDriveFile,
  shareDriveFile,
  isDriveFolder,
  driveNamesEqual,
  foldDriveName,
} from './googleDrive.js';

const SUBFOLDERS = ['BV', 'Đầu ra', 'Đầu vào'];
const HOP_DONG_DIR = 'Hợp đồng';
const PHAM_GIA_NAMES = ['00 Phạm Gia', 'Phạm Gia'];
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

export function findExistingContractFolder(folders, wantedName) {
  return (folders || []).find((f) => f.name === wantedName) || null;
}

export async function loadCache() {
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

async function validCachedFolder(accessToken, id, expectedNames) {
  if (!id) return null;
  const file = await getDriveFile(accessToken, id, 'id,name,mimeType,trashed,webViewLink,parents');
  if (!isDriveFolder(file)) return null;
  if (Array.isArray(expectedNames) && expectedNames.length
    && !expectedNames.some((name) => driveNamesEqual(name, file.name))) {
    return null;
  }
  return file;
}

function looksLikePhamGiaName(name) {
  const n = foldDriveName(name);
  return n === foldDriveName('00 Phạm Gia')
    || n === foldDriveName('Phạm Gia')
    || /^00\s*pham\s*gia$/.test(n);
}

function missingPhamGiaError() {
  const err = new Error(
    'Không tìm thấy thư mục "00 Phạm Gia" trên Google Drive. Vào Cài đặt → Google Drive, ngắt kết nối rồi kết nối lại.',
  );
  err.status = 400;
  return err;
}

async function scorePhamGiaFolder(accessToken, folder) {
  const kids = await listDirectItems(accessToken, folder.id, 25);
  if (!kids.length) return 0;
  let score = 0;
  for (const k of kids) {
    const n = foldDriveName(k.name);
    if (n === foldDriveName('Hợp đồng')) score += 3;
    if (n.includes('cccl') || n.includes('cqcl')) score += 10;
    if (n.includes('cong no')) score += 10;
    if (n.includes('bao gia')) score += 8;
    if (/^\d{4}$/.test(String(k.name || '').trim())) score += 1;
  }
  if (kids.length <= 15) score += 2;
  return score;
}

export async function findPhamGiaRoot(accessToken, cache) {
  const named = await findFoldersByNames(accessToken, PHAM_GIA_NAMES);
  const top = await listDirectItems(accessToken, 'root', 100, { strict: false });
  for (const f of top) {
    if (!looksLikePhamGiaName(f.name)) continue;
    named.push(f);
  }

  const uniq = [];
  const seen = new Set();
  for (const f of named) {
    const real = await resolveToFolder(accessToken, f.id || f);
    const folder = isDriveFolder(real) ? real : (isDriveFolder(f) ? f : null);
    if (!folder?.id || seen.has(folder.id)) continue;
    if (!looksLikePhamGiaName(folder.name) && real && !looksLikePhamGiaName(real.name)) continue;
    seen.add(folder.id);
    uniq.push(folder);
  }
  if (!uniq.length) throw missingPhamGiaError();

  let best = uniq[0];
  let bestScore = -1;
  for (const f of uniq) {
    const score = await scorePhamGiaFolder(accessToken, f);
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }

  cache.rootId = best.id;
  await saveCache(cache);
  console.log('Drive Phạm Gia root:', { id: best.id, name: best.name, score: bestScore, candidates: uniq.length });
  return best;
}

async function ensureYearFolder(accessToken, nam, cache) {
  const yearName = String(nam);
  const root = await findPhamGiaRoot(accessToken, cache);
  if (!isDriveFolder(root) || root.id === 'root') {
    throw missingPhamGiaError();
  }

  cache.years = cache.years || {};
  const here = await listDirectItems(accessToken, root.id, 25);
  const yearHere = here.find((f) => isDriveFolder(f) && driveNamesEqual(f.name, yearName));
  if (yearHere) {
    cache.years[yearName] = { id: yearHere.id, parentId: root.id };
    cache.rootId = root.id;
    await saveCache(cache);
    console.log('Drive year folder in Phạm Gia:', yearHere.id);
    return yearHere;
  }

  const yearFolder = await createDriveFolder(accessToken, yearName, root.id);
  if (!isDriveFolder(yearFolder) || !driveNamesEqual(yearFolder.name, yearName)) {
    const err = new Error(`Không tạo được thư mục năm ${yearName} trong "00 Phạm Gia"`);
    err.status = 500;
    throw err;
  }
  cache.years[yearName] = { id: yearFolder.id, parentId: root.id };
  cache.rootId = root.id;
  await saveCache(cache);
  console.log('Drive year folder created:', {
    phamGia: root.name,
    phamGiaId: root.id,
    year: yearFolder.name,
    yearId: yearFolder.id,
  });
  return yearFolder;
}

async function ensureSubfolders(accessToken, parentId) {
  const parent = await getDriveFile(accessToken, parentId, 'id,name,mimeType,trashed');
  if (!isDriveFolder(parent)) {
    const err = new Error('Không tạo được thư mục con vì thư mục hợp đồng không hợp lệ');
    err.status = 400;
    throw err;
  }
  const existing = (await listChildFolders(accessToken, parentId))
    .filter((f) => isDriveFolder(f) && (f.parents || []).includes(parentId));
  const ids = {};
  const failed = [];
  for (const name of SUBFOLDERS) {
    try {
      const found = existing.find((f) => driveNamesEqual(f.name, name));
      if (isDriveFolder(found) && driveNamesEqual(found.name, name)) {
        ids[name] = found.id;
        continue;
      }
      const created = await createDriveFolder(accessToken, name, parentId);
      if (created.parents?.length && !created.parents.includes(parentId)) {
        failed.push(`${name}: tạo sai vị trí`);
        continue;
      }
      ids[name] = created.id;
      existing.push(created);
    } catch (err) {
      console.error('ensureSubfolder failed:', name, err.message || err);
      failed.push(`${name}: ${err.message || 'lỗi'}`);
    }
  }
  if (failed.length) {
    const err = new Error(`Không tạo đủ thư mục con (${failed.join('; ')})`);
    err.status = 500;
    throw err;
  }
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

async function shareFolderWithEmails(accessToken, folderId, emails) {
  const unique = [...new Set((emails || []).map((e) => String(e || '').trim().toLowerCase()).filter((e) => e.includes('@')))];
  for (const email of unique) {
    await shareDriveFile(accessToken, folderId, email);
  }
}

/**
 * Tạo (hoặc tái sử dụng) cây folder:
 * {năm}/Hợp đồng/{STT KH - dự án}/{BV, Đầu ra, Đầu vào}
 */
export async function ensureHopDongDriveFolders({ userId, hopDong, tenKhachHang, shareWithEmail, forceNew = false }) {
  if (!userId) {
    return { warning: 'Chưa đăng nhập nên chưa tạo được folder Google Drive' };
  }
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    return { warning: 'Chưa kết nối Google Drive. Vào Cài đặt để kết nối rồi lưu lại hợp đồng.' };
  }
  const tokenRow = await getDriveTokenRow(userId);
  const googleEmail = tokenRow?.google_email || '';

  try {
    const existingId = String(hopDong.id_folder_du_an || '').trim();
    const customName = sanitizeDriveName(hopDong.ten_folder_du_an);
    if (existingId) {
      const current = await getDriveFile(accessToken, existingId);
      if (isDriveFolder(current)) {
        if (customName && customName !== current.name) {
          await renameDriveFile(accessToken, current.id, customName);
          current.name = customName;
        }
        const subfolders = await ensureSubfolders(accessToken, current.id);
        await shareFolderWithEmails(accessToken, current.id, [shareWithEmail, googleEmail]);
        return {
          id_folder: current.id,
          ten_folder: current.name,
          webViewLink: current.webViewLink || `https://drive.google.com/open?id=${current.id}`,
          google_email: googleEmail,
          subfolders: Object.keys(subfolders),
          created: false,
        };
      }
    }

    const cache = await loadCache();
    const nam = parseNamFromDate(hopDong.ngay_hop_dong);
    const yearFolder = await ensureYearFolder(accessToken, nam, cache);
    if (!isDriveFolder(yearFolder) || !driveNamesEqual(yearFolder.name, String(nam))) {
      const err = new Error(`Không tìm thấy thư mục năm ${nam} trên Google Drive`);
      err.status = 500;
      throw err;
    }

    const yearKids = await listDirectItems(accessToken, yearFolder.id, 25);
    let hopDongRoot = yearKids.find((f) => isDriveFolder(f) && driveNamesEqual(f.name, HOP_DONG_DIR));
    if (!hopDongRoot) {
      hopDongRoot = await ensureChildFolder(accessToken, yearFolder.id, HOP_DONG_DIR, { fallbackRoot: false });
    }
    if (!isDriveFolder(hopDongRoot) || !driveNamesEqual(hopDongRoot.name, HOP_DONG_DIR)) {
      const err = new Error(`Không tìm thấy thư mục "${HOP_DONG_DIR}" trong năm ${nam}`);
      err.status = 500;
      throw err;
    }
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

    let contractFolder;
    let created = false;
    if (forceNew) {
      console.log('Drive hop-dong forceNew ignored; repairing/reusing folder when possible');
    }
    contractFolder = findExistingContractFolder(siblings, wantedName);
    if (!contractFolder) {
      contractFolder = await ensureChildFolder(accessToken, hopDongRoot.id, wantedName, { fallbackRoot: false });
      created = !!contractFolder.created;
    }

    if (!isDriveFolder(contractFolder)) {
      const err = new Error('Google Drive trả về file không phải thư mục hợp đồng');
      err.status = 500;
      throw err;
    }
    if (contractFolder.parents?.length && !contractFolder.parents.includes(hopDongRoot.id)) {
      const err = new Error(`Thư mục "${wantedName}" không nằm trong thư mục ${HOP_DONG_DIR}`);
      err.status = 500;
      throw err;
    }

    const subfolders = await ensureSubfolders(accessToken, contractFolder.id);
    console.log('Drive hop-dong tree:', {
      phamGiaId: cache.rootId,
      year: yearFolder.name,
      hopDong: hopDongRoot.name,
      contract: contractFolder.name,
      subfolders: Object.keys(subfolders),
    });
    await shareFolderWithEmails(accessToken, contractFolder.id, [shareWithEmail, googleEmail]);

    return {
      id_folder: contractFolder.id,
      ten_folder: contractFolder.name || wantedName,
      webViewLink: contractFolder.webViewLink || `https://drive.google.com/open?id=${contractFolder.id}`,
      google_email: googleEmail,
      subfolders: Object.keys(subfolders),
      created,
    };
  } catch (err) {
    console.error('ensureHopDongDriveFolders:', err.message || err);
    return { warning: permissionHint(err) };
  }
}
