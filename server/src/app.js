import express from 'express';
import session from 'express-session';
import bcrypt from 'bcrypt';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { pool } from './db.js';
import { HttpError, textField, passwordField, profileFields, postFields, validId } from './validation.js';

export const app = express();
const userColumns = 'id, email, nickname, student_id, major, created_at, updated_at';
const postQuery = `SELECT p.id, p.user_id, p.category, p.title, p.content, p.view_count,
  p.created_at, p.updated_at, u.nickname AS author_nickname, u.major AS author_major
  FROM posts p INNER JOIN users u ON p.user_id = u.id WHERE u.deleted_at IS NULL`;
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: false, path: '/' };

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
    const allowedOrigins = [
      'http://localhost:5173', 'http://127.0.0.1:5173',
      'http://localhost:' + config.port, 'http://127.0.0.1:' + config.port
    ];
    if (!allowedOrigins.includes(req.headers.origin)) {
      return next(new HttpError(403, '허용되지 않은 요청입니다.'));
    }
  }
  next();
});
app.use(express.json({ limit: '100kb' }));
app.use(session({
  name: 'school.sid',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { ...cookieOptions, maxAge: 1000 * 60 * 60 * 8 }
}));

async function findUser(id) {
  const [rows] = await pool.execute('SELECT ' + userColumns + ' FROM users WHERE id = ? AND deleted_at IS NULL', [id]);
  return rows[0];
}

async function findPost(id) {
  const [rows] = await pool.execute(postQuery + ' AND p.id = ?', [id]);
  return rows[0];
}

async function startSession(req, userId) {
  await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
  req.session.userId = String(userId);
  await new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
}

async function destroySession(req, res) {
  await new Promise((resolve, reject) => req.session.destroy((error) => error ? reject(error) : resolve()));
  res.clearCookie('school.sid', cookieOptions);
}

const requireAuth = asyncRoute(async (req, res, next) => {
  if (!req.session.userId) throw new HttpError(401, '로그인이 필요합니다.');
  const user = await findUser(req.session.userId);
  if (!user) {
    await destroySession(req, res);
    throw new HttpError(401, '다시 로그인해 주세요.');
  }
  req.user = user;
  next();
});

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const { email, nickname, student_id, major } = profileFields(body);
  const password = passwordField(body.password);
  const hashedPassword = await bcrypt.hash(password, 12);
  const [result] = await pool.execute(
    'INSERT INTO users (email, password, nickname, student_id, major) VALUES (?, ?, ?, ?, ?)',
    [email, hashedPassword, nickname, student_id, major]
  );
  const user = await findUser(result.insertId);
  await startSession(req, user.id);
  res.status(201).json({ user });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const email = textField(body.email, '이메일', 255).toLowerCase();
  if (typeof body.password !== 'string' || !body.password || Buffer.byteLength(body.password, 'utf8') > 72) {
    throw new HttpError(401, '이메일 또는 비밀번호가 올바르지 않습니다.');
  }
  const [rows] = await pool.execute('SELECT id, password FROM users WHERE email = ? AND deleted_at IS NULL', [email]);
  const account = rows[0];
  if (!account || !await bcrypt.compare(body.password, account.password)) {
    throw new HttpError(401, '이메일 또는 비밀번호가 올바르지 않습니다.');
  }
  const user = await findUser(account.id);
  await startSession(req, user.id);
  res.json({ user });
}));

app.post('/api/auth/logout', asyncRoute(async (req, res) => {
  await destroySession(req, res);
  res.json({ message: '로그아웃되었습니다.' });
}));

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.put('/api/users/me', requireAuth, asyncRoute(async (req, res) => {
  const body = req.body || {};
  const { email, nickname, student_id, major } = profileFields(body);
  const values = [email, nickname, student_id, major];
  let sql = 'UPDATE users SET email = ?, nickname = ?, student_id = ?, major = ?';
  if (body.password !== undefined && body.password !== '') {
    const hashedPassword = await bcrypt.hash(passwordField(body.password), 12);
    sql += ', password = ?';
    values.push(hashedPassword);
  }
  sql += ' WHERE id = ? AND deleted_at IS NULL';
  values.push(req.user.id);
  await pool.execute(sql, values);
  const user = await findUser(req.user.id);
  if (!user) throw new HttpError(404, '회원 정보를 찾을 수 없습니다.');
  res.json({ user });
}));

