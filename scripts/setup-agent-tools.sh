#!/usr/bin/env bash
# 오늘사이 — 개인 에이전트 도구 설치 (선택). PC마다 한 번, 다시 실행해도 안전하다.
#
# 저장소에 이미 들어 있는 것(설치 불필요):
#   - 규칙: AGENTS.md(Codex) ← CLAUDE.md가 불러온다(Claude Code)
#   - 프로젝트 스킬(Taste): .claude/skills/(Claude Code) · .agents/skills/(Codex)
#   - Ponytail 마켓플레이스 선언: .claude/settings.json
#
# 이 스크립트가 PC에 설치하는 것:
#   - Ponytail: Claude Code 플러그인 + Codex 플러그인
#   - Graphify: CLI + 두 에이전트용 사용자 스킬(훅 없이)
#   - main 직접 push를 막는 git 훅 켜기(core.hooksPath)
#   - HyperFrames CLI 사용 통계 끄기
#
# 실행: bash scripts/setup-agent-tools.sh   (Git Bash / macOS / Linux)
#       PowerShell: & "C:\Program Files\Git\bin\bash.exe" scripts/setup-agent-tools.sh  (그냥 bash는 WSL로 잡힌다)
set -u

have() { command -v "$1" >/dev/null 2>&1; }
step() { printf '\n== %s\n' "$1"; }
skip() { printf '   건너뜀: %s\n' "$1"; }

step "Ponytail — Claude Code"
if have claude; then
  claude plugin marketplace add DietrichGebert/ponytail || true
  claude plugin install ponytail@ponytail --scope user || true
else
  skip "claude CLI가 없다"
fi

step "Ponytail — Codex"
if have codex; then
  codex plugin marketplace add DietrichGebert/ponytail || true
  codex plugin add ponytail@ponytail || true
  echo "   다음: codex를 실행해 /hooks 에서 ponytail 훅 2개를 검토하고 신뢰한다(node 필요)."
else
  skip "codex CLI가 없다"
fi

step "Graphify — 훅 없이 설치"
if ! have uv; then
  python -m pip install --user uv || pip install uv || true
fi
export PATH="$HOME/.local/bin:$PATH"
if have uv; then
  uv tool install graphifyy || uv tool upgrade graphifyy || true
  if have graphify; then
    graphify install                   # Claude Code: ~/.claude/skills/graphify
    graphify install --platform agents # Codex: ~/.agents/skills/graphify
    echo "   쓰지 않는다: graphify claude install · codex install · hook install · install --project (모두 훅을 넣는다)"
  else
    skip "graphify 명령을 찾지 못했다 — 'uv tool update-shell' 후 새 터미널에서 다시 실행"
  fi
else
  skip "uv를 설치하지 못했다"
fi

step "main 직접 push 막기 (git 훅)"
if git rev-parse --show-toplevel >/dev/null 2>&1; then
  git config core.hooksPath .githooks && echo "   core.hooksPath = .githooks"
else
  skip "git 저장소 안에서 실행하지 않았다"
fi

step "HyperFrames CLI 사용 통계 끄기"
if have npx; then
  npx --yes hyperframes telemetry disable || true
else
  skip "npx가 없다"
fi

printf '\n끝. 새 세션부터 스킬이 로드된다. 저장소를 처음 연 PC에서는 Claude Code와 Codex 모두 폴더 신뢰를 한 번 해 준다.\n'
