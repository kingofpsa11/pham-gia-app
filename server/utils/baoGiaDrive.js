import { parseNamFromDate } from './soTrungNam.js';
import { query, queryOne } from '../db.js';
import {
  getValidAccessToken,
  getDriveTokenRow,
  getDriveFile,
  listChildFolders,
  listDirectItems,
  findFoldersByNames,
  findAllFoldersNamed,
  resolveToFolder,
  ensureChildFolder,
  createDriveFolder,
  renameDriveFile,
  shareDriveFile,
  isDriveFolder,
  driveNamesEqual,
  foldDriveName,
} from './googleDrive.js';
import {
  sanitizeDriveName,
  shortKhachHang,
  shortDuAn,
  findPhamGiaRoot,
  loadCache,
} from './hopDongDrive.js';

const BAO_GIA_DIR = '00 Báo giá';
const PIN_BAO_GIA_KEY = 'drive_bao_gia_root_id';
const SUBFOLDERS = ['BV', 'Đầu vào', 'Đầu ra'];

export function folderSttFromName(name) {
  const m = String(name || '').trim().match(/^(\d{2})(?:\s|$|-)/);
  return m ? parseInt(m[1], 10) : null;
}

export function nextSttFromFolders(folders) {
  let max = -1;
  for (const f of folders || []) {
    const n = folderSttFromName(f.name);
    if (n != null) max = Math.max(max, n);
  }
  return max + 1;
}

export function buildTenFolderBaoGia(tenKhachHang, tenDuAn, stt) {
  const sttStr = String(stt ?? 0).padStart(2, '0');
  const kh = shortKhachHang(tenKhachHang);
  const duAn = shortDuAn(tenDuAn);
  if (kh && duAn) return `${sttStr} ${kh} - ${duAn}`;
  if (kh) return `${sttStr} ${kh}`;
  if (duAn) return `${sttStr} ${duAn}`;
  return sttStr;
}

function applySttToName(name, stt) {
  const sttStr = String(stt).padStart(2, '0');
  const rest = sanitizeDriveName(name).replace(/^\d{1,2}(?:\s+|-)?/, '').trim();
  return rest ? `${sttStr} ${rest}` : sttStr;
}

function nameLooksIncomplete(name) {
  return !String(name || '').trim() || /^\d{1,2}$/.test(String(name).trim());
}

function resolveQuoteFolderName(customName, tenKhachHang, tenDuAn, stt) {
  const built = buildTenFolderBaoGia(tenKhachHang, tenDuAn, stt);
  const cleaned = sanitizeDriveName(customName);
  if (nameLooksIncomplete(cleaned)) return built;
  return applySttToName(cleaned, stt);
}

