import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import app from '../server/src/app.js';
import { pool } from '../server/src/db.js';

const require = createRequire(new URL('../server/package.json', import.meta.url));
const bcrypt = require('bcrypt');

class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookies = new Map();
  }

  async request(method, path, body) {
    const headers = { Origin: 'http://localhost:5173' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cookies.size) {
      headers.Cookie = [...this.cookies].map(([key, value]) => key + '=' + value).join('; ');
    }
    const response = await fetch(this.baseUrl + '/api' + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0];
      const separator = pair.indexOf('=');
      this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    return { status: response.status, body: await response.json() };
  }
}

test('회원과 게시글의 MySQL 통합 검증', { timeout: 60000 }, async (t) => {
  const suffix = Date.now().toString(36) + randomBytes(4).toString('hex');
  const emailA = 'qa-a-' + suffix + '@example.com';
  const emailB = 'qa-b-' + suffix + '@example.com';
  const updatedEmail = 'qa-updated-' + suffix + '@example.com';
  const password = 'Community1234!';
  const updatedPassword = 'Updated1234!';
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = 'http://127.0.0.1:' + server.address().port;
  const guest = new ApiClient(baseUrl);
  const owner = new ApiClient(baseUrl);
  const other = new ApiClient(baseUrl);
  let ownerId;
  let postId;
  let cascadePostId;

  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    try {
      await pool.execute('DELETE FROM users WHERE email IN (?, ?, ?)', [emailA, emailB, updatedEmail]);
    } finally {
      await pool.end();
    }
  });

  await t.test('비회원은 목록과 JOIN 결과를 읽고 쓰기는 할 수 없다', async () => {
    const list = await guest.request('GET', '/posts');
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body.posts));
    const report = await guest.request('GET', '/reports/posts-authors');
    assert.equal(report.status, 200);
    assert.ok(Array.isArray(report.body.rows));
    assert.equal((await guest.request('GET', '/auth/me')).status, 401);
    assert.equal((await guest.request('POST', '/posts', { category: 'FREE', title: '권한 검사', content: '권한 검사' })).status, 401);
    assert.equal((await guest.request('PUT', '/users/me', { nickname: '권한 검사' })).status, 401);
    assert.equal((await guest.request('DELETE', '/users/me', { password })).status, 401);
  });

  await t.test('회원가입 비밀번호가 bcrypt로 저장되고 중복 회원은 거절된다', async () => {
    const registration = await owner.request('POST', '/auth/register', {
      email: emailA, password, nickname: '작성자_' + suffix, student_id: '20608', major: '컴퓨터공학과'
    });
    assert.equal(registration.status, 201, JSON.stringify(registration.body));
    ownerId = registration.body.user.id;
    assert.ok(ownerId);
    assert.equal(registration.body.user.password, undefined);
    assert.equal(String((await owner.request('GET', '/auth/me')).body.user.id), String(ownerId));
    const [rows] = await pool.execute('SELECT password FROM users WHERE id = ?', [ownerId]);
    assert.match(rows[0].password, /^\$2[aby]\$\d{2}\$/);
    assert.notEqual(rows[0].password, password);
    assert.equal(await bcrypt.compare(password, rows[0].password), true);
    const duplicate = await guest.request('POST', '/auth/register', {
      email: emailA, password, nickname: '중복_' + suffix
    });
    assert.equal(duplicate.status, 409);
    const second = await other.request('POST', '/auth/register', {
      email: emailB, password, nickname: '다른회원_' + suffix, student_id: '20609', major: '전자공학과'
    });
    assert.equal(second.status, 201, JSON.stringify(second.body));
  });

  await t.test('로그아웃과 로그인 및 잘못된 비밀번호를 처리한다', async () => {
    assert.equal((await owner.request('POST', '/auth/logout')).status, 200);
    assert.equal((await owner.request('GET', '/auth/me')).status, 401);
    assert.equal((await owner.request('POST', '/auth/login', { email: emailA, password: 'Incorrect123!' })).status, 401);
    const login = await owner.request('POST', '/auth/login', { email: emailA, password });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    assert.equal(String(login.body.user.id), String(ownerId));
    assert.equal(login.body.user.password, undefined);
  });

  await t.test('작성한 게시글이 전체 목록과 회원 JOIN 조회에 나타난다', async () => {
    const created = await owner.request('POST', '/posts', {
      category: 'QUESTION', title: '통합 테스트 ' + suffix, content: '첫 번째 줄\n두 번째 줄'
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    postId = created.body.post.id;
    assert.ok(postId);
    assert.equal(String(created.body.post.user_id), String(ownerId));
    const list = await guest.request('GET', '/posts');
    assert.ok(list.body.posts.some((post) => String(post.id) === String(postId)));
    const detail = await guest.request('GET', '/posts/' + postId);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.post.content, '첫 번째 줄\n두 번째 줄');
    assert.ok(Number(detail.body.post.view_count) >= 1);
    const report = await guest.request('GET', '/reports/posts-authors');
    const joined = report.body.rows.find((row) => String(row.post_id) === String(postId));
    assert.ok(joined);
    assert.equal(String(joined.user_id), String(ownerId));
    assert.equal(joined.nickname, '작성자_' + suffix);
    assert.equal(joined.student_id, '20608');
    assert.equal(joined.major, '컴퓨터공학과');
    assert.equal(joined.category, 'QUESTION');
  });

  await t.test('다른 회원과 비회원은 게시글을 수정하거나 삭제할 수 없다', async () => {
    const attempted = { category: 'FREE', title: '권한 없는 수정', content: '권한 없는 내용' };
    assert.equal((await other.request('PUT', '/posts/' + postId, attempted)).status, 403);
    assert.equal((await other.request('DELETE', '/posts/' + postId)).status, 403);
    assert.equal((await guest.request('PUT', '/posts/' + postId, attempted)).status, 401);
    assert.equal((await guest.request('DELETE', '/posts/' + postId)).status, 401);
    const unchanged = await guest.request('GET', '/posts/' + postId);
    assert.equal(unchanged.status, 200);
    assert.equal(unchanged.body.post.title, '통합 테스트 ' + suffix);
  });

  await t.test('프로필 수정은 JOIN 조회에 반영되고 새 비밀번호로 로그인된다', async () => {
    const profile = {
      email: updatedEmail, nickname: '수정회원_' + suffix, student_id: '20610', major: '소프트웨어학과', password: updatedPassword
    };
    const updated = await owner.request('PUT', '/users/me', profile);
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.user.email, updatedEmail);
    assert.equal(updated.body.user.nickname, profile.nickname);
    assert.equal(updated.body.user.password, undefined);
    const duplicate = await owner.request('PUT', '/users/me', { ...profile, email: emailB, password: undefined });
    assert.equal(duplicate.status, 409);
    const report = await guest.request('GET', '/reports/posts-authors');
    const joined = report.body.rows.find((row) => String(row.post_id) === String(postId));
    assert.equal(joined.nickname, profile.nickname);
    assert.equal(joined.major, profile.major);
    const [rows] = await pool.execute('SELECT password FROM users WHERE id = ?', [ownerId]);
    assert.equal(await bcrypt.compare(updatedPassword, rows[0].password), true);
    assert.equal(await bcrypt.compare(password, rows[0].password), false);
    assert.equal((await owner.request('POST', '/auth/logout')).status, 200);
    assert.equal((await owner.request('POST', '/auth/login', { email: updatedEmail, password })).status, 401);
    assert.equal((await owner.request('POST', '/auth/login', { email: updatedEmail, password: updatedPassword })).status, 200);
  });

  await t.test('작성자는 자신의 게시글을 수정하고 삭제할 수 있다', async () => {
    const edited = await owner.request('PUT', '/posts/' + postId, {
      category: 'INFO', title: '수정된 게시글 ' + suffix, content: '수정한 내용'
    });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(edited.body.post.title, '수정된 게시글 ' + suffix);
    assert.equal(edited.body.post.category, 'INFO');
    assert.equal(edited.body.post.content, '수정한 내용');
    assert.equal((await owner.request('DELETE', '/posts/' + postId)).status, 200);
    assert.equal((await guest.request('GET', '/posts/' + postId)).status, 404);
  });

  await t.test('회원 탈퇴는 비밀번호를 확인하고 게시글을 연쇄 삭제한다', async () => {
    const created = await owner.request('POST', '/posts', {
      category: 'FREE', title: '탈퇴 확인 ' + suffix, content: '회원 삭제와 함께 삭제될 게시글'
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    cascadePostId = created.body.post.id;
    assert.equal((await owner.request('DELETE', '/users/me', { password: 'Incorrect123!' })).status, 401);
    assert.equal((await owner.request('GET', '/auth/me')).status, 200);
    const savedCookies = new Map(owner.cookies);
    assert.equal((await owner.request('DELETE', '/users/me', { password: updatedPassword })).status, 200);
    owner.cookies = savedCookies;
    assert.equal((await owner.request('GET', '/auth/me')).status, 401);
    assert.equal((await owner.request('POST', '/posts', { category: 'FREE', title: '탈퇴 후 작성', content: '거부되어야 함' })).status, 401);
    assert.equal((await guest.request('GET', '/posts/' + cascadePostId)).status, 404);
    assert.equal((await owner.request('POST', '/auth/login', { email: updatedEmail, password: updatedPassword })).status, 401);
    const [users] = await pool.execute('SELECT id FROM users WHERE id = ?', [ownerId]);
    const [posts] = await pool.execute('SELECT id FROM posts WHERE user_id = ?', [ownerId]);
    assert.equal(users.length, 0);
    assert.equal(posts.length, 0);
    const report = await guest.request('GET', '/reports/posts-authors');
    assert.equal(report.body.rows.some((row) => String(row.user_id) === String(ownerId)), false);
    assert.equal((await other.request('DELETE', '/users/me', { password })).status, 200);
  });
});
