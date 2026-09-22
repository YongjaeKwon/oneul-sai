-- Database per Service
-- 개발 환경에서는 하나의 PostgreSQL Instance를 공유하지만,
-- 각 서비스는 자신의 논리 Database만 소유하고 접근한다.

CREATE DATABASE member_db;
CREATE DATABASE event_db;
CREATE DATABASE matching_db;
CREATE DATABASE notification_db;
CREATE DATABASE payment_db;
