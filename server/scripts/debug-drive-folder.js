import dotenv from 'dotenv';
import { query, queryOne } from '../db.js';
import { getValidAccessToken, getDriveTokenRow, driveApi } from '../utils/googleDrive.js';

dotenv.config();

const LOOKUP_ID = process.argv[2] || '1r7gwolOh8HjyGUg5eNIYJAs_9cbnd73O';

async function inspect(accessToken, id, label) {
  console.log(`\n=== ${label} ${id} ===`);
  try {
    const file = await driveApi(accessToken, `files/${id}`, {
      qs: {
        fields: 'id,name,mimeType,trashed,parents,webViewLink,owners(emailAddress,displayName),shared,driveId,shortcutDetails',
        supportsAllDrives: 'true',
      },
    });
    console.log(JSON.stringify(file, null, 2));
  } catch (err) {
    console.log('API error', err.status, err.message);
  }
}

const rows = await query(
  `SELECT id, so_hop_dong, ten_folder_du_an, id_folder_du_an
   FROM hop_dong
   WHERE id_folder_du_an IS NOT NULL AND id_folder_du_an != ''
   ORDER BY id DESC
   LIMIT 8`,
);
console.log('recent hop_dong folders:');
console.log(JSON.stringify(rows, null, 2));

const tokens = await query('SELECT user_id, google_email, token_expiry, LEFT(access_token, 8) AS tok FROM google_drive_tokens');
console.log('\ntokens:', JSON.stringify(tokens, null, 2));

const cache = await queryOne("SELECT value FROM cau_hinh WHERE `key` = 'drive_folder_cache'");
console.log('\ncache:', cache?.value || '(none)');

const userId = tokens[0]?.user_id;
if (!userId) {
  console.log('no drive token');
  process.exit(1);
}

const accessToken = await getValidAccessToken(userId);
const row = await getDriveTokenRow(userId);
console.log('\nconnected email:', row?.google_email || '(empty)');

await inspect(accessToken, LOOKUP_ID, 'screenshot');
for (const hd of rows.slice(0, 3)) {
  await inspect(accessToken, hd.id_folder_du_an, `hd ${hd.id}`);
}

process.exit(0);
