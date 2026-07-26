[CmdletBinding()]
param(
    [ValidateSet("codex", "antigravity", "claude")]
    [string]$Agent,
    [ValidateSet("core", "full")]
    [string]$Profile = "core",
    [string]$Only = "",
    [switch]$SkipDeps,
    [switch]$SkipMcpSetup,
    [switch]$DryRun,
    [switch]$Yes
)

$ErrorActionPreference = "Stop"

if (-not $Agent) {
    throw "Phải chọn -Agent codex, antigravity hoặc claude"
}

$repoDir = Split-Path -Parent $PSScriptRoot
$bashCandidates = @(
    @(
        (Get-Command bash -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue),
        "$env:ProgramFiles\Git\bin\bash.exe",
        "$env:ProgramFiles\Git\usr\bin\bash.exe"
    ) | Where-Object { $_ -and (Test-Path $_) }
)

if (-not $bashCandidates) {
    throw "Không tìm thấy Bash. Cài Git for Windows hoặc WSL rồi chạy lại"
}

$bash = $bashCandidates[0]
$repoPosix = $repoDir.Replace("\", "/")
$arguments = @("--agent=$Agent", "--profile=$Profile")
if ($Only) { $arguments += "--only=$Only" }
if ($SkipDeps) { $arguments += "--skip-deps" }
if ($SkipMcpSetup) { $arguments += "--skip-mcp-setup" }
if ($DryRun) { $arguments += "--dry-run" }
if ($Yes) { $arguments += "--yes" }

$escapedArgs = ($arguments | ForEach-Object { "'" + $_.Replace("'", "'\"'\"'") + "'" }) -join " "
$command = "cd '$repoPosix' && ./scripts/setup.sh $escapedArgs"

Write-Host "Running QA-skill setup for $Agent via $bash"
& $bash -lc $command
if ($LASTEXITCODE -ne 0) {
    throw "QA-skill setup failed with exit code $LASTEXITCODE"
}
