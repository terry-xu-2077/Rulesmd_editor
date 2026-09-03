$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$Frontend = Join-Path $Root 'frontend'
$FrontendPackage = Join-Path $Frontend 'package.json'
$FrontendModules = Join-Path $Frontend 'node_modules'
$FrontendStamp = Join-Path $FrontendModules '.rulesmd-package.sha256'
$TauriManifest = Join-Path $Frontend 'src-tauri\Cargo.toml'
$IconSource = Join-Path $Frontend 'src-tauri\app-icon.png'
$LegacyAssets = Join-Path $Frontend 'public\legacy'
$Venv = Join-Path $Root '.venv'
$Python = Join-Path $Venv 'Scripts\python.exe'
$ProxyHost = '127.0.0.1'
$ProxyPort = 7897
$ProxyUrl = "http://${ProxyHost}:${ProxyPort}"
$RsProxyIndex = 'sparse+https://rsproxy.cn/index/'

function Write-Step([string]$Text) {
    Write-Host "`n==> $Text" -ForegroundColor Cyan
}

function Fail([string]$Text) {
    Write-Host "`n[ERROR] $Text" -ForegroundColor Red
    Write-Host 'Press any key to close...'
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    exit 1
}

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

function Clear-ProxyEnv {
    'HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','CARGO_HTTP_PROXY','GIT_HTTP_PROXY','GIT_HTTPS_PROXY' | ForEach-Object {
        Remove-Item "Env:$_" -ErrorAction SilentlyContinue
    }
}

function Enable-ProxyEnv {
    $env:HTTP_PROXY = $ProxyUrl
    $env:HTTPS_PROXY = $ProxyUrl
    $env:ALL_PROXY = $ProxyUrl
    $env:CARGO_HTTP_PROXY = $ProxyUrl
    $env:GIT_HTTP_PROXY = $ProxyUrl
    $env:GIT_HTTPS_PROXY = $ProxyUrl
}

function Invoke-CargoFetch([string]$Mode) {
    Write-Step "Preparing Rust dependencies ($Mode)"
    & cargo fetch --manifest-path $TauriManifest
    return $LASTEXITCODE
}

function Sync-LegacyAsset([string]$Name, [string]$Url) {
    $Target = Join-Path $LegacyAssets $Name
    if (Test-Path $Target) { return }
    Write-Host "  Legacy UI: $Name" -ForegroundColor DarkGray
    try {
        Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Target -TimeoutSec 20
    } catch {
        if ($ProxyAvailable) {
            try {
                Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Target -Proxy $ProxyUrl -TimeoutSec 30
            } catch {
                Write-Host "  [WARN] Unable to download legacy asset $Name; fallback icon will be used." -ForegroundColor Yellow
                Remove-Item $Target -ErrorAction SilentlyContinue
            }
        } else {
            Write-Host "  [WARN] Unable to download legacy asset $Name; fallback icon will be used." -ForegroundColor Yellow
            Remove-Item $Target -ErrorAction SilentlyContinue
        }
    }
}

function Install-FrontendDependencies {
    Push-Location $Frontend
    try {
        Clear-ProxyEnv
        & npm install
        if ($LASTEXITCODE -eq 0) { return $true }

        if ($ProxyAvailable) {
            Write-Host "npm direct install failed. Retrying through $ProxyUrl ..." -ForegroundColor Yellow
            Enable-ProxyEnv
            & npm install
            $ok = $LASTEXITCODE -eq 0
            Clear-ProxyEnv
            return $ok
        }
        return $false
    } finally {
        Pop-Location
    }
}

Set-Location $Root

Write-Host 'Rulesmd Editor - Development Launcher' -ForegroundColor Green
Write-Host "Project: $Root"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'Node.js was not found. Install Node.js LTS and run this launcher again.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Fail 'npm was not found. Reinstall Node.js LTS and run this launcher again.' }
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { Fail 'Rust/Cargo was not found. Install Rust with rustup, then run this launcher again.' }

$env:CARGO_HTTP_MULTIPLEXING = 'false'
$env:CARGO_NET_RETRY = '2'
$env:CARGO_HTTP_TIMEOUT = '30'

$ProxyAvailable = Test-LocalPort $ProxyHost $ProxyPort
if ($ProxyAvailable) {
    Write-Host "Local Cargo proxy available: $ProxyUrl" -ForegroundColor Green
} else {
    Write-Host "Local Cargo proxy unavailable: $ProxyUrl" -ForegroundColor Yellow
}
Write-Host "Cargo source replacement: crates.io -> $RsProxyIndex" -ForegroundColor Green

# Python backend
$PythonBootstrap = $null
if (Get-Command py -ErrorAction SilentlyContinue) { $PythonBootstrap = 'py' }
elseif (Get-Command python -ErrorAction SilentlyContinue) { $PythonBootstrap = 'python' }
else { Fail 'Python 3.10+ was not found. Install Python and run this launcher again.' }

