# @oneul-sai/mobile

오늘사이 사용자 모바일 앱입니다. Expo(React Native) 기반이며, API Gateway(`http://localhost:4000`)를 통해 백엔드와 통신합니다.

## 실행 방법

```bash
pnpm --filter @oneul-sai/mobile start
```

실행 후 표시되는 QR 코드를 Expo Go 앱으로 스캔하면 기기에서 바로 확인할 수 있습니다.

## 환경 변수

`.env.example`을 참고하여 `.env`를 생성하세요.

- `EXPO_PUBLIC_API_URL`: API Gateway 주소 (기본값 `http://localhost:4000`)
