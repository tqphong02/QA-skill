[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"

function Find-CommandPath {
    param([string]$Name)
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -ne $command) {
        return $command.Source
    }
    return $null
}

function Find-FirstFile {
    param([string[]]$Candidates)
    foreach ($candidate in $Candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            return $candidate
        }
    }
    return $null
}

function Join-OptionalPath {
    param(
        [string]$Root,
        [string]$ChildPath
    )
    if ($Root) {
        return (Join-Path $Root $ChildPath)
    }
    return $null
}

Write-Output "INFO platform=windows state_change=none"
Write-Output "INFO app=proxyman route=macos_only"

$mitmdumpPath = Find-CommandPath "mitmdump"
if ($mitmdumpPath) {
    Write-Output "PASS cli=mitmdump path=$mitmdumpPath"
} else {
    Write-Output "MISS cli=mitmdump"
}
foreach ($proxyCommand in @("mitmproxy", "mitmweb")) {
    $proxyCommandPath = Find-CommandPath $proxyCommand
    if ($proxyCommandPath) {
        Write-Output "PASS cli=$proxyCommand path=$proxyCommandPath"
    } else {
        Write-Output "MISS cli=$proxyCommand"
    }
}

$fiddlerCandidates = @(
    (Join-OptionalPath $env:LOCALAPPDATA "Programs\Fiddler Everywhere\Fiddler Everywhere.exe"),
    (Join-OptionalPath $env:LOCALAPPDATA "Fiddler Everywhere\Fiddler Everywhere.exe"),
    (Join-OptionalPath $env:ProgramFiles "Fiddler Everywhere\Fiddler Everywhere.exe")
)
$fiddler = Find-FirstFile $fiddlerCandidates
if ($fiddler) {
    Write-Output "PASS app=fiddler_everywhere path=$fiddler"
    $fiddlerProcess = Get-Process -ErrorAction SilentlyContinue |
        Where-Object { $_.ProcessName -match "(?i)fiddler" } |
        Select-Object -First 1
    if ($fiddlerProcess) {
        Write-Output "PASS app=fiddler_everywhere state=running"
    } else {
        Write-Output "WARN app=fiddler_everywhere state=not_running"
    }

    $mcpListening = $false
    if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
        $listener = Get-NetTCPConnection -State Listen -LocalPort 8868 -ErrorAction SilentlyContinue
        if ($listener) {
            $mcpListening = $true
        }
    }
    if ($mcpListening) {
        Write-Output "PASS mcp=fiddler transport=http endpoint=http://localhost:8868/mcp auth=required"
    } else {
        Write-Output "WARN mcp=fiddler endpoint=http://localhost:8868/mcp state=not_listening_or_custom_port"
    }
} else {
    Write-Output "MISS app=fiddler_everywhere"
}

$charlesCandidates = @(
    (Join-OptionalPath $env:ProgramFiles "Charles\Charles.exe"),
    (Join-OptionalPath ${env:ProgramFiles(x86)} "Charles\Charles.exe")
)
$charles = Find-FirstFile $charlesCandidates
if ($charles) {
    Write-Output "PASS app=charles path=$charles"
} else {
    $charlesPath = Find-CommandPath "charles"
    if ($charlesPath) {
        Write-Output "PASS cli=charles path=$charlesPath"
    } else {
        Write-Output "MISS app=charles"
    }
}

$httpToolkitCandidates = @(
    (Join-OptionalPath $env:LOCALAPPDATA "Programs\HTTP Toolkit\HTTP Toolkit.exe"),
    (Join-OptionalPath $env:ProgramFiles "HTTP Toolkit\HTTP Toolkit.exe")
)
$httpToolkit = Find-FirstFile $httpToolkitCandidates
if ($httpToolkit) {
    Write-Output "PASS app=http_toolkit path=$httpToolkit"
} else {
    Write-Output "MISS app=http_toolkit"
}

if (Find-CommandPath "codex") {
    try {
        $mcpList = & codex mcp list 2>$null
        if ($mcpList -match "(?i)fiddler") {
            Write-Output "PASS mcp_client=codex server=fiddler"
        } else {
            Write-Output "MISS mcp_client=codex server=fiddler"
        }
    } catch {
        Write-Output "WARN mcp_client=codex check=failed"
    }
}

if ($fiddler) {
    Write-Output "RECOMMEND interactive=fiddler_mcp_after_status_and_auth_check"
} elseif ($mitmdumpPath) {
    Write-Output "RECOMMEND interactive=mitmproxy_cli"
} elseif ($charles) {
    Write-Output "RECOMMEND interactive=charles"
} elseif ($httpToolkit) {
    Write-Output "RECOMMEND interactive=http_toolkit"
} else {
    Write-Output "BLOCKED proxy_runtime=missing"
}

if ($mitmdumpPath) {
    Write-Output "RECOMMEND headless=mitmdump"
} else {
    Write-Output "BLOCKED headless_proxy_runtime=missing"
}
