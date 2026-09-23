#!/usr/bin/env bash
# PostToolUse hook: when Claude edits a content file, validate all content.
# Exit 2 feeds the validator output back to Claude so it fixes the problem.
set -euo pipefail
input="$(cat)"
file="$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(j.tool_input?.file_path??"")}catch{}})')"
case "$file" in
  */content/*.json)
    cd "$CLAUDE_PROJECT_DIR"
    if ! out="$(npm run --silent content:validate 2>&1)"; then
      echo "content:validate failed after editing $file:" >&2
      echo "$out" | tail -40 >&2
      exit 2
    fi
    ;;
esac
exit 0