app.delete('/api/users/me', requireAuth, asyncRoute(async (req, res) => {
  const password = req.body?.password;
  if (typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 72) {
    throw new HttpError(400, '탈퇴하려면 현재 비밀번호를 입력해 주세요.');
  }
  const [rows] = await pool.execute('SELECT password FROM users WHERE id = ? AND deleted_at IS NULL', [req.user.id]);
  if (!rows[0] || !await bcrypt.compare(password, rows[0].password)) {
    throw new HttpError(401, '비밀번호가 올바르지 않습니다.');
  }
  const [result] = await pool.execute('DELETE FROM users WHERE id = ? AND password = ?', [req.user.id, rows[0].password]);
  if (!result.affectedRows) throw new HttpError(409, '회원 정보가 변경되었습니다. 다시 시도해 주세요.');
  await destroySession(req, res);
  res.json({ message: '회원 탈퇴가 완료되었습니다.' });
}));

app.get('/api/posts', asyncRoute(async (req, res) => {
  const [posts] = await pool.query(postQuery + ' ORDER BY p.created_at DESC, p.id DESC');
  res.json({ posts });
}));

app.get('/api/posts/:id', asyncRoute(async (req, res) => {
  const id = validId(req.params.id);
  const [result] = await pool.execute(
    'UPDATE posts p INNER JOIN users u ON p.user_id = u.id SET p.view_count = LEAST(p.view_count + 1, 4294967295), p.updated_at = p.updated_at WHERE p.id = ? AND u.deleted_at IS NULL',
    [id]
  );
  if (!result.affectedRows) throw new HttpError(404, '게시글을 찾을 수 없습니다.');
  const post = await findPost(id);
  if (!post) throw new HttpError(404, '게시글을 찾을 수 없습니다.');
  res.json({ post });
}));

app.post('/api/posts', requireAuth, asyncRoute(async (req, res) => {
  const { category, title, content } = postFields(req.body || {});
  const [result] = await pool.execute(
    'INSERT INTO posts (user_id, category, title, content) VALUES (?, ?, ?, ?)',
    [req.user.id, category, title, content]
  );
  res.status(201).json({ post: await findPost(result.insertId) });
}));

app.put('/api/posts/:id', requireAuth, asyncRoute(async (req, res) => {
  const id = validId(req.params.id);
  const post = await findPost(id);
  if (!post) throw new HttpError(404, '게시글을 찾을 수 없습니다.');
  if (String(post.user_id) !== String(req.user.id)) {
    throw new HttpError(403, '본인이 작성한 게시글만 수정할 수 있습니다.');
  }
  const { category, title, content } = postFields(req.body || {});
  await pool.execute(
    'UPDATE posts SET category = ?, title = ?, content = ? WHERE id = ? AND user_id = ?',
    [category, title, content, id, req.user.id]
  );
  const updated = await findPost(id);
  if (!updated) throw new HttpError(404, '게시글을 찾을 수 없습니다.');
  res.json({ post: updated });
}));

app.delete('/api/posts/:id', requireAuth, asyncRoute(async (req, res) => {
  const id = validId(req.params.id);
  const post = await findPost(id);
  if (!post) throw new HttpError(404, '게시글을 찾을 수 없습니다.');
  if (String(post.user_id) !== String(req.user.id)) {
    throw new HttpError(403, '본인이 작성한 게시글만 삭제할 수 있습니다.');
  }
  const [result] = await pool.execute('DELETE FROM posts WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!result.affectedRows) throw new HttpError(404, '게시글을 찾을 수 없습니다.');
  res.json({ message: '게시글이 삭제되었습니다.' });
}));

app.get('/api/reports/posts-authors', asyncRoute(async (req, res) => {
  const [rows] = await pool.query(`SELECT p.id AS post_id, p.title, p.category, p.created_at,
    u.id AS user_id, u.nickname, u.student_id, u.major
    FROM posts p INNER JOIN users u ON p.user_id = u.id
    WHERE u.deleted_at IS NULL
    ORDER BY p.created_at DESC, p.id DESC`);
  res.json({ rows });
}));

app.use('/api', (req, res) => res.status(404).json({ message: '요청한 API를 찾을 수 없습니다.' }));

const clientDirectory = fileURLToPath(new URL('../../client/dist', import.meta.url));
const clientIndex = fileURLToPath(new URL('../../client/dist/index.html', import.meta.url));
app.use(express.static(clientDirectory));
app.get('*', (req, res, next) => {
  if (existsSync(clientIndex)) return res.sendFile(clientIndex);
  next();
});
app.use((req, res) => res.status(404).json({ message: '페이지를 찾을 수 없습니다.' }));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.code === 'ER_DUP_ENTRY') {
    const field = error.sqlMessage?.includes('uk_users_nickname') ? '닉네임' : '이메일';
    return res.status(409).json({ message: '이미 사용 중인 ' + field + '입니다.' });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ message: '요청 데이터의 JSON 형식이 올바르지 않습니다.' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ message: '입력한 데이터가 너무 큽니다.' });
  }
  if (error instanceof HttpError) return res.status(error.status).json({ message: error.message });
  console.error('요청 처리 오류:', error.code || error.message);
  res.status(500).json({ message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
});

export default app;
