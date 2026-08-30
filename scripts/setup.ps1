[CmdletBinding()]
param(
    [ValidateSet("codex", "antigravity", "claude")]
    [string]$Agent,
    [ValidateSet("core", "full")]
    [string]$Profile = "full",
    [string]$Only = "",
    [switch]$SkipDeps,
    [switch]$SkipMcpSetup,
    [switch]$DryRun,
    [switch]$Yes
)

$ErrorActionPreference = "Stop"

if (-not $Agent) {
    throw "Select -Agent codex, antigravity, or claude"
}

$repoDir = Split-Path -Parent $PSScriptRoot
$bashCandidates = @(
    @(
        "$env:ProgramFiles\Git\bin\bash.exe",
        "$env:ProgramFiles\Git\usr\bin\bash.exe",
        (Get-Command bash -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue)
    ) | Where-Object { $_ -and (Test-Path $_) }
)

if (-not $bashCandidates) {
    throw "Bash was not found. Install Git for Windows or WSL and retry"
}

$bash = $bashCandidates[0]
$repoPosix = $repoDir.Replace("\", "/")
$arguments = @("--agent=$Agent", "--profile=$Profile")
if ($Only) { $arguments += "--only=$Only" }
if ($SkipDeps) { $arguments += "--skip-deps" }
if ($SkipMcpSetup) { $arguments += "--skip-mcp-setup" }
if ($DryRun) { $arguments += "--dry-run" }
if ($Yes) { $arguments += "--yes" }

$escapedArgs = ($arguments | ForEach-Object { "'$_'" }) -join " "
$command = "cd '$repoPosix' && ./scripts/setup.sh $escapedArgs"

Write-Host "Running QA-skill setup for $Agent via $bash"
& $bash -lc $command
if ($LASTEXITCODE -ne 0) {
    throw "QA-skill setup failed with exit code $LASTEXITCODE"
}
