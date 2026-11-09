#!/bin/sh
# Prints Herdr context for claude|copilot SessionStart hooks; silent outside Herdr.
# POSIX sh + awk only. The whole JSON is capped at 9,000 bytes, cut on a whole UTF-8 character.
cli="${1:-}"
[ -n "${HC_TERMINAL_ID:-}" ] || exit 0
command -v herdr-app >/dev/null 2>&1 && command -v hc >/dev/null 2>&1 || exit 0
case "$cli" in
  claude) case "${CLAUDE_CODE_ENTRYPOINT:-cli}" in cli|sdk-cli) ;; *) exit 0 ;; esac
    pre='{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"'; post='"}}' ;;
  copilot) pre='{"additionalContext":"'; post='"}' ;;
  *) exit 0 ;;
esac
primer="This is a Herdr terminal. Your address is $HC_TERMINAL_ID. Run \`herdr-app --skill\` before changing the window. Run \`hc --skill\` before starting or coordinating agents."
[ -z "${HERDR_CONTEXT_PROBE:-}" ] || primer="$primer Probe: $HERDR_CONTEXT_PROBE"
{ printf '%s\n\n' "$primer"; herdr-app --skill 2>/dev/null; } |
LC_ALL=C awk -v pre="$pre" -v post="$post" -v max=9000 '
BEGIN { for (i = 1; i < 256; i++) ord[sprintf("%c", i)] = i; ORS = "" }
{ text = text (NR > 1 ? "\n" : "") $0 }
END {
  budget = max - length(pre) - length(post); out = ""; n = length(text); i = 1
  while (i <= n) {
    c = substr(text, i, 1); b = ord[c]; w = 1
    if (b >= 240) w = 4; else if (b >= 224) w = 3; else if (b >= 192) w = 2
    if (c == "\\") e = "\\\\"; else if (c == "\"") e = "\\\""; else if (c == "\n") e = "\\n"
    else if (c == "\t") e = "\\t"; else if (c == "\r") e = "\\r"
    else if (b < 32 || b == 127) e = sprintf("\\u%04x", b); else e = substr(text, i, w)
    if (length(out) + length(e) > budget) break
    out = out e; i += w
  }
  print pre out post "\n"
}'
