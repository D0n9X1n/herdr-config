# Prints Herdr context for claude|copilot SessionStart hooks; silent outside Herdr.
# PowerShell port of agent/herdr-context.sh for Windows: the same text, silent cases and
# 9,000-byte JSON cap, cut on a whole UTF-8 character. herdr-app.exe is a window app, so
# its output is read from a redirected process that is waited for; Windows CRLF becomes LF.
param([string]$Client = '')

$ErrorActionPreference = 'Stop'
try {
    if (-not $env:HC_TERMINAL_ID) { exit 0 }
    $herdrApp = Get-Command herdr-app -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    $hc = Get-Command hc -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $herdrApp -or -not $hc) { exit 0 }

    if ($Client -ceq 'claude') {
        # Unset, cli or sdk-cli (claude -p in a terminal); the desktop app and SDKs stay silent.
        $entrypoint = if ($env:CLAUDE_CODE_ENTRYPOINT) { $env:CLAUDE_CODE_ENTRYPOINT } else { 'cli' }
        if ($entrypoint -cne 'cli' -and $entrypoint -cne 'sdk-cli') { exit 0 }
        $prefix = '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"'
        $suffix = '"}}'
    } elseif ($Client -ceq 'copilot') {
        $prefix = '{"additionalContext":"'
        $suffix = '"}'
    } else {
        exit 0
    }

    $primer = 'This is a Herdr terminal. Your address is ' + $env:HC_TERMINAL_ID +
        '. Run `herdr-app --skill` before changing the window. Run `hc --skill` before starting or coordinating agents.'
    if ($env:HERDR_CONTEXT_PROBE) { $primer += ' Probe: ' + $env:HERDR_CONTEXT_PROBE }

    $utf8 = New-Object Text.UTF8Encoding $false
    $skill = ''
    try {
        $start = New-Object Diagnostics.ProcessStartInfo
        $start.FileName = $herdrApp.Source
        $start.Arguments = '--skill'
        $start.UseShellExecute = $false
        $start.CreateNoWindow = $true
        $start.RedirectStandardOutput = $true
        $start.RedirectStandardError = $true
        $start.StandardOutputEncoding = $utf8
        $start.StandardErrorEncoding = $utf8
        $process = [Diagnostics.Process]::Start($start)
        try {
            $stdout = $process.StandardOutput.ReadToEndAsync()
            [void]$process.StandardError.ReadToEndAsync()
            if ($process.WaitForExit(15000)) {
                $skill = $stdout.GetAwaiter().GetResult()
            } else {
                try { $process.Kill() } catch { }
            }
        } finally { $process.Dispose() }
    } catch { $skill = '' }

    # The shell version joins awk records with LF and drops the final newline.
    $text = $primer + "`n`n" + ($skill -replace "`r`n", "`n")
    if ($text.EndsWith("`n")) { $text = $text.Substring(0, $text.Length - 1) }

    $budget = 9000 - $utf8.GetByteCount($prefix) - $utf8.GetByteCount($suffix)
    $body = New-Object Text.StringBuilder
    $used = 0
    $index = 0
    while ($index -lt $text.Length) {
        $character = $text[$index]
        $width = 1
        if ([char]::IsHighSurrogate($character) -and $index + 1 -lt $text.Length -and [char]::IsLowSurrogate($text[$index + 1])) {
            $piece = $text.Substring($index, 2)
            $width = 2
        } else {
            $code = [int]$character
            if ($character -eq [char]'\') { $piece = '\\' }
            elseif ($character -eq [char]'"') { $piece = '\"' }
            elseif ($code -eq 10) { $piece = '\n' }
            elseif ($code -eq 9) { $piece = '\t' }
            elseif ($code -eq 13) { $piece = '\r' }
            elseif ($code -lt 32 -or $code -eq 127) { $piece = '\u{0:x4}' -f $code }
            else { $piece = [string]$character }
        }
        $size = $utf8.GetByteCount($piece)
        if ($used + $size -gt $budget) { break }
        [void]$body.Append($piece)
        $used += $size
        $index += $width
    }

    $bytes = $utf8.GetBytes($prefix + $body.ToString() + $suffix + "`n")
    $output = [Console]::OpenStandardOutput()
    $output.Write($bytes, 0, $bytes.Length)
    $output.Flush()
    exit 0
} catch {
    exit 0
}
