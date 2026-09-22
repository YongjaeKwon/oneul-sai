# @oneul-sai/admin

오늘사이 관리자 웹 콘솔입니다. 회원·이벤트·매칭·결제 등 서비스 운영 기능을 담당할 Next.js 앱으로, 현재는 환경 구성 단계라 placeholder 홈 화면만 있습니다.

## 실행

```bash
pnpm --filter @oneul-sai/admin dev
```

- 개발 서버: http://localhost:3001

## 환경 변수

`.env.example`을 복사해 `.env.local`을 만들어 사용합니다.

| 변수                  | 설명                     | 기본값                  |
| --------------------- | ------------------------ | ----------------------- |
| `NEXT_PUBLIC_API_URL` | API Gateway 주소         | `http://localhost:4000` |

## 기타

- 공용 UI는 `@oneul-sai/ui`, API 호출은 `@oneul-sai/api-client`(`lib/api.ts`)를 사용합니다.
- `lint` / `typecheck` / `build` 스크립트는 루트 turbo 태스크로 실행됩니다.
