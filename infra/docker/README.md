# infra/docker

로컬 개발용 Docker Compose 구성을 담는 디렉토리입니다.

## 구성 파일

- `docker-compose.postgres.yml`: 로컬 Postgres (기본으로 실행)
- `docker-compose.kafka.yml`: 로컬 Kafka (`--profile kafka`로 선택 실행)

루트의 `docker-compose.yml`이 위 파일들을 `include`로 묶습니다.

```bash
# Postgres만 (기본)
docker compose up -d

# Kafka 포함
docker compose --profile kafka up -d
```

## 서비스별 Dockerfile

각 서비스의 배포용 Dockerfile은 이 디렉토리가 아니라 각 서비스 디렉토리(`apps/<service>/Dockerfile`)에 둡니다. 모노레포 빌드 컨텍스트 최적화를 위해 `turbo prune` 기반으로 작성할 예정입니다.
