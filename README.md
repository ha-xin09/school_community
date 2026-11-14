# 학교 커뮤니티 20608

React + Vite 프론트엔드, Node.js + Express 백엔드, 로컬 MySQL을 사용하는 학교 커뮤니티 과제입니다.

## 실행 준비

- Node.js 22.12 이상과 npm을 설치합니다. Node.js 24 LTS를 사용할 수 있습니다.
- 로컬 MySQL 8.0을 실행합니다.
- 기본 연결 설정: `127.0.0.1:3306`, 사용자 `root`, 비밀번호 `1234`, 데이터베이스 `community_20608`.
- `server/.env`에서 연결 정보를 변경할 수 있습니다. 파일이 없으면 같은 기본값을 사용합니다.

## 개발 모드 실행

프로젝트 루트에서 실행합니다.

```powershell
cd C:\dbp\school_community_20608
npm install
npm run db:init
npm run dev
```

브라우저에서 http://localhost:5173 을 엽니다. 프론트엔드와 백엔드가 함께 실행됩니다. 종료는 터미널에서 `Ctrl+C`를 누릅니다. `db:init`은 제공된 스키마를 사용하며 기존 데이터나 테이블을 삭제하지 않습니다.

각각 실행하려면 두 터미널을 사용합니다.

```powershell
cd C:\dbp\school_community_20608\server
npm run dev
```

```powershell
cd C:\dbp\school_community_20608\client
npm run dev
```

프론트엔드는 5173, API 서버는 3001 포트를 사용합니다. Vite가 `/api` 요청을 백엔드로 전달합니다.

## 빌드 및 실행

```powershell
cd C:\dbp\school_community_20608
npm run build
npm start
```

브라우저에서 http://localhost:3001 을 엽니다. Express가 빌드된 `client/dist`와 API를 함께 제공합니다. `vite preview`는 화면 빌드 확인용이며 이 프로젝트 전체 실행은 `npm start`를 사용합니다.

## 구현 기능

| 요구사항 | 메뉴 및 구현 |
| --- | --- |
| 회원 Create | 회원가입, bcrypt 12라운드 비밀번호 해싱, 가입 후 자동 로그인 |
| 회원 Read | 로그인, 로그인한 회원의 프로필 조회 |
| 회원 Update | 마이페이지에서 이메일·닉네임·학번·학과·비밀번호 수정 |
| 회원 Delete | 비밀번호 확인 후 회원 탈퇴 |
| 게시글 Create | 로그인한 회원만 게시글 작성 |
| 게시글 Read | 비회원 포함 전체 게시글 목록 및 상세 조회 |
| 게시글 Update | 작성자 본인만 수정 |
| 게시글 Delete | 작성자 본인만 삭제 |
| 두 테이블 JOIN | 작성자별 게시글 메뉴에서 게시글과 작성자의 닉네임·학번·학과 조회 |

카테고리는 자유, 질문, 정보입니다. 비밀번호는 8자 이상, UTF-8 기준 72바이트 이하입니다. 회원 탈퇴는 실제 행 삭제 방식이며 제공된 `ON DELETE CASCADE`에 따라 해당 회원의 게시글도 삭제됩니다. `deleted_at` 컬럼은 제공된 스키마를 유지하기 위해 남겨두었습니다.

비밀번호는 응답에 포함하지 않습니다. 인증은 HttpOnly 세션 쿠키를 사용하며, 게시글 작성자 확인은 백엔드에서 수행합니다. 로컬 과제용 메모리 세션이므로 서버를 재시작하면 다시 로그인해야 합니다.

## 구조

```text
school_community_20608/
  client/
    src/
    package.json
    vite.config.js
  server/
    src/
    scripts/init-db.js
    schema.sql
    .env.example
    package.json
  tests/integration.test.js
  package.json
  package-lock.json
  README.md
```

## API

| 메서드 | 경로 | 기능 |
| --- | --- | --- |
| POST | /api/auth/register | 회원가입 |
| POST | /api/auth/login | 로그인 |
| POST | /api/auth/logout | 로그아웃 |
| GET | /api/auth/me | 내 프로필 조회 |
| PUT | /api/users/me | 내 프로필 수정 |
| DELETE | /api/users/me | 회원 탈퇴 |
| GET | /api/posts | 전체 게시글 조회 |
| GET | /api/posts/:id | 게시글 상세 조회 |
| POST | /api/posts | 게시글 작성 |
| PUT | /api/posts/:id | 내 게시글 수정 |
| DELETE | /api/posts/:id | 내 게시글 삭제 |
| GET | /api/reports/posts-authors | users와 posts JOIN 결과 조회 |

## 검증

MySQL 실행 및 DB 초기화 후 다음 명령어를 사용합니다. API 서버를 따로 켜지 않아도 테스트가 임시 포트에서 실행됩니다.

```powershell
npm test
npm run build
```

통합 테스트는 고유한 테스트 회원과 게시글을 생성하고 정리합니다. 기존 회원과 게시글은 변경하지 않습니다. bcrypt 저장, 로그인·로그아웃, 프로필 수정, 게시글 CRUD, 비회원/다른 작성자의 접근 차단, JOIN 결과, 탈퇴 시 연쇄 삭제를 확인합니다.

## 실행 문제 해결

- `npm` 또는 `node`를 찾을 수 없으면 [Node.js](https://nodejs.org/) 설치 후 터미널을 다시 엽니다. PowerShell 실행 정책이 `npm.ps1`을 차단하면 `npm.cmd`로 실행할 수 있습니다.
- DB 연결 실패 시 Windows 서비스의 MySQL 실행 상태와 `server/.env`를 확인합니다.
- 테이블이 없다는 오류는 프로젝트 루트에서 `npm run db:init`으로 해결합니다.
- 포트가 사용 중이면 먼저 기존 개발 서버를 종료합니다.

참고: [Vite 실행 환경](https://vite.dev/guide/), [Express 세션 문서](https://expressjs.com/en/resources/middleware/session/).

최종 확인: 실제 MySQL 통합 시나리오 8개 통과, 프론트엔드 빌드 성공, 브라우저에서 회원가입·게시글 작성/수정·프로필 수정·JOIN 조회·로그아웃 확인. 검증용 계정과 게시글은 정리했습니다.
