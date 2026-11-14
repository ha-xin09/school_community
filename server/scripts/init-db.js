import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { config } from '../src/config.js';

let connection;
try {
  const { database, ...options } = config.database;
  if (database !== 'community_20608') {
    throw new Error('DB_NAME은 community_20608이어야 합니다.');
  }
  connection = await mysql.createConnection({ ...options, multipleStatements: true });
  const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
  await connection.query(schema);
  console.log('community_20608 데이터베이스와 users, posts 테이블 준비가 완료되었습니다.');
} catch (error) {
  console.error('DB 초기화 실패:', error.message);
  process.exitCode = 1;
} finally {
  if (connection) await connection.end();
}
