# infra/helm

자체 서비스(api-gateway, member-service 등)의 배포는 **Kustomize**(`infra/kubernetes/`)를 사용합니다. (ADR-008 참조)

이 디렉토리는 **서드파티 인프라의 Helm 차트 설치 값(values) 관리용**으로 예약되어 있습니다.

- 예: Kafka, Prometheus, Grafana, Loki 등
- 차트별 `values-<env>.yaml` 파일을 이곳에서 버전 관리할 예정입니다.

현재는 구조만 준비하는 단계이며, 실제 values 파일은 해당 인프라 도입 시점에 작성합니다.
