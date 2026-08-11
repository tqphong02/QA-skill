[CmdletBinding()]
param(
    [string]$ConnectEndpoint,
    [int]$Port = 5555,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ScrcpyArguments
)

$ErrorActionPreference = "Stop"

function Find-CommandPath {
    param([string]$Name)
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -ne $command) {
        return $command.Source
    }
    return $null
}

function Resolve-Binary {
    param(
        [string]$Override,
        [string]$Bundled,
        [string]$CommandName
    )
    if ($Override -and (Test-Path -LiteralPath $Override -PathType Leaf)) {
        return $Override
    }
    if (Test-Path -LiteralPath $Bundled -PathType Leaf) {
        return $Bundled
    }
    return (Find-CommandPath $CommandName)
}

function Get-AdbDevices {
    param([string]$Adb)
    $lines = & $Adb devices 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "scrcpy-wifi: adb devices failed"
    }
    return $lines
}

$adb = Resolve-Binary `
    -Override $env:ADB_BIN `
    -Bundled (Join-Path $env:USERPROFILE "scrcpy\adb.exe") `
    -CommandName "adb"
$scrcpy = Resolve-Binary `
    -Override $env:SCRCPY_BIN `
    -Bundled (Join-Path $env:USERPROFILE "scrcpy\scrcpy.exe") `
    -CommandName "scrcpy"

if (-not $adb) {
    throw "scrcpy-wifi: adb not found; set ADB_BIN or install Android Platform-Tools"
}
if (-not $scrcpy) {
    throw "scrcpy-wifi: scrcpy not found; set SCRCPY_BIN or install Genymobile.scrcpy"
}
if (($Port -lt 1) -or ($Port -gt 65535)) {
    throw "scrcpy-wifi: Port must be between 1 and 65535"
}

$deviceLines = Get-AdbDevices -Adb $adb
$wifiSerial = $null

if ($ConnectEndpoint) {
    if ($ConnectEndpoint -notmatch "^[^:\s]+:\d{1,5}$") {
        throw "scrcpy-wifi: ConnectEndpoint must use host:port"
    }
    Write-Output "scrcpy-wifi: connecting $ConnectEndpoint"
    $connectResult = & $adb connect $ConnectEndpoint 2>&1
    $connectResult | ForEach-Object { Write-Output $_ }
    if ($LASTEXITCODE -ne 0) {
        throw "scrcpy-wifi: adb connect failed for $ConnectEndpoint"
    }
    $wifiSerial = $ConnectEndpoint
} else {
    foreach ($line in $deviceLines) {
        if ($line -match "^(\S+:\d+)\s+device(?:\s|$)") {
            $wifiSerial = $Matches[1]
            break
        }
    }
}

if (-not $wifiSerial) {
    $usbSerial = $null
    foreach ($line in $deviceLines) {
        if (($line -match "^(\S+)\s+device(?:\s|$)") -and ($Matches[1] -notmatch ":")) {
            $usbSerial = $Matches[1]
            break
        }
    }
    if (-not $usbSerial) {
        throw "scrcpy-wifi: no ready USB device found; connect USB, unlock Android, and accept debugging authorization"
    }

    $ipOutput = & $adb -s $usbSerial shell ip -o -f inet addr show wlan0 2>$null
    $wifiIp = $null
    if ($ipOutput -match "inet\s+(\d{1,3}(?:\.\d{1,3}){3})/") {
        $wifiIp = $Matches[1]
    }
    if (-not $wifiIp) {
        throw "scrcpy-wifi: could not resolve wlan0 IPv4; enable Wi-Fi and retry"
    }

    Write-Output "scrcpy-wifi: enabling tcpip and connecting ${wifiIp}:$Port"
    & $adb -s $usbSerial tcpip $Port | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "scrcpy-wifi: adb tcpip failed"
    }
    Start-Sleep -Seconds 2
    $wifiSerial = "${wifiIp}:$Port"
    $connectResult = & $adb connect $wifiSerial 2>&1
    $connectResult | ForEach-Object { Write-Output $_ }
    if ($LASTEXITCODE -ne 0) {
        throw "scrcpy-wifi: adb connect failed for $wifiSerial"
    }
}

$verified = $false
foreach ($line in (Get-AdbDevices -Adb $adb)) {
    if ($line -match "^$([regex]::Escape($wifiSerial))\s+device(?:\s|$)") {
        $verified = $true
        break
    }
}
if (-not $verified) {
    throw "scrcpy-wifi: $wifiSerial is not in device state"
}

Write-Output "scrcpy-wifi: mirroring $wifiSerial"
$forwardedArguments = @($ScrcpyArguments)
if (($forwardedArguments.Count -gt 0) -and ($forwardedArguments[0] -eq "--")) {
    if ($forwardedArguments.Count -eq 1) {
        $forwardedArguments = @()
    } else {
        $forwardedArguments = @($forwardedArguments[1..($forwardedArguments.Count - 1)])
    }
}
& $scrcpy --serial $wifiSerial @forwardedArguments
exit $LASTEXITCODE
