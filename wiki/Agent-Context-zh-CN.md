# Agent 上下文

[English](Agent-Context)

## 它做什么

`agent/herdr-context.sh <claude|copilot>` 告诉 agent 它运行在 Herdr 里。它为会话开始的 hook 输出一个 JSON 对象。内容是一段简短说明，后面接 `herdr-app --skill`，总长最多 9,000 个字符。说明里给出终端的地址（`HC_TERMINAL_ID`）。它提示在改动窗口前运行 `herdr-app --skill`，在启动或协调 agent 前运行 `hc --skill`。

## Claude Code

把它加到 Claude Code 的 `settings.json` 中。内容放在 `hookSpecificOutput.additionalContext` 里。

```json
{ "hooks": { "SessionStart": [ { "hooks": [ { "type": "command", "command": "/path/to/herdr-config/agent/herdr-context.sh claude" } ] } ] } }
```

## Copilot CLI

在 Copilot CLI 的会话开始 hook 中运行 `agent/herdr-context.sh copilot`。它输出 `{"additionalContext": …}`。

## 何时不输出

只要下面任一条件成立，它就什么也不输出，并以 0 退出：

- 没有设置 `HC_TERMINAL_ID`（不在 Herdr 里）。
- 缺少 `herdr-app` 或 `hc`。
- 对 Claude 来说，`CLAUDE_CODE_ENTRYPOINT` 被设成了 `cli` 和 `sdk-cli` 以外的值。`sdk-cli` 是在终端里运行的 `claude -p`；桌面应用（`claude-desktop`）保持安静。

## Windows

`agent/herdr-context.ps1 <claude|copilot>` 是给 PowerShell 7（`pwsh`）用的同一个 hook。它输出同样的 JSON，不输出的情况和 9,000 字节的上限也都一样。因为 `herdr-app.exe` 是窗口程序，它会等进程结束后再读取 `herdr-app --skill` 的输出，并把 Windows 的换行（CRLF）转成 LF。

```json
{ "hooks": { "SessionStart": [ { "hooks": [ { "type": "command", "command": "pwsh -NoProfile -File C:/path/to/herdr-config/agent/herdr-context.ps1 claude" } ] } ] } }
```

对于 Copilot CLI，在它的会话开始 hook 中运行 `pwsh -NoProfile -File C:/path/to/herdr-config/agent/herdr-context.ps1 copilot`。
