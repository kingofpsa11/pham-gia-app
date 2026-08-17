import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { queryOne } from '../db.js';
import { TEMPLATES_UPLOAD_DIR } from './uploadPaths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BUILTIN_TEMPLATES_DIR = path.join(__dirname, '../templates');

/**
 * Load template buffer from cau_hinh upload, or builtin fallback under server/templates.
 * @param {string} configKey
 * @param {{ fallbackFile?: string }} [opts]
 */
export async function loadTemplateBuffer(configKey, opts = {}) {
  const row = await queryOne('SELECT value FROM cau_hinh WHERE `key` = ?', [configKey]);
  if (row?.value) {
    const meta = JSON.parse(row.value);
    if (meta.path) {
      return fs.readFile(path.join(TEMPLATES_UPLOAD_DIR, meta.path));
    }
    if (meta.url) {
      const resp = await fetch(meta.url);
      if (!resp.ok) throw new Error('Không thể tải file mẫu');
      return Buffer.from(await resp.arrayBuffer());
    }
  }
  if (opts.fallbackFile) {
    const fallbackPath = path.join(BUILTIN_TEMPLATES_DIR, opts.fallbackFile);
    try {
      return await fs.readFile(fallbackPath);
    } catch {
      throw new Error(`Không tìm thấy mẫu (key: ${configKey}, fallback: ${opts.fallbackFile})`);
    }
  }
  throw new Error(`Không tìm thấy mẫu (key: ${configKey})`);
}
