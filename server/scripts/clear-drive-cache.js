import { query } from '../db.js';

const result = await query("UPDATE cau_hinh SET value = '{}' WHERE `key` = 'drive_folder_cache'");
console.log('drive_folder_cache cleared', result?.affectedRows ?? result);
process.exit(0);
