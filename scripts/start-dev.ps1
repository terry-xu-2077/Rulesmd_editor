$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$Frontend = Join-Path $Root 'frontend'
$FrontendPackage = Join-Path $Frontend 'package.json'
$FrontendModules = Join-Path $Frontend 'node_modules'
$FrontendStamp = Join-Path $FrontendModules '.rulesmd-package.sha256'
$IconStamp = Join-Path $FrontendModules '.rulesmd-icon-source.sha256'
$TauriManifest = Join-Path $Frontend 'src-tauri\Cargo.toml'
$IconSource = Join-Path $Frontend 'src-tauri\app-icon.png'
$IconProduct = Join-Path $Frontend 'src-tauri\icons\icon.ico'
$LegacyAssets = Join-Path $Frontend 'public\legacy'
$Venv = Join-Path $Root '.venv'
$Python = Join-Path $Venv 'Scripts\python.exe'
$RuleResourceBuilder = Join-Path $Root 'tools\build_rule_resources.py'
$RuleTemplate = Join-Path $Root 'src\rulesmd_editor\resources\generated\rulesmd.template.ini'
$RuleSchema = Join-Path $Root 'src\rulesmd_editor\resources\generated\rules_schema.json'
$LegacyHelp = Join-Path $Root 'src\rulesmd_editor\resources\legacy\HelpInfor.ini'
$LegacyNames = Join-Path $Root 'src\rulesmd_editor\resources\legacy\NamesDesc.ini'
$ProxyHost = '127.0.0.1'
$ProxyPort = 7897
$ProxyUrl = "http://${ProxyHost}:${ProxyPort}"
$RsProxyIndex = 'sparse+https://rsproxy.cn/index/'
$RustupUrl = 'https://win.rustup.rs/x86_64'

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

function Refresh-RustPath {
    $CargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
    if ((Test-Path $CargoBin) -and (($env:Path -split ';') -notcontains $CargoBin)) {
        $env:Path = "$CargoBin;$env:Path"
    }
}

function Install-RustToolchain {
    Write-Step 'Rust/Cargo not found - installing Rust automatically'

    # rustup-init inspects argv[0] / its executable filename on Windows to decide whether
    # it is the installer or one of rustup's proxy tools. Keep the canonical filename.
    $RustupInstallerDir = Join-Path $env:TEMP 'rulesmd-rustup'
    $RustupInstaller = Join-Path $RustupInstallerDir 'rustup-init.exe'
    New-Item -ItemType Directory -Path $RustupInstallerDir -Force | Out-Null
    Remove-Item $RustupInstaller -ErrorAction SilentlyContinue

    Clear-ProxyEnv
    try {
        Write-Host 'Downloading official rustup installer...' -ForegroundColor DarkGray
        Invoke-WebRequest -UseBasicParsing -Uri $RustupUrl -OutFile $RustupInstaller -TimeoutSec 60
    } catch {
        if (-not $ProxyAvailable) {
            Remove-Item $RustupInstallerDir -Recurse -Force -ErrorAction SilentlyContinue
            Fail 'Rust could not be downloaded from rustup.rs and the local proxy is unavailable.'
        }
        Write-Host "Rust direct download failed. Retrying through $ProxyUrl ..." -ForegroundColor Yellow
        try {
            Invoke-WebRequest -UseBasicParsing -Uri $RustupUrl -OutFile $RustupInstaller -Proxy $ProxyUrl -TimeoutSec 90
        } catch {
            Remove-Item $RustupInstallerDir -Recurse -Force -ErrorAction SilentlyContinue
            Fail 'Rust automatic download failed both directly and through the local proxy.'
        }
    }

    if (-not (Test-Path $RustupInstaller)) {
        Remove-Item $RustupInstallerDir -Recurse -Force -ErrorAction SilentlyContinue
        Fail 'Rust installer download did not produce a usable file.'
    }

    Write-Host 'Installing Rust stable toolchain (minimal profile)...' -ForegroundColor DarkGray
    & $RustupInstaller -y --profile minimal --default-toolchain stable
    $RustupExit = $LASTEXITCODE
    Remove-Item $RustupInstallerDir -Recurse -Force -ErrorAction SilentlyContinue
    if ($RustupExit -ne 0) {
        Fail "rustup installation failed with exit code $RustupExit."
    }

    Refresh-RustPath
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        Fail 'Rust was installed, but Cargo is still unavailable in the current process.'
    }

    Write-Host 'Rust/Cargo installed successfully.' -ForegroundColor Green
}

function Test-VenvPython {
    if (-not (Test-Path $Python)) { return $false }
    try {
        & $Python -c "import sys; raise SystemExit(0 if sys.executable else 1)" *> $null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
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
        & npm install --package-lock=false
        if ($LASTEXITCODE -eq 0) { return $true }

        if ($ProxyAvailable) {
            Write-Host "npm direct install failed. Retrying through $ProxyUrl ..." -ForegroundColor Yellow
            Enable-ProxyEnv
            & npm install --package-lock=false
            $ok = $LASTEXITCODE -eq 0
            Clear-ProxyEnv
            return $ok
        }
        return $false
    } finally {
        Pop-Location
    }
}