function looksLikeBaoGiaRootName(name) {
  const n = foldDriveName(name);
  return n === foldDriveName(BAO_GIA_DIR)
    || n === foldDriveName('Báo giá')
    || /^00\s*bao\s*gia$/.test(n)
    || /^bao\s*gia$/.test(n);
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

async function loadPinnedBaoGiaId() {
  try {
    const row = await queryOne('SELECT value FROM cau_hinh WHERE `key` = ?', [PIN_BAO_GIA_KEY]);
    return String(row?.value || '').trim();
  } catch {
    return '';
  }
}

async function pinBaoGiaId(id) {
  if (!id) return;
  try {
    const existing = await queryOne('SELECT `key` FROM cau_hinh WHERE `key` = ?', [PIN_BAO_GIA_KEY]);
    if (existing) {
      await query('UPDATE cau_hinh SET value = ?, updated_at = NOW() WHERE `key` = ?', [id, PIN_BAO_GIA_KEY]);
    } else {
      await query('INSERT INTO cau_hinh (`key`, value, updated_at) VALUES (?, ?, NOW())', [PIN_BAO_GIA_KEY, id]);
    }
  } catch (err) {
    console.warn('pinBaoGiaId skipped:', err.message);
  }
}

async function findNamedChildFolder(accessToken, parentId, name) {
  const kids = await listDirectItems(accessToken, parentId, 80);
  for (const f of kids) {
    if (!driveNamesEqual(f.name, name)) continue;
    const folder = await resolveToFolder(accessToken, f);
    if (isDriveFolder(folder)) return folder;
  }
  return null;
}

async function scoreBaoGiaRoot(accessToken, folder) {
  if (!isDriveFolder(folder)) return { score: 0, years: [] };
  const kids = await listDirectItems(accessToken, folder.id, 40);
  const years = (kids || [])
    .map((f) => String(f.name || '').trim())
    .filter((n) => /^\d{4}$/.test(n));
  return { score: years.length * 5, years };
}

async function findBaoGiaRoot(accessToken, phamGia) {
  const candidates = [];
  const seen = new Set();

  async function consider(folder, via) {
    if (!isDriveFolder(folder) || !looksLikeBaoGiaRootName(folder.name) || seen.has(folder.id)) return;
    seen.add(folder.id);
    const scored = await scoreBaoGiaRoot(accessToken, folder);
    candidates.push({ folder, via, ...scored });
  }

  const pinned = await loadPinnedBaoGiaId();
  if (pinned) {
    await consider(await resolveToFolder(accessToken, pinned), 'pinned');
  }

  const kids = await listDirectItems(accessToken, phamGia.id, 80);
  for (const child of kids) {
    if (!looksLikeBaoGiaRootName(child.name)) continue;
    await consider(await resolveToFolder(accessToken, child), 'phamgia-direct');
  }

  if (!candidates.some((c) => c.score > 0)) {
    try {
      const found = await findFoldersByNames(accessToken, [BAO_GIA_DIR, 'Báo giá']);
      for (const f of found) {
        await consider(await resolveToFolder(accessToken, f), 'search');
      }
    } catch (err) {
      console.warn('bao gia name search:', err.message || err);
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  if (candidates.length) {
    const best = candidates[0];
    await pinBaoGiaId(best.folder.id);
    console.log('Drive Báo giá root:', {
      id: best.folder.id,
      name: best.folder.name,
      score: best.score,
      years: best.years,
      via: best.via,
    });
    return best.folder;
  }

  const created = await ensureChildFolder(accessToken, phamGia.id, BAO_GIA_DIR, { fallbackRoot: false });
  if (!isDriveFolder(created)) {
    const err = new Error('Không tạo được thư mục "00 Báo giá" trong 00 Phạm Gia.');
    err.status = 500;
    throw err;
  }
  await pinBaoGiaId(created.id);
  return created;
}

async function ensureYearInBaoGia(accessToken, baoGiaRoot, nam) {
  const yearName = String(nam);
  const existing = await findNamedChildFolder(accessToken, baoGiaRoot.id, yearName);
  if (existing) return existing;
  try {
    const found = await findAllFoldersNamed(accessToken, yearName, 50);
    for (const f of found) {
      const folder = await resolveToFolder(accessToken, f);
      if (!isDriveFolder(folder) || !driveNamesEqual(folder.name, yearName)) continue;
      if ((folder.parents || []).includes(baoGiaRoot.id)) return folder;
    }
  } catch (err) {
    console.warn('find year in 00 Báo giá:', err.message || err);
  }
  const created = await createDriveFolder(accessToken, yearName, baoGiaRoot.id);
  console.log('Drive created year under 00 Báo giá:', { year: yearName, id: created?.id, parent: baoGiaRoot.id });
  return created;
}

async function listQuoteFolders(accessToken, yearFolderId) {
  const direct = await listDirectItems(accessToken, yearFolderId, 200);
  const children = await listChildFolders(accessToken, yearFolderId);
  const map = new Map();
  for (const f of [...direct, ...children]) {
    if (!f?.id) continue;
    if (isDriveFolder(f)) {
      map.set(f.id, f);
      continue;
    }
    const folder = await resolveToFolder(accessToken, f);
    if (isDriveFolder(folder)) map.set(folder.id, folder);
  }
  return [...map.values()];
}

async function ensureSubfolders(accessToken, parentId) {
  const parent = await getDriveFile(accessToken, parentId, 'id,name,mimeType,trashed');
  if (!isDriveFolder(parent)) {
    const err = new Error('Không tạo được thư mục con vì thư mục báo giá không hợp lệ');
    err.status = 400;
    throw err;
  }
  const existing = await listChildFolders(accessToken, parentId);
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
      console.error('ensureBaoGiaSubfolder failed:', name, err.message || err);
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

async function shareFolderWithEmails(accessToken, folderId, emails) {
  const unique = [...new Set((emails || []).map((e) => String(e || '').trim().toLowerCase()).filter((e) => e.includes('@')))];
  for (const email of unique) {
    await shareDriveFile(accessToken, folderId, email);
  }
}

/**
 * 00 Phạm Gia / 00 Báo giá / {năm} / {STT 2 số} {KH} - {dự án} / {BV, Đầu vào, Đầu ra}
 * STT = max 2 chữ số đầu của folder cùng năm + 1 (không lấy từ số báo giá).
 */
export async function ensureBaoGiaDriveFolders({ userId, baoGia, tenKhachHang, shareWithEmail, forceNew = false }) {
  if (!userId) {
    return { warning: 'Chưa đăng nhập nên chưa tạo được folder Google Drive' };
  }
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    return { warning: 'Chưa kết nối Google Drive. Vào Cài đặt để kết nối rồi lưu lại báo giá.' };
  }
  const tokenRow = await getDriveTokenRow(userId);
  const googleEmail = tokenRow?.google_email || '';

  try {
    const existingId = forceNew ? '' : String(baoGia.id_folder_du_an || '').trim();
    const customName = sanitizeDriveName(baoGia.ten_folder_du_an);
    if (existingId) {
      const current = await getDriveFile(accessToken, existingId);
      if (isDriveFolder(current)) {
        const stt = folderSttFromName(current.name) ?? folderSttFromName(customName) ?? 0;
        const wanted = resolveQuoteFolderName(customName, tenKhachHang, baoGia.ten_du_an, stt);
        const shouldRename = wanted
          && wanted !== current.name
          && (nameLooksIncomplete(current.name) || !nameLooksIncomplete(customName));
        if (shouldRename) {
          await renameDriveFile(accessToken, current.id, wanted);
          current.name = wanted;
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
    const nam = parseNamFromDate(baoGia.ngay_bao_gia);
    const phamGia = await findPhamGiaRoot(accessToken, cache);
    const baoGiaRoot = await findBaoGiaRoot(accessToken, phamGia);
    const yearFolder = await ensureYearInBaoGia(accessToken, baoGiaRoot, nam);
    if (!isDriveFolder(yearFolder)) {
      const err = new Error(`Không tìm thấy thư mục năm ${nam} trong "00 Báo giá".`);
      err.status = 400;
      throw err;
    }

    const siblings = await listQuoteFolders(accessToken, yearFolder.id);
    const stt = nextSttFromFolders(siblings);
    const wantedName = resolveQuoteFolderName(customName, tenKhachHang, baoGia.ten_du_an, stt);

    const quoteFolder = await createDriveFolder(accessToken, wantedName, yearFolder.id);
    if (!isDriveFolder(quoteFolder)) {
      const err = new Error('Google Drive trả về file không phải thư mục báo giá');
      err.status = 500;
      throw err;
    }

    const subfolders = await ensureSubfolders(accessToken, quoteFolder.id);
    console.log('Drive bao-gia tree:', {
      baoGiaRootId: baoGiaRoot.id,
      year: yearFolder.name,
      nextStt: String(stt).padStart(2, '0'),
      quote: quoteFolder.name,
      quoteId: quoteFolder.id,
      subfolders: Object.keys(subfolders),
      siblingCount: siblings.length,
    });
    await shareFolderWithEmails(accessToken, quoteFolder.id, [shareWithEmail, googleEmail]);

    return {
      id_folder: quoteFolder.id,
      ten_folder: quoteFolder.name || wantedName,
      webViewLink: quoteFolder.webViewLink || `https://drive.google.com/open?id=${quoteFolder.id}`,
      google_email: googleEmail,
      subfolders: Object.keys(subfolders),
      created: true,
    };
  } catch (err) {
    console.error('ensureBaoGiaDriveFolders:', err.message || err);
    return { warning: permissionHint(err) };
  }
}
