$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$Frontend = Join-Path $Root 'frontend'
$Modules = Join-Path $Frontend 'node_modules'
$UiPackage = Join-Path $Modules 'terry-react-ui-library'
$UiStamp = Join-Path $Modules '.rulesmd-ui-main.sha'
$ViteCache = Join-Path $Modules '.vite'

$UiRepo = 'https://github.com/terry-xu-2077/Terry_React_UI_Library.git'
$UiRef = 'refs/heads/main'
$UiInstallSpecPrefix = 'terry-react-ui-library@github:terry-xu-2077/Terry_React_UI_Library#'

$ProxyHost = '127.0.0.1'
$ProxyPort = 7897
$ProxyUrl = "http://${ProxyHost}:${ProxyPort}"

function Test-LocalPort([string]$HostName, [int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $result = $client.BeginConnect($HostName, $Port, $null, $null)
        if (-not $result.AsyncWaitHandle.WaitOne(700)) { return $false }
        $client.EndConnect($result)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Get-UiRemoteHead([bool]$UseProxy) {
    try {
        if ($UseProxy) {
            $output = & git -c "http.proxy=$ProxyUrl" ls-remote $UiRepo $UiRef 2>$null
        } else {
            $output = & git ls-remote $UiRepo $UiRef 2>$null
        }
        if ($LASTEXITCODE -ne 0 -or -not $output) { return '' }
        return (($output | Select-Object -First 1) -split '\s+')[0].Trim()
    } catch {
        return ''
    }
}

function Invoke-UiInstall([string]$Commit, [bool]$UseProxy) {
    $saved = @{}
    $proxyNames = @('HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','GIT_HTTP_PROXY','GIT_HTTPS_PROXY')
    foreach ($name in $proxyNames) {
        $item = Get-Item "Env:$name" -ErrorAction SilentlyContinue
        if ($item) { $saved[$name] = $item.Value }
    }

    try {
        if ($UseProxy) {
            foreach ($name in $proxyNames) { Set-Item "Env:$name" $ProxyUrl }
        }

        Push-Location $Frontend
        try {
            $spec = "$UiInstallSpecPrefix$Commit"
            & npm install --package-lock=false --no-save --force $spec
            return $LASTEXITCODE -eq 0
        } finally {
            Pop-Location
        }
    } finally {
        foreach ($name in $proxyNames) {
            Remove-Item "Env:$name" -ErrorAction SilentlyContinue
            if ($saved.ContainsKey($name)) { Set-Item "Env:$name" $saved[$name] }
        }
    }
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host '[ERROR] Git is required to synchronize Terry React UI Library.' -ForegroundColor Red
    exit 1
}

$ProxyAvailable = Test-LocalPort $ProxyHost $ProxyPort
$RemoteHead = Get-UiRemoteHead $false
$Route = 'direct'

if (-not $RemoteHead -and $ProxyAvailable) {
    $RemoteHead = Get-UiRemoteHead $true
    $Route = "proxy $ProxyUrl"
}

if (-not $RemoteHead) {
    if (Test-Path $UiPackage) {
        Write-Host '[WARN] UI library remote head could not be checked; using the currently installed copy.' -ForegroundColor Yellow
        exit 0
    }
    Write-Host '[ERROR] UI library is not installed and its main branch could not be reached.' -ForegroundColor Red
    exit 1
}

$InstalledHead = if (Test-Path $UiStamp) { (Get-Content $UiStamp -Raw).Trim() } else { '' }
if ((Test-Path $UiPackage) -and ($InstalledHead -eq $RemoteHead)) {
    Write-Host "UI library is synchronized: $($RemoteHead.Substring(0, 12))" -ForegroundColor DarkGray
    exit 0
}

Write-Host "Synchronizing UI library main -> $($RemoteHead.Substring(0, 12)) ($Route)" -ForegroundColor Cyan
$Installed = Invoke-UiInstall $RemoteHead $false

if (-not $Installed -and $ProxyAvailable) {
    Write-Host "UI library direct install failed. Retrying through $ProxyUrl ..." -ForegroundColor Yellow
    $Installed = Invoke-UiInstall $RemoteHead $true
}

if (-not $Installed) {
    Write-Host '[ERROR] UI library synchronization failed.' -ForegroundColor Red
    exit 1
}

New-Item -ItemType Directory -Path $Modules -Force | Out-Null
Set-Content -Path $UiStamp -Value $RemoteHead -NoNewline

if (Test-Path $ViteCache) {
    Remove-Item $ViteCache -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host 'Vite optimized dependency cache invalidated after UI library update.' -ForegroundColor DarkGray
}

Write-Host "UI library synchronized successfully: $($RemoteHead.Substring(0, 12))" -ForegroundColor Green
