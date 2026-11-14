export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function textField(value, label, maxLength, required = true, minLength = 1) {
  if (!required && (value === undefined || value === null || value === '')) return null;
  if (typeof value !== 'string') throw new HttpError(400, label + '을(를) 올바르게 입력해 주세요.');
  const trimmed = value.trim();
  if (!required && !trimmed) return null;
  if (trimmed.length < minLength || trimmed.length > maxLength) {
    throw new HttpError(400, label + '은(는) ' + minLength + '~' + maxLength + '자로 입력해 주세요.');
  }
  return trimmed;
}

export function passwordField(value) {
  if (typeof value !== 'string' || value.length < 8 || Buffer.byteLength(value, 'utf8') > 72) {
    throw new HttpError(400, '비밀번호는 8자 이상, UTF-8 기준 72바이트 이하로 입력해 주세요.');
  }
  return value;
}

export function profileFields(body) {
  const email = textField(body.email, '이메일', 255).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, '이메일 형식을 확인해 주세요.');
  }
  return {
    email,
    nickname: textField(body.nickname, '닉네임', 50, true, 2),
    student_id: textField(body.student_id, '학번', 20, false),
    major: textField(body.major, '학과', 100, false)
  };
}

export function postFields(body) {
  const category = body.category ?? 'FREE';
  if (!['FREE', 'QUESTION', 'INFO'].includes(category)) {
    throw new HttpError(400, '올바른 게시판을 선택해 주세요.');
  }
  const title = textField(body.title, '제목', 200);
  const content = textField(body.content, '내용', 65535);
  if (Buffer.byteLength(content, 'utf8') > 65535) {
    throw new HttpError(400, '내용은 UTF-8 기준 65,535바이트 이하로 입력해 주세요.');
  }
  return { category, title, content };
}

export function validId(value) {
  if (!/^[1-9][0-9]{0,19}$/.test(value) || BigInt(value) > 18446744073709551615n) {
    throw new HttpError(400, '올바른 게시글 번호가 아닙니다.');
  }
  return value;
}
