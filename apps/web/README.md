# @oneul-sai/web

오늘 사이 사용자 Web 앱 (Next.js, 포트 3000).

## 역할

- 사용자 대상 웹 화면 (랜딩, 추후 이벤트/매칭 화면)
- `@oneul-sai/ui` 공용 컴포넌트와 `@oneul-sai/api-client`를 통해 API Gateway(4000)와 통신

## 실행 방법

```bash
pnpm --filter @oneul-sai/web dev
```

http://localhost:3000 에서 확인.

## 환경 변수

`.env.example`을 복사해 `.env.local` 생성:

| 변수                  | 설명                | 기본값                  |
| --------------------- | ------------------- | ----------------------- |
| `NEXT_PUBLIC_API_URL` | API Gateway 주소    | `http://localhost:4000` |
