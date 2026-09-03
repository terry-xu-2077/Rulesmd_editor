$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$Frontend = Join-Path $Root 'frontend'
$TauriManifest = Join-Path $Frontend 'src-tauri\Cargo.toml'
$IconSource = Join-Path $Frontend 'src-tauri\app-icon.png'
$Venv = Join-Path $Root '.venv'
$Python = Join-Path $Venv 'Scripts\python.exe'
$ProxyHost = '127.0.0.1'
$ProxyPort = 7897
$ProxyUrl = "http://${ProxyHost}:${ProxyPort}"

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

Set-Location $Root

Write-Host 'Rulesmd Editor - Development Launcher' -ForegroundColor Green
Write-Host "Project: $Root"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'Node.js was not found. Install Node.js LTS and run this launcher again.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Fail 'npm was not found. Reinstall Node.js LTS and run this launcher again.' }
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { Fail 'Rust/Cargo was not found. Install Rust with rustup, then run this launcher again.' }

$env:CARGO_REGISTRIES_CRATES_IO_PROTOCOL = 'sparse'
$env:CARGO_HTTP_MULTIPLEXING = 'false'
$env:CARGO_NET_RETRY = '2'
$env:CARGO_HTTP_TIMEOUT = '25'

$ProxyAvailable = Test-LocalPort $ProxyHost $ProxyPort
if ($ProxyAvailable) {
    Write-Host "Preferred Cargo proxy available: $ProxyUrl" -ForegroundColor Green
} else {
    Write-Host "Cargo proxy unavailable; direct connection will be used: $ProxyUrl" -ForegroundColor Yellow
}

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

# Frontend dependencies.
if (-not (Test-Path (Join-Path $Frontend 'node_modules'))) {
    Write-Step 'Installing frontend dependencies (first run only)'
    Push-Location $Frontend
    try {
        if (Test-Path 'package-lock.json') { & npm ci } else { & npm install }
        if ($LASTEXITCODE -ne 0) { Fail 'npm dependency installation failed.' }
    } finally { Pop-Location }
}

# The PNG is the single source of truth for all desktop icons.
# Let Tauri's own icon generator create a Windows-compatible ICO and platform PNGs.
if (-not (Test-Path $IconSource)) {
    Fail "App icon source is missing: $IconSource"
}
Write-Step 'Generating application icons from PNG source'
Push-Location $Frontend
try {
    & npm run tauri -- icon "src-tauri/app-icon.png" --output "src-tauri/icons"
    if ($LASTEXITCODE -ne 0) { Fail 'Tauri icon generation failed.' }
} finally { Pop-Location }

# Cargo network strategy for this workstation:
# prefer the known local proxy when it is listening; direct connection is fallback only.
$FetchCode = 1
$NetworkMode = 'direct'

if ($ProxyAvailable) {
    Enable-ProxyEnv
    $env:CARGO_NET_RETRY = '3'
    $env:CARGO_HTTP_TIMEOUT = '25'
    $FetchCode = Invoke-CargoFetch "proxy $ProxyUrl"
    $NetworkMode = 'proxy'

    if ($FetchCode -ne 0) {
        Write-Host "Cargo proxy fetch failed. Falling back to direct connection ..." -ForegroundColor Yellow
        Clear-ProxyEnv
        $env:CARGO_NET_RETRY = '1'
        $env:CARGO_HTTP_TIMEOUT = '20'
        $FetchCode = Invoke-CargoFetch 'direct fallback'
        $NetworkMode = 'direct fallback'
    }
} else {
    Clear-ProxyEnv
    $env:CARGO_NET_RETRY = '2'
    $env:CARGO_HTTP_TIMEOUT = '20'
    $FetchCode = Invoke-CargoFetch 'direct'
    $NetworkMode = 'direct'
}

if ($FetchCode -ne 0) {
    Fail "Cargo dependency download failed. Proxy checked: $ProxyUrl."
}

# Dependencies are cached now. Keep the app runtime independent of proxy settings.
Clear-ProxyEnv
$env:RULESMD_PYTHON = $Python
$env:PYTHONUTF8 = '1'

Write-Step 'Starting Rulesmd Editor (Tauri development mode)'
Write-Host "Rust dependency route used: $NetworkMode" -ForegroundColor DarkGray
Write-Host 'Cargo compatibility: sparse registry, HTTP/2 multiplexing disabled.' -ForegroundColor DarkGray
Write-Host 'Close the app window or press Ctrl+C here to stop.' -ForegroundColor DarkGray

Push-Location $Frontend
try {
    & npm run desktop:dev
    $ExitCode = $LASTEXITCODE
} finally { Pop-Location }

if ($ExitCode -ne 0) {
    Fail "Tauri exited with code $ExitCode. Rust dependencies were already prefetched, so the messages above should now be a real build/runtime error rather than a crates.io download error."
}
