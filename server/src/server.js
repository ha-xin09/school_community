import { app } from './app.js';
import { pool } from './db.js';
import { config } from './config.js';

try {
  await pool.query('SELECT id FROM users LIMIT 1');
  await pool.query('SELECT id FROM posts LIMIT 1');
  const server = app.listen(config.port, '127.0.0.1', () => {
    console.log('School Community 서버: http://localhost:' + config.port);
  });
  server.on('error', async (error) => {
    console.error('서버 실행 실패:', error.message);
    await pool.end();
    process.exitCode = 1;
  });
  const shutdown = () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  console.error('MySQL 연결 또는 테이블 확인 실패. MySQL을 실행하고 npm run db:init 명령을 먼저 실행하세요.');
  console.error(error.message);
  await pool.end();
  process.exitCode = 1;
}
