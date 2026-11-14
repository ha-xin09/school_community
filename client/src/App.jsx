import { useEffect, useState } from 'react';

const categories = { FREE: '자유게시판', QUESTION: '질문게시판', INFO: '정보게시판' };

async function api(path, options = {}) {
  const response = await fetch('/api' + path, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function go(path) {
  window.location.hash = path;
}

function date(value, full = false) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', full
    ? { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { year: 'numeric', month: '2-digit', day: '2-digit' }).format(parsed);
}

function Loading() {
  return <div className="status-box" role="status">불러오는 중입니다.</div>;
}

function ErrorBox({ error }) {
  return error ? <p className="form-error" role="alert">{error}</p> : null;
}

function Empty({ title = '등록된 게시글이 없습니다.', description, action }) {
  return <div className="empty-state"><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>;
}

function Category({ value }) {
  return <span className={'category category-' + value?.toLowerCase()}>{categories[value] || value}</span>;
}

export default function App() {
  const [path, setPath] = useState(window.location.hash.slice(1) || '/');
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [logoutBusy, setLogoutBusy] = useState(false);

  useEffect(() => {
    const change = () => {
      setPath(window.location.hash.slice(1) || '/');
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', change);
    api('/auth/me').then(data => setUser(data.user)).catch(error => {
      if (error.status !== 401) setNotice(error.message);
    }).finally(() => setAuthReady(true));
    return () => window.removeEventListener('hashchange', change);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 6000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  async function logout() {
    setLogoutBusy(true);
    try {
      await api('/auth/logout', { method: 'POST' });
      setUser(null);
      setNotice('로그아웃되었습니다.');
      go('/');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLogoutBusy(false);
    }
  }

  const isReport = path === '/authors';
  const isProfile = path === '/mypage';
  const shared = { user, setUser, notify: setNotice };
  let page;
  if (!authReady) page = <Loading />;
  else if (path === '/') page = <Board {...shared} />;
  else if (path === '/authors') page = <Authors />;
  else if (path === '/login' || path === '/signup') page = <Auth key={path} signup={path === '/signup'} {...shared} />;
  else if (path === '/mypage') page = <Profile {...shared} />;
  else if (path === '/posts/new') page = <PostForm {...shared} />;
  else if (/^\/posts\/\d+\/edit$/.test(path)) page = <PostForm key={path} id={path.split('/')[2]} {...shared} />;
  else if (/^\/posts\/\d+$/.test(path)) page = <PostDetail key={path} id={path.split('/')[2]} {...shared} />;
  else page = <Empty title="페이지를 찾을 수 없습니다." description="주소를 확인하거나 게시판으로 돌아가 주세요." action={<a href="#/" className="button primary">게시판으로</a>} />;

  return <div className="app">
    <header className="site-header">
      <div className="header-inner">
        <a href="#/" className="site-title">학교 커뮤니티</a>
        <nav className="site-nav" aria-label="주 메뉴">
          <a href="#/" aria-current={path === '/' || path.startsWith('/posts/') ? 'page' : undefined}>게시판</a>
          <a href="#/authors" aria-current={isReport ? 'page' : undefined}>작성자별 게시글</a>
        </nav>
        <div className="account-nav">
          {user ? <>
            <a href="#/mypage" aria-current={isProfile ? 'page' : undefined}>마이페이지</a>
            <button type="button" disabled={logoutBusy} onClick={logout}>{logoutBusy ? '처리 중...' : '로그아웃'}</button>
          </> : <>
            <a href="#/login">로그인</a>
            <a href="#/signup">회원가입</a>
          </>}
        </div>
      </div>
    </header>
    <main className="main-content">
      {notice && <div className="notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="알림 닫기">닫기</button></div>}
      {page}
    </main>
  </div>;
}

function Board({ user }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('ALL');
  useEffect(() => {
    let active = true;
    api('/posts').then(data => { if (active) setPosts(data.posts); }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const visible = category === 'ALL' ? posts : posts.filter(post => post.category === category);
  return <section aria-labelledby="board-title">
    <div className="section-heading">
      <h1 id="board-title">게시판 <span className="post-count">({posts.length})</span></h1>
      <a className="button primary" href={user ? '#/posts/new' : '#/login'}>글쓰기</a>
    </div>
    <div className="board-toolbar">
      <div className="tabs" role="group" aria-label="게시글 분류">
        {[['ALL', '전체'], ...Object.entries(categories)].map(([value, label]) => <button type="button" aria-pressed={category === value} className={category === value ? 'active' : ''} onClick={() => setCategory(value)} key={value}>{label}</button>)}
      </div>
      <span className="sort-label">최신순</span>
    </div>
    {loading ? <Loading /> : error ? <ErrorBox error={error} /> : <div className="table-scroll">
      <table className="post-table">
        <thead><tr><th scope="col">분류</th><th scope="col">제목</th><th scope="col">작성자</th><th scope="col">작성일</th><th scope="col">조회</th></tr></thead>
        <tbody>{visible.length ? visible.map(post => <tr key={post.id}>
          <td><Category value={post.category} /></td>
          <td className="title-cell"><a href={'#/posts/' + post.id}>{post.title}</a></td>
          <td>{post.author_nickname}</td>
          <td className="nowrap"><time dateTime={post.created_at}>{date(post.created_at)}</time></td>
          <td>{post.view_count}</td>
        </tr>) : <tr><td colSpan={5} className="empty-cell">등록된 게시글이 없습니다.</td></tr>}</tbody>
      </table>
    </div>}
  </section>;
}

function Auth({ signup, user, setUser, notify }) {
  const [values, setValues] = useState({ email: '', password: '', nickname: '', student_id: '', major: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const change = event => setValues({ ...values, [event.target.name]: event.target.value });
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (signup && new TextEncoder().encode(values.password).length > 72) {
      setError('비밀번호는 UTF-8 기준 72바이트 이내로 입력해 주세요.');
      return;
    }
    setBusy(true);
    try {
      const data = await api(signup ? '/auth/register' : '/auth/login', { method: 'POST', body: JSON.stringify(values) });
      setUser(data.user);
      notify(signup ? '회원가입이 완료되었습니다.' : '로그인되었습니다.');
      go('/');
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  if (user) return <Empty title="이미 로그인되어 있습니다."  action={<a href="#/" className="button primary">게시판으로</a>} />;
  return <div className="auth-layout">
    <section className="form-card auth-card"><h1>{signup ? '회원가입' : '로그인'}</h1><p className="form-description">{signup ? '학교 커뮤니티에서 사용할 정보를 입력해 주세요.' : '가입한 이메일과 비밀번호를 입력해 주세요.'}</p><form onSubmit={submit}><ErrorBox error={error} />
      <label>이메일<span className="required">*</span><input autoFocus type="email" name="email" value={values.email} onChange={change} maxLength={255} autoComplete="email" placeholder="you@school.ac.kr" required /></label>
      <label>비밀번호<span className="required">*</span><input type="password" name="password" value={values.password} onChange={change} minLength={signup ? 8 : undefined} maxLength={72} autoComplete={signup ? 'new-password' : 'current-password'} placeholder={signup ? '8자 이상 입력해 주세요' : '비밀번호를 입력해 주세요'} required /></label>
      {signup && <><label>닉네임<span className="required">*</span><input name="nickname" value={values.nickname} onChange={change} minLength={2} maxLength={50} autoComplete="nickname" placeholder="2~50자" required /></label><div className="form-grid"><label>학번<span className="optional">선택</span><input name="student_id" value={values.student_id} onChange={change} maxLength={20} placeholder="예: 20608" /></label><label>학과<span className="optional">선택</span><input name="major" value={values.major} onChange={change} maxLength={100} placeholder="예: 컴퓨터공학과" /></label></div></>}
      <button className="button primary full" disabled={busy}>{busy ? '처리 중...' : signup ? '회원가입' : '로그인'}</button>
    </form><p className="form-switch">{signup ? '이미 회원이신가요?' : '아직 계정이 없으신가요?'} <a href={signup ? '#/login' : '#/signup'}>{signup ? '로그인' : '회원가입'}</a></p></section>
  </div>;
}

function LoginRequired() {
  return <Empty title="로그인이 필요합니다." action={<a href="#/login" className="button primary">로그인하기</a>} />;
}

function Profile({ user, setUser, notify }) {
  const [values, setValues] = useState({ email: user?.email || '', nickname: user?.nickname || '', student_id: user?.student_id || '', major: user?.major || '', password: '' });
  const [error, setError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const change = event => setValues({ ...values, [event.target.name]: event.target.value });
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (values.password && new TextEncoder().encode(values.password).length > 72) {
      setError('비밀번호는 UTF-8 기준 72바이트 이내로 입력해 주세요.');
      return;
    }
    setBusy(true);
    const payload = { ...values };
    if (!payload.password) delete payload.password;
    try {
      const data = await api('/users/me', { method: 'PUT', body: JSON.stringify(payload) });
      setUser(data.user);
      setValues({ ...values, password: '' });
      notify('프로필이 수정되었습니다.');
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(event) {
    event.preventDefault();
    if (deleting || !window.confirm('회원 탈퇴 시 계정과 작성한 모든 게시글이 삭제되며 복구할 수 없습니다. 탈퇴하시겠습니까?')) return;
    setDeleteError('');
    setDeleting(true);
    try {
      await api('/users/me', { method: 'DELETE', body: JSON.stringify({ password: deletePassword }) });
      setUser(null);
      notify('회원 탈퇴가 완료되었습니다.');
      go('/');
    } catch (error) {
      setDeleteError(error.message);
    } finally {
      setDeleting(false);
    }
  }
  if (!user) return <LoginRequired />;
  return <div className="narrow-page"><div className="page-heading"><h1>마이페이지</h1></div>
    <section className="form-card"><h2>프로필 수정</h2><p className="form-description">변경할 정보를 입력한 후 저장해 주세요.</p><form onSubmit={submit}><ErrorBox error={error} /><div className="form-grid"><label>이메일<span className="required">*</span><input type="email" name="email" value={values.email} onChange={change} maxLength={255} autoComplete="email" required /></label><label>닉네임<span className="required">*</span><input name="nickname" value={values.nickname} onChange={change} minLength={2} maxLength={50} autoComplete="nickname" required /></label></div><div className="form-grid"><label>학번<span className="optional">선택</span><input name="student_id" value={values.student_id} onChange={change} maxLength={20} placeholder="학번을 입력해 주세요" /></label><label>학과<span className="optional">선택</span><input name="major" value={values.major} onChange={change} maxLength={100} placeholder="학과를 입력해 주세요" /></label></div><label>새 비밀번호<span className="optional">선택</span><input type="password" name="password" value={values.password} onChange={change} minLength={8} maxLength={72} autoComplete="new-password" placeholder="변경할 경우에만 8자 이상 입력해 주세요" /></label><div className="form-actions"><button className="button primary" disabled={busy || deleting}>{busy ? '저장 중...' : '변경사항 저장'}</button></div></form></section>
    <section className="danger-zone"><div><h3>회원 탈퇴</h3><p>탈퇴하면 계정과 작성한 게시글이 모두 삭제됩니다.</p></div><button type="button" className="text-danger" disabled={busy || deleting} onClick={() => setShowDelete(!showDelete)}>{showDelete ? '취소' : '탈퇴하기'}</button>{showDelete && <form className="delete-form" onSubmit={remove}><ErrorBox error={deleteError} /><label>현재 비밀번호<input type="password" value={deletePassword} onChange={event => setDeletePassword(event.target.value)} required autoComplete="current-password" placeholder="본인 확인을 위해 비밀번호를 입력해 주세요" /></label><button className="button danger" disabled={deleting || busy}>{deleting ? '탈퇴 처리 중...' : '계정 및 게시글 삭제'}</button></form>}</section>
  </div>;
}

function PostDetail({ id, user, notify }) {
  const [post, setPost] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api('/posts/' + id).then(data => { if (active) setPost(data.post); }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);
  async function remove() {
    if (busy || !window.confirm('이 게시글을 삭제하시겠습니까? 삭제한 게시글은 복구할 수 없습니다.')) return;
    setBusy(true);
    setError('');
    try {
      await api('/posts/' + id, { method: 'DELETE' });
      notify('게시글이 삭제되었습니다.');
      go('/');
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading />;
  return <div className="detail-page"><a href="#/" className="back-link">전체 게시글</a><ErrorBox error={error} />{post && <article className="article"><header className="article-heading"><Category value={post.category} /><h1>{post.title}</h1><div className="article-meta"><div className="author-identity"><div><strong>{post.author_nickname}</strong><span>{post.author_major || ''}</span></div></div><div className="article-date"><time dateTime={post.created_at}>{date(post.created_at, true)}</time><span>조회 {post.view_count}</span></div></div></header><div className="article-body">{post.content}</div><footer className="article-footer"><a href="#/" className="button secondary">목록으로</a>{user && String(user.id) === String(post.user_id) && <div className="button-group"><a href={'#/posts/' + id + '/edit'} className="button secondary">수정</a><button type="button" className="button danger-subtle" onClick={remove} disabled={busy}>{busy ? '삭제 중...' : '삭제'}</button></div>}</footer></article>}</div>;
}

function PostForm({ id, user, notify }) {
  const [values, setValues] = useState({ category: 'FREE', title: '', content: '' });
  const [loading, setLoading] = useState(Boolean(id));
  const [allowed, setAllowed] = useState(!id);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const change = event => setValues({ ...values, [event.target.name]: event.target.value });
  useEffect(() => {
    if (!id || !user) {
      setLoading(false);
      return;
    }
    let active = true;
    api('/posts/' + id).then(({ post }) => {
      if (!active) return;
      if (String(post.user_id) !== String(user.id)) {
        setError('본인이 작성한 게시글만 수정할 수 있습니다.');
        setAllowed(false);
      } else {
        setValues({ category: post.category, title: post.title, content: post.content });
        setAllowed(true);
      }
    }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, user?.id]);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { post } = await api(id ? '/posts/' + id : '/posts', { method: id ? 'PUT' : 'POST', body: JSON.stringify(values) });
      notify(id ? '게시글이 수정되었습니다.' : '게시글이 등록되었습니다.');
      go('/posts/' + post.id);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  if (!user) return <LoginRequired />;
  if (loading) return <Loading />;
  return <div className="narrow-page"><a href={id ? '#/posts/' + id : '#/'} className="back-link">{id ? '게시글로 돌아가기' : '전체 게시글'}</a><div className="page-heading"><h1>{id ? '게시글 수정' : '글쓰기'}</h1></div><section className="form-card editor-card"><ErrorBox error={error} />{allowed && <form onSubmit={submit}><label className="category-field">게시판<span className="required">*</span><select name="category" value={values.category} onChange={change}>{Object.entries(categories).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>제목<span className="required">*</span><input name="title" value={values.title} onChange={change} maxLength={200} placeholder="제목" required /></label><label>내용<span className="required">*</span><textarea name="content" value={values.content} onChange={change} rows={12} maxLength={10000} placeholder="내용" required /></label><div className="editor-bottom"><span>{values.content.length.toLocaleString()} / 10,000</span><div className="button-group"><a href={id ? '#/posts/' + id : '#/'} className="button secondary">취소</a><button className="button primary" disabled={busy}>{busy ? '저장 중...' : id ? '수정 완료' : '게시글 등록'}</button></div></div></form>}</section></div>;
}

function Authors() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api('/reports/posts-authors').then(data => { if (active) setRows(data.rows); }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  return <section aria-labelledby="authors-title">
    <div className="page-heading report-heading"><h1 id="authors-title">작성자별 게시글</h1><p>게시글과 회원 정보를 함께 조회합니다.</p></div>
    {loading ? <Loading /> : error ? <ErrorBox error={error} /> : <div className="table-scroll">
      <table>
        <thead><tr><th scope="col">분류</th><th scope="col">제목</th><th scope="col">작성자</th><th scope="col">학번</th><th scope="col">학과</th><th scope="col">작성일</th></tr></thead>
        <tbody>{rows.length ? rows.map(row => <tr key={row.post_id}>
          <td><Category value={row.category} /></td>
          <td className="title-cell"><a href={'#/posts/' + row.post_id}>{row.title}</a></td>
          <td>{row.nickname}</td>
          <td>{row.student_id || '-'}</td>
          <td>{row.major || '-'}</td>
          <td className="nowrap">{date(row.created_at)}</td>
        </tr>) : <tr><td colSpan={6} className="empty-cell">등록된 게시글이 없습니다.</td></tr>}</tbody>
      </table>
    </div>}
  </section>;
}