function Build-RuleResources {
    Write-Step 'Preparing rules metadata and clean default template'
    Clear-ProxyEnv
    & $Python $RuleResourceBuilder
    if ($LASTEXITCODE -eq 0) { return $true }

    if ($ProxyAvailable) {
        Write-Host "Rules resource download failed directly. Retrying through $ProxyUrl ..." -ForegroundColor Yellow
        Enable-ProxyEnv
        & $Python $RuleResourceBuilder
        $ok = $LASTEXITCODE -eq 0
        Clear-ProxyEnv
        return $ok
    }
    return $false
}

Set-Location $Root

Write-Host 'Rulesmd Editor - Development Launcher' -ForegroundColor Green
Write-Host "Project: $Root"

$ProxyAvailable = Test-LocalPort $ProxyHost $ProxyPort
if ($ProxyAvailable) {
    Write-Host "Local development proxy available: $ProxyUrl" -ForegroundColor Green
} else {
    Write-Host "Local development proxy unavailable: $ProxyUrl" -ForegroundColor Yellow
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'Node.js was not found. Install Node.js LTS and run this launcher again.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Fail 'npm was not found. Reinstall Node.js LTS and run this launcher again.' }

Refresh-RustPath
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Install-RustToolchain
}

$env:CARGO_HTTP_MULTIPLEXING = 'false'
$env:CARGO_NET_RETRY = '2'
$env:CARGO_HTTP_TIMEOUT = '30'
Write-Host "Cargo source replacement: crates.io -> $RsProxyIndex" -ForegroundColor Green

$PythonBootstrap = $null
if (Get-Command py -ErrorAction SilentlyContinue) { $PythonBootstrap = 'py' }
elseif (Get-Command python -ErrorAction SilentlyContinue) { $PythonBootstrap = 'python' }
else { Fail 'Python 3.10+ was not found. Install Python and run this launcher again.' }

# A Python venv is not portable between Windows installations because pyvenv.cfg and
# the launcher inside Scripts keep references to the interpreter that created it.
# If somebody copies the whole project folder to another machine, validate the venv by
# actually starting its Python rather than merely checking whether python.exe exists.
if ((Test-Path $Venv) -and (-not (Test-VenvPython))) {
    Write-Step 'Existing Python virtual environment is stale - rebuilding it for this computer'
    Remove-Item $Venv -Recurse -Force -ErrorAction Stop
}

if (-not (Test-Path $Python)) {
    Write-Step 'Creating Python virtual environment (.venv)'
    if ($PythonBootstrap -eq 'py') { & py -3 -m venv $Venv } else { & python -m venv $Venv }
}
if (-not (Test-VenvPython)) { Fail 'Python virtual environment could not be created or started.' }

$PackageStamp = Join-Path $Venv '.rulesmd-editor-installed'
if (-not (Test-Path $PackageStamp)) {
    Write-Step 'Registering Python backend in the virtual environment'
    & $Python -m pip install --disable-pip-version-check -e $Root --no-deps
    if ($LASTEXITCODE -ne 0) { Fail 'Python backend installation failed.' }
    New-Item -ItemType File -Path $PackageStamp -Force | Out-Null
}

# Build the local runtime rule database only when it is missing. The generated bundle
# contains the cleaned full rulesmd.pre template plus HelpInfor/NamesDesc-derived data.
if ((-not (Test-Path $RuleTemplate)) -or (-not (Test-Path $RuleSchema)) -or (-not (Test-Path $LegacyHelp)) -or (-not (Test-Path $LegacyNames))) {
    if (-not (Build-RuleResources)) { Fail 'Rules metadata/default-template generation failed.' }
} else {
    Write-Host 'Rules metadata and default template are ready.' -ForegroundColor DarkGray
}

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

New-Item -ItemType Directory -Path $LegacyAssets -Force | Out-Null
Write-Step 'Synchronizing legacy RulesmdEditorWeb UI assets'
$LegacyBase = 'https://raw.githubusercontent.com/terry-xu-2077/RulesmdEditorWeb/main/img'
Sync-LegacyAsset 'iconTile.jpg' "$LegacyBase/iconTile.jpg"
Sync-LegacyAsset 'countryTile.png' "$LegacyBase/countryTile.png"
Sync-LegacyAsset 'bgIcon.png' "$LegacyBase/bgIcon.png"
Sync-LegacyAsset 'RA2_NONE.png' "$LegacyBase/RA2_NONE.png"
Sync-LegacyAsset 'app-logo.png' "$LegacyBase/appIcon/%E8%B5%84%E6%BA%90%201@64x-8.png"

if (-not (Test-Path $IconSource)) {
    Fail "App icon source is missing: $IconSource"
}
$IconHash = (Get-FileHash -Algorithm SHA256 $IconSource).Hash
$InstalledIconHash = if (Test-Path $IconStamp) { (Get-Content $IconStamp -Raw).Trim() } else { '' }
if (($IconHash -ne $InstalledIconHash) -or (-not (Test-Path $IconProduct))) {
    Write-Step 'Generating application icons from changed PNG source'
    Push-Location $Frontend
    try {
        & npm run tauri -- icon "src-tauri/app-icon.png" --output "src-tauri/icons"
        if ($LASTEXITCODE -ne 0) { Fail 'Tauri icon generation failed.' }
        Set-Content -Path $IconStamp -Value $IconHash -NoNewline
    } finally { Pop-Location }
} else {
    Write-Host 'Application icons are up to date.' -ForegroundColor DarkGray
}

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
