[CmdletBinding()]
param(
    [ValidateSet("android", "ios", "all")]
    [string]$Mode = "android"
)

$ErrorActionPreference = "Continue"
$script:Status = 0

function Write-Pass {
    param([string]$Message)
    Write-Output "PASS $Message"
}

function Write-Fail {
    param([string]$Message)
    Write-Output "FAIL $Message"
    $script:Status = 1
}

function Find-CommandPath {
    param([string]$Name)
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -ne $command) {
        return $command.Source
    }
    return $null
}

function Check-Command {
    param([string]$Name)
    $path = Find-CommandPath $Name
    if ($path) {
        Write-Pass "command=$Name path=$path"
    } else {
        Write-Fail "command=$Name classification=runtime_missing"
    }
}

function Resolve-Adb {
    if ($env:ADB_BIN -and (Test-Path -LiteralPath $env:ADB_BIN -PathType Leaf)) {
        return $env:ADB_BIN
    }

    $bundled = Join-Path $env:USERPROFILE "scrcpy\adb.exe"
    if (Test-Path -LiteralPath $bundled -PathType Leaf) {
        return $bundled
    }

    $path = Find-CommandPath "adb"
    if ($path) {
        return $path
    }

    $sdkRoots = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT)
    foreach ($sdkRoot in $sdkRoots) {
        if ($sdkRoot) {
            $candidate = Join-Path $sdkRoot "platform-tools\adb.exe"
            if (Test-Path -LiteralPath $candidate -PathType Leaf) {
                return $candidate
            }
        }
    }

    return $null
}

Write-Output "INFO platform=windows"
Write-Output "INFO mcp_check=manual classification=mcp_not_loaded_if_tools_absent required_tools=select_device,appium_session_management"

Check-Command "node"
Check-Command "java"
Check-Command "npx"

$appiumPath = Find-CommandPath "appium"
if ($appiumPath) {
    Write-Pass "appium_cli=$appiumPath"
} else {
    Write-Output "WARN appium_cli=missing impact=local_cli_only mcp_may_still_manage_runtime"
}

if (($Mode -eq "android") -or ($Mode -eq "all")) {
    $adb = Resolve-Adb
    if ($adb) {
        Write-Pass "android_adb=$adb"
        try {
            $deviceLines = & $adb devices -l 2>&1
            $deviceLines | ForEach-Object { Write-Output $_ }
            if ($LASTEXITCODE -ne 0) {
                Write-Fail "android_adb=command_failed classification=runtime_missing"
            } else {
                $readyDevices = @($deviceLines | Where-Object { $_ -match "^\S+\s+device(?:\s|$)" })
                if ($readyDevices.Count -gt 0) {
                    Write-Pass "android_devices=$($readyDevices.Count)"
                } else {
                    Write-Output "WARN android_devices=0 impact=local_execution_blocked"
                }
            }
        } catch {
            Write-Fail "android_adb=execution_failed classification=runtime_missing"
        }
    } else {
        Write-Fail "android_adb=missing classification=runtime_missing"
    }

    $sdkRoot = $null
    foreach ($candidate in @(
        $env:ANDROID_HOME,
        $env:ANDROID_SDK_ROOT,
        (Join-Path $env:LOCALAPPDATA "Android\Sdk")
    )) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Container)) {
            $sdkRoot = $candidate
            break
        }
    }
    if ($sdkRoot) {
        Write-Pass "android_sdk=$sdkRoot"
        if ((-not $env:ANDROID_HOME) -and (-not $env:ANDROID_SDK_ROOT)) {
            Write-Output "WARN android_sdk_env=missing using=default_path"
        }
    } else {
        Write-Fail "android_sdk=missing_or_invalid classification=runtime_missing expected=ANDROID_HOME_or_ANDROID_SDK_ROOT"
    }

    $scrcpyPath = Find-CommandPath "scrcpy"
    if (-not $scrcpyPath) {
        $bundledScrcpy = Join-Path $env:USERPROFILE "scrcpy\scrcpy.exe"
        if (Test-Path -LiteralPath $bundledScrcpy -PathType Leaf) {
            $scrcpyPath = $bundledScrcpy
        }
    }
    if ($scrcpyPath) {
        Write-Pass "scrcpy=$scrcpyPath"
    } else {
        Write-Output "WARN scrcpy=missing impact=wifi_mirroring_only"
    }
}

if (($Mode -eq "ios") -or ($Mode -eq "all")) {
    Write-Fail "ios_local=unsupported_on_windows classification=unsupported_platform route=macos_self_hosted_or_remote_device_farm"
}

if (Find-CommandPath "codex") {
    try {
        $mcpList = & codex mcp list 2>$null
        if ($mcpList -match "(?i)appium") {
            Write-Pass "mcp_client=codex server=appium"
        } else {
            Write-Output "WARN mcp_client=codex server=appium classification=mcp_not_configured_or_not_loaded"
        }
    } catch {
        Write-Output "WARN mcp_client=codex check=failed"
    }
}

exit $script:Status
