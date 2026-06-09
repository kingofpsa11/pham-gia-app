import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATES_UPLOAD_DIR = path.join(__dirname, '../../uploads/templates');
