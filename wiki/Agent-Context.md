# Agent Context

[简体中文](Agent-Context-zh-CN)

## What it does

`agent/herdr-context.sh <claude|copilot>` tells an agent that it runs in Herdr. It prints one JSON object for a session-start hook. The text is a short primer, then `herdr-app --skill`, at most 9,000 characters in all. The primer gives the terminal's address (`HC_TERMINAL_ID`). It says to run `herdr-app --skill` before changing the window, and `hc --skill` before starting or coordinating agents.

## Claude Code

Add it to Claude Code's `settings.json`. The text goes in `hookSpecificOutput.additionalContext`.

```json
{ "hooks": { "SessionStart": [ { "hooks": [ { "type": "command", "command": "/path/to/herdr-config/agent/herdr-context.sh claude" } ] } ] } }
```

## Copilot CLI

Run `agent/herdr-context.sh copilot` from Copilot CLI's session-start hook. It prints `{"additionalContext": …}`.

## When it is silent

It prints nothing and exits 0 when any of these is true:

- `HC_TERMINAL_ID` is not set (not in Herdr).
- `herdr-app` or `hc` is missing.
- For Claude, `CLAUDE_CODE_ENTRYPOINT` is set to something other than `cli` or `sdk-cli`. `sdk-cli` is `claude -p` in a terminal; the desktop app (`claude-desktop`) stays silent.
