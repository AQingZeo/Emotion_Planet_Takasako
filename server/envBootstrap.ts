/**
 * Must run before other server modules read `process.env`.
 * Loads repo `.env` then `.env.local` with override so file values win over empty inherited vars
 * (e.g. `OPENAI_API_KEY=` in the shell shadowing `.env.local`).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

config({ path: path.join(ROOT, '.env'), override: true });
config({ path: path.join(ROOT, '.env.local'), override: true });
