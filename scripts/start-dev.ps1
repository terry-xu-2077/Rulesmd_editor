$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$Frontend = Join-Path $Root 'frontend'
$Venv = Join-Path $Root '.venv'
$Python = Join-Path $Venv 'Scripts\python.exe'

function Write-Step([string]$Text) {
    Write-Host "`n==> $Text" -ForegroundColor Cyan
}

function Fail([string]$Text) {
    Write-Host "`n[ERROR] $Text" -ForegroundColor Red
    Write-Host 'Press any key to close...'
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    exit 1
}

Set-Location $Root

Write-Host 'Rulesmd Editor - Development Launcher' -ForegroundColor Green
Write-Host "Project: $Root"

# Required desktop toolchain.
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail 'Node.js was not found. Install Node.js LTS and run this launcher again.'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Fail 'npm was not found. Reinstall Node.js LTS and run this launcher again.'
}
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Fail 'Rust/Cargo was not found. Install Rust with rustup, then run this launcher again.'
}

# Cargo can be unreliable behind some proxies/VPNs when HTTP/2 multiplexing is enabled.
# Keep these compatibility settings local to this launcher process.
$env:CARGO_REGISTRIES_CRATES_IO_PROTOCOL = 'sparse'
$env:CARGO_HTTP_MULTIPLEXING = 'false'
$env:CARGO_NET_RETRY = '10'
$env:CARGO_HTTP_TIMEOUT = '120'

# Python is required by the Rules backend. Prefer py launcher on Windows.
$PythonBootstrap = $null
if (Get-Command py -ErrorAction SilentlyContinue) {
    $PythonBootstrap = 'py'
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $PythonBootstrap = 'python'
} else {
    Fail 'Python 3.10+ was not found. Install Python and run this launcher again.'
}

if (-not (Test-Path $Python)) {
    Write-Step 'Creating Python virtual environment (.venv)'
    if ($PythonBootstrap -eq 'py') {
        & py -3 -m venv $Venv
    } else {
        & python -m venv $Venv
    }
}

if (-not (Test-Path $Python)) {
    Fail 'Python virtual environment could not be created.'
}

# The backend is currently stdlib-only. Install the local package without pulling
# the legacy PySide UI dependency; this keeps first-run setup fast.
$PackageStamp = Join-Path $Venv '.rulesmd-editor-installed'
if (-not (Test-Path $PackageStamp)) {
    Write-Step 'Registering Python backend in the virtual environment'
    & $Python -m pip install --disable-pip-version-check -e $Root --no-deps
    if ($LASTEXITCODE -ne 0) { Fail 'Python backend installation failed.' }
    New-Item -ItemType File -Path $PackageStamp -Force | Out-Null
}

if (-not (Test-Path (Join-Path $Frontend 'node_modules'))) {
    Write-Step 'Installing frontend dependencies (first run only)'
    Push-Location $Frontend
    try {
        if (Test-Path 'package-lock.json') {
            & npm ci
        } else {
            & npm install
        }
        if ($LASTEXITCODE -ne 0) { Fail 'npm dependency installation failed.' }
    } finally {
        Pop-Location
    }
}

# Make the venv backend available to future Tauri sidecar/bootstrap code.
$env:RULESMD_PYTHON = $Python
$env:PYTHONUTF8 = '1'

Write-Step 'Starting Rulesmd Editor (Tauri development mode)'
Write-Host 'Cargo compatibility: sparse registry, HTTP/2 multiplexing disabled, retry=10.' -ForegroundColor DarkGray
Write-Host 'Close the app window or press Ctrl+C here to stop.' -ForegroundColor DarkGray
Push-Location $Frontend
try {
    & npm run desktop:dev
    $ExitCode = $LASTEXITCODE
} finally {
    Pop-Location
}

if ($ExitCode -ne 0) {
    Fail "Tauri exited with code $ExitCode. If the error mentions index.crates.io, run this launcher again; Cargo will reuse already-downloaded crates."
}
