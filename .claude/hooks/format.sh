#!/bin/sh
# PostToolUse hook: format and lint the file the agent just wrote.
#
# Claude Code passes the tool payload as JSON on stdin; the written path is
# .tool_input.file_path. Exit 0 = silent success. Exit 2 = stderr is fed back to
# the agent to fix. Keep it fast: this runs after every edit.
#
set -eu

payload=$(cat)
if command -v jq >/dev/null 2>&1; then
  file=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty')
else
  file=$(printf '%s' "$payload" |
    sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
fi

[ -n "${file:-}" ] && [ -f "$file" ] || exit 0

case "$file" in
  *.js|*.mjs)
    npx --no-install prettier --write "$file" >/dev/null 2>&1 || true
    ;;
  # UI files: run the slop check so the agent sees DESIGN.md bans while editing,
  # not at commit.
  *.css|*.html)
    command -v node >/dev/null 2>&1 || exit 0  # node not installed here
    if ! out=$(node "$CLAUDE_PROJECT_DIR/checks/design/slop-check.mjs" "$file" 2>&1); then
      printf 'slop-check found banned UI patterns in %s:\n%s\n' "$file" "$out" >&2
      exit 2
    fi
    ;;
  *) exit 0 ;;
esac
