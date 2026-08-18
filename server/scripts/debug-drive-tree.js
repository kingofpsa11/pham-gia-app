import { query, queryOne } from '../db.js';
import { getValidAccessToken, driveApi } from '../utils/googleDrive.js';

async function getFile(accessToken, id) {
  return driveApi(accessToken, `files/${id}`, {
    qs: {
      fields: 'id,name,mimeType,trashed,parents',
      supportsAllDrives: 'true',
    },
  });
}

async function listChildren(accessToken, parentId) {
  const data = await driveApi(accessToken, 'files', {
    qs: {
      q: `'${parentId}' in parents and trashed=false`,
      fields: 'files(id,name,mimeType)',
      pageSize: '50',
      corpora: 'user',
      spaces: 'drive',
    },
  });
  return data.files || [];
}

const rows = await query(
  `SELECT id, so_hop_dong, ten_folder_du_an, id_folder_du_an
   FROM hop_dong
   WHERE id_folder_du_an IS NOT NULL AND id_folder_du_an != ''
   ORDER BY id DESC
   LIMIT 5`,
);
const cache = await queryOne("SELECT value FROM cau_hinh WHERE `key` = 'drive_folder_cache'");
const tokens = await query('SELECT user_id, google_email FROM google_drive_tokens LIMIT 1');
const accessToken = await getValidAccessToken(tokens[0].user_id);

console.log('cache', cache?.value);
console.log('hop_dong', JSON.stringify(rows, null, 2));

for (const hd of rows) {
  console.log('\n==== HD', hd.id, hd.id_folder_du_an);
  try {
    let current = await getFile(accessToken, hd.id_folder_du_an);
    const chain = [];
    for (let i = 0; i < 6 && current; i++) {
      chain.push({ id: current.id, name: current.name, mimeType: current.mimeType, parents: current.parents });
      const parentId = current.parents?.[0];
      if (!parentId) break;
      current = await getFile(accessToken, parentId);
    }
    console.log('parent chain', JSON.stringify(chain, null, 2));
    const kids = await listChildren(accessToken, hd.id_folder_du_an);
    console.log('children', JSON.stringify(kids, null, 2));
  } catch (err) {
    console.log('error', err.status, err.message);
  }
}

process.exit(0);
