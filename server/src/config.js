import dotenv from 'dotenv';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

export const config = {
  port: Number(process.env.PORT || 3001),
  sessionSecret: process.env.SESSION_SECRET || randomBytes(32).toString('hex'),
  database: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? '1234',
    database: process.env.DB_NAME || 'community_20608',
    charset: 'utf8mb4',
    supportBigNumbers: true,
    bigNumberStrings: true
  }
};
