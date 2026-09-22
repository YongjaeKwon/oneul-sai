# infra/kubernetes

오늘사이(oneul-sai) 서비스의 Kubernetes 배포 구성을 담을 디렉토리입니다.
현재는 **구조만 준비하는 단계**이며, 실제 매니페스트는 Kubernetes 배포 단계에서 작성합니다.

## 배포 도구 선택

- **Kustomize**를 사용합니다. 자체 서비스 배포에 Helm과 중복으로 사용하지 않습니다. (ADR-008 참조)
- 서드파티 인프라(Kafka, Prometheus 등)의 Helm 차트 값 관리는 `infra/helm/`에서 담당합니다.

## 계획된 디렉토리 구조

```
infra/kubernetes/
├── base/
│   ├── api-gateway/
│   ├── member-service/
│   ├── event-service/
│   ├── matching-service/
│   ├── notification-service/
│   └── payment-service/
└── overlays/
    ├── local/
    ├── dev/
    └── prod/
```

- **namespace**: `oneul-sai`
- **base/<service>/**: 서비스별 공통 리소스 정의
  - Deployment
  - Service
  - ConfigMap
  - Secret
  - 필요 시 HPA, Ingress, PodDisruptionBudget
- **overlays/**: 환경별(local / dev / prod) 오버레이 — 리플리카 수, 리소스 제한, 환경 변수 등 환경별 차이를 패치로 관리

## Health Check

각 서비스가 노출하는 `/health` 엔드포인트를 Liveness Probe / Readiness Probe에 사용할 예정입니다.

## 작성 시점

실제 매니페스트(kustomization.yaml, Deployment 등)는 서비스가 컨테이너 이미지로 빌드되고 배포 환경이 확정되는 Kubernetes 배포 단계에서 작성합니다. 그 전까지 이 디렉토리에는 문서만 유지합니다.
