# CLAUDE.md

작업 규칙의 원본은 [AGENTS.md](AGENTS.md)다(Codex와 같은 파일을 쓴다). Claude Code는 아래 줄로 그 내용을 불러온다.

@AGENTS.md

## Claude Code 전용

- 프로젝트 스킬은 `.claude/skills/`에서 읽힌다. 스킬을 추가 · 갱신하면 Codex용 `.agents/skills/`에도 같은 upstream 커밋의 사본을 둔다(Impeccable은 Codex용 빌드가 따로 있다).
- 규칙을 고칠 때는 이 파일이 아니라 AGENTS.md를 고친다.
