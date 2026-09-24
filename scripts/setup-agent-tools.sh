#!/usr/bin/env bash
# 오늘사이 — 개인 에이전트 도구 설치 (선택). PC마다 한 번, 다시 실행해도 안전하다.
#
# 저장소에 이미 들어 있는 것(설치 불필요):
#   - 규칙: AGENTS.md(Codex) ← CLAUDE.md가 불러온다(Claude Code)
#   - 프로젝트 스킬: .claude/skills/(Claude Code) · .agents/skills/(Codex). 커밋된 사본이 곧 버전 고정이다
#       Taste       Leonxlnx/taste-skill 3c7017d636
#       Emil        emilkowalski/skills d16ebe60d0 — emil-design-eng · animate · review-animations · mobile-native
#       Impeccable  pbakaus/impeccable skill-v4.3.1 (cd12f8660e) — 검사 엔진 0.1.5는 아래에서 받아 둔다(sha256 확인)
#   - Ponytail 마켓플레이스 선언 · 막아 둔 도구: .claude/settings.json
#   - Figma: claude.ai 커넥터(계정 단위, PC마다 설치 없음)
#
# 이 스크립트가 PC에 설치하는 것:
#   - Ponytail: Claude Code 플러그인 + Codex 플러그인
#   - Graphify: CLI + 두 에이전트용 사용자 스킬(훅 없이)
#   - Playwright MCP(@playwright/mcp 0.0.82): Claude Code(사용자 범위) + Codex, localhost만
#   - 도구 사용 통계 · Impeccable 업데이트 확인 끄기(DO_NOT_TRACK, IMPECCABLE_NO_UPDATE_CHECK)
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

case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) WIN=1 ;; *) WIN=0 ;; esac

step "Playwright MCP — localhost 화면 확인용"
PW='@playwright/mcp@0.0.82' # 버전을 올릴 때는 이 값만 바꾼다(0.0.x라 자주 나온다)
# 설정은 인자 대신 환경 변수로 넘긴다 — Windows의 cmd /c가 ';'이나 공백이 든 인자를 다시 해석하지 않게
PW_ENV=(PLAYWRIGHT_MCP_ISOLATED=true
  'PLAYWRIGHT_MCP_ALLOWED_ORIGINS=http://localhost:3000;http://localhost:3001;http://localhost:4000')
if [ "$WIN" = 1 ]; then # Windows는 npx를 cmd /c로 감싼다. Edge는 Windows 11에 늘 있어 브라우저를 따로 받지 않는다
  PW_CMD=(cmd /c npx -y "$PW")
  PW_ENV+=(PLAYWRIGHT_MCP_BROWSER=msedge "PLAYWRIGHT_MCP_OUTPUT_DIR=$(cygpath -w "${TEMP:-/tmp}")\\playwright-mcp")
else
  PW_CMD=(npx -y "$PW")
  PW_ENV+=("PLAYWRIGHT_MCP_OUTPUT_DIR=${TMPDIR:-/tmp}/playwright-mcp")
fi
if have claude; then
  if claude mcp get playwright >/dev/null 2>&1; then
    echo "   이미 있다. 버전을 바꾸려면: claude mcp remove playwright -s user 후 다시 실행"
  else
    e=()
    for kv in "${PW_ENV[@]}"; do e+=(-e "$kv"); done
    MSYS_NO_PATHCONV=1 claude mcp add playwright --scope user "${e[@]}" -- "${PW_CMD[@]}" || true
  fi
else
  skip "claude CLI가 없다"
fi
if have codex; then
  CFG="$HOME/.codex/config.toml"
  if grep -q '^\[mcp_servers\.playwright\]' "$CFG" 2>/dev/null; then
    echo "   이미 있다: $CFG [mcp_servers.playwright]"
  else
    mkdir -p "$HOME/.codex"
    {
      printf "\n[mcp_servers.playwright]\ncommand = '%s'\nargs = [" "${PW_CMD[0]}"
      printf "'%s', " "${PW_CMD[@]:1}"
      printf "]\nstartup_timeout_sec = 60\ndisabled_tools = ['browser_run_code_unsafe']\n\n[mcp_servers.playwright.env]\n"
      for kv in "${PW_ENV[@]}"; do printf "%s = '%s'\n" "${kv%%=*}" "${kv#*=}"; done
    } >>"$CFG"
    echo "   추가했다: $CFG [mcp_servers.playwright]"
  fi
else
  skip "codex CLI가 없다"
fi

step "도구 사용 통계 · Impeccable 업데이트 확인 끄기"
for kv in DO_NOT_TRACK=1 IMPECCABLE_NO_UPDATE_CHECK=1; do
  if [ "$WIN" = 1 ]; then
    setx "${kv%%=*}" "${kv#*=}" >/dev/null && echo "   $kv (사용자 환경 변수, 새 터미널부터)"
  else
    grep -qx "export $kv" ~/.profile 2>/dev/null || echo "export $kv" >>~/.profile
    echo "   $kv (~/.profile)"
  fi
done

step "Impeccable 검사 엔진 준비 — 고정 버전을 받아 sha256을 확인한다"
IMP=.claude/skills/impeccable/scripts/impeccable
if [ -f "$IMP" ]; then
  # engine-probe: 없으면 고정 버전(scripts/VERSION)을 공식 릴리스에서 받아 sha256을 확인한 뒤 ~/.impeccable/bin/<버전>/에 둔다
  if out=$(DO_NOT_TRACK=1 IMPECCABLE_NO_UPDATE_CHECK=1 sh "$IMP" engine-probe 2>&1); then
    echo "   $out"
  else
    printf '   엔진 준비 실패:\n%s\n' "$out"
  fi
else
  skip "저장소 루트에서 실행하지 않았거나 Impeccable 스킬이 없다"
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
