# infra/monitoring

모니터링/관측(Observability) 구성을 담을 디렉토리입니다. **초기 단계에서는 구축하지 않으며**, 향후 도입 시 이곳에서 관리합니다.

## 계획

- **Prometheus**: 메트릭 수집
- **Grafana**: 대시보드 및 시각화
- **Loki**: 로그 집계
- (선택) **OpenTelemetry**: 분산 트레이싱

## Request ID / Correlation ID 연계

api-gateway가 부여하는 `x-request-id` 헤더를 전 서비스 로그에 포함시키는 전략과 연계하여, 로그(Loki)와 트레이스(OpenTelemetry)를 요청 단위로 상관 분석할 수 있도록 설계할 예정입니다.

서드파티 차트(Prometheus, Grafana, Loki) 설치 값은 `infra/helm/`에서 관리합니다.