if (-not (Test-Path $Python)) {
    Write-Step 'Creating Python virtual environment (.venv)'
    if ($PythonBootstrap -eq 'py') { & py -3 -m venv $Venv } else { & python -m venv $Venv }
}
if (-not (Test-Path $Python)) { Fail 'Python virtual environment could not be created.' }

$PackageStamp = Join-Path $Venv '.rulesmd-editor-installed'
if (-not (Test-Path $PackageStamp)) {
    Write-Step 'Registering Python backend in the virtual environment'
    & $Python -m pip install --disable-pip-version-check -e $Root --no-deps
    if ($LASTEXITCODE -ne 0) { Fail 'Python backend installation failed.' }
    New-Item -ItemType File -Path $PackageStamp -Force | Out-Null
}

# Frontend dependencies are refreshed whenever package.json changes. This keeps
# shared UI-library revisions in sync after a normal git pull without deleting node_modules.
$FrontendHash = (Get-FileHash -Algorithm SHA256 $FrontendPackage).Hash
$InstalledHash = if (Test-Path $FrontendStamp) { (Get-Content $FrontendStamp -Raw).Trim() } else { '' }
if ((-not (Test-Path $FrontendModules)) -or ($FrontendHash -ne $InstalledHash)) {
    Write-Step 'Installing/updating frontend dependencies'
    if (-not (Install-FrontendDependencies)) { Fail 'npm dependency installation failed.' }
    New-Item -ItemType Directory -Path $FrontendModules -Force | Out-Null
    Set-Content -Path $FrontendStamp -Value $FrontendHash -NoNewline
} else {
    Write-Host 'Frontend dependencies are up to date.' -ForegroundColor DarkGray
}

# Reuse the original RulesmdEditorWeb image assets. They are downloaded once and then
# served locally by Vite/Tauri; the editor does not depend on the web repo at runtime.
New-Item -ItemType Directory -Path $LegacyAssets -Force | Out-Null
Write-Step 'Synchronizing legacy RulesmdEditorWeb UI assets'
$LegacyBase = 'https://raw.githubusercontent.com/terry-xu-2077/RulesmdEditorWeb/main/img'
Sync-LegacyAsset 'iconTile.jpg' "$LegacyBase/iconTile.jpg"
Sync-LegacyAsset 'countryTile.png' "$LegacyBase/countryTile.png"
Sync-LegacyAsset 'bgIcon.png' "$LegacyBase/bgIcon.png"
Sync-LegacyAsset 'RA2_NONE.png' "$LegacyBase/RA2_NONE.png"

# The PNG is the single source of truth for all desktop icons.
if (-not (Test-Path $IconSource)) {
    Fail "App icon source is missing: $IconSource"
}
Write-Step 'Generating application icons from PNG source'
Push-Location $Frontend
try {
    & npm run tauri -- icon "src-tauri/app-icon.png" --output "src-tauri/icons"
    if ($LASTEXITCODE -ne 0) { Fail 'Tauri icon generation failed.' }
} finally { Pop-Location }

# Cargo source is permanently replaced by .cargo/config.toml:
# crates.io -> RsProxy sparse.
# Only the network route changes here: direct first, then local proxy.
Clear-ProxyEnv
$env:CARGO_NET_RETRY = '2'
$env:CARGO_HTTP_TIMEOUT = '30'
$FetchCode = Invoke-CargoFetch 'RsProxy direct'
$NetworkMode = 'RsProxy direct'

if (($FetchCode -ne 0) -and $ProxyAvailable) {
    Write-Host "RsProxy direct failed. Retrying RsProxy through $ProxyUrl ..." -ForegroundColor Yellow
    Enable-ProxyEnv
    $env:CARGO_NET_RETRY = '3'
    $env:CARGO_HTTP_TIMEOUT = '45'
    $FetchCode = Invoke-CargoFetch "RsProxy via proxy $ProxyUrl"
    $NetworkMode = 'RsProxy via proxy'
}

if ($FetchCode -ne 0) {
    Fail "Cargo dependency download from RsProxy failed. Local proxy checked: $ProxyUrl."
}

# Dependencies are cached now. Keep the app runtime independent of proxy settings.
Clear-ProxyEnv
$env:RULESMD_PYTHON = $Python
$env:PYTHONUTF8 = '1'

Write-Step 'Starting Rulesmd Editor (Tauri development mode)'
Write-Host "Rust dependency route used: $NetworkMode" -ForegroundColor DarkGray
Write-Host 'Cargo source: RsProxy sparse; HTTP/2 multiplexing disabled.' -ForegroundColor DarkGray
Write-Host 'Close the app window or press Ctrl+C here to stop.' -ForegroundColor DarkGray

Push-Location $Frontend
try {
    & npm run desktop:dev
    $ExitCode = $LASTEXITCODE
} finally { Pop-Location }

if ($ExitCode -ne 0) {
    Fail "Tauri exited with code $ExitCode. Rust dependencies were already prefetched, so the messages above should now be a real build/runtime error rather than a dependency download error."
}
