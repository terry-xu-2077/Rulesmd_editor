param(
    [switch]$NoZip,
    [switch]$SkipFrontendInstall
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
$Frontend = Join-Path $Root 'frontend'
$TauriDir = Join-Path $Frontend 'src-tauri'
$TauriExe = Join-Path $TauriDir 'target\release\rulesmd-editor.exe'
$Venv = Join-Path $Root '.venv'
$Python = Join-Path $Venv 'Scripts\python.exe'
$Resources = Join-Path $Root 'src\rulesmd_editor\resources'
$RuleBuilder = Join-Path $Root 'tools\build_rule_resources.py'
$RuleTemplate = Join-Path $Resources 'generated\rulesmd.template.ini'
$RuleSchema = Join-Path $Resources 'generated\rules_schema.json'
$LegacyHelp = Join-Path $Resources 'legacy\HelpInfor.ini'
$LegacyNames = Join-Path $Resources 'legacy\NamesDesc.ini'
$IconSource = Join-Path $TauriDir 'app-icon.png'
$IconProduct = Join-Path $TauriDir 'icons\icon.ico'

$BuildRoot = Join-Path $Root 'build\portable'
$BackendEntry = Join-Path $BuildRoot 'backend_entry.py'
$BackendDist = Join-Path $BuildRoot 'dist'
$BackendWork = Join-Path $BuildRoot 'work'
$BackendSpec = Join-Path $BuildRoot 'spec'
$BackendBuiltDir = Join-Path $BackendDist 'rulesmd-backend'
$BackendBuiltExe = Join-Path $BackendBuiltDir 'rulesmd-backend.exe'

$ReleaseRoot = Join-Path $Root 'release'
$PackageName = 'Rulesmd Editor 测试版'
$PackageDir = Join-Path $ReleaseRoot $PackageName
$PackageExe = Join-Path $PackageDir 'Rulesmd Editor.exe'
$PackageRuntime = Join-Path $PackageDir 'runtime'
$PackageBackend = Join-Path $PackageRuntime 'backend'
$PackageBackendExe = Join-Path $PackageBackend 'rulesmd-backend.exe'
$ZipPath = Join-Path $ReleaseRoot "$PackageName.zip"

$ProxyHost = '127.0.0.1'
$ProxyPort = 7897
$ProxyUrl = "http://${ProxyHost}:${ProxyPort}"

function Write-Step([string]$Text) {
    Write-Host "`n==> $Text" -ForegroundColor Cyan
}

function Fail([string]$Text) {
    throw $Text
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

function Invoke-WithProxyFallback([scriptblock]$Action, [string]$Description) {
    Clear-ProxyEnv
    & $Action
    if ($LASTEXITCODE -eq 0) { return }

    if (-not $script:ProxyAvailable) {
        Fail "$Description failed, and local proxy $ProxyUrl is unavailable."
    }

    Write-Host "$Description failed directly. Retrying through $ProxyUrl ..." -ForegroundColor Yellow
    Enable-ProxyEnv
    & $Action
    $code = $LASTEXITCODE
    Clear-ProxyEnv
    if ($code -ne 0) {
        Fail "$Description failed both directly and through $ProxyUrl."
    }
}

function Test-VenvPython {
    if (-not (Test-Path -LiteralPath $Python)) { return $false }
    try {
        & $Python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" *> $null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Ensure-PythonEnvironment {
    if (Test-VenvPython) { return }

    $bootstrap = $null
    if (Get-Command py -ErrorAction SilentlyContinue) { $bootstrap = 'py' }
    elseif (Get-Command python -ErrorAction SilentlyContinue) { $bootstrap = 'python' }
    else { Fail 'Python 3.10+ was not found. Install Python before building the portable package.' }

    if (Test-Path -LiteralPath $Venv) {
        Write-Step 'Removing stale Python virtual environment'
        Remove-Item -LiteralPath $Venv -Recurse -Force
    }

    Write-Step 'Creating Python virtual environment'
    if ($bootstrap -eq 'py') {
        & py -3 -m venv $Venv
    } else {
        & python -m venv $Venv
    }
    if (-not (Test-VenvPython)) { Fail 'Python virtual environment could not be created.' }
}

function Ensure-PythonBuildTools {
    Write-Step 'Preparing Python backend build environment'
    & $Python -m pip install --disable-pip-version-check -e $Root --no-deps
    if ($LASTEXITCODE -ne 0) { Fail 'Unable to register the Rulesmd Python package in the virtual environment.' }

    & $Python -c "import PyInstaller" *> $null
    if ($LASTEXITCODE -eq 0) {
        Write-Host 'PyInstaller is already available.' -ForegroundColor DarkGray
        return
    }

    Invoke-WithProxyFallback {
        & $Python -m pip install --disable-pip-version-check 'pyinstaller>=6'
    } 'PyInstaller installation'
}

function Ensure-RuleResources {
    $required = @($RuleTemplate, $RuleSchema, $LegacyHelp, $LegacyNames)
    $missing = @($required | Where-Object { -not (Test-Path -LiteralPath $_) })
    if ($missing.Count -eq 0) {
        Write-Host 'Rules metadata and default template are ready.' -ForegroundColor DarkGray
        return
    }

    Write-Step 'Generating rules metadata and default template'
    Invoke-WithProxyFallback {
        & $Python $RuleBuilder
    } 'Rules resource generation'

    $stillMissing = @($required | Where-Object { -not (Test-Path -LiteralPath $_) })
    if ($stillMissing.Count -gt 0) {
        Fail "Rules resource generation finished but required files are still missing:`n$($stillMissing -join "`n")"
    }
}

function Ensure-FrontendDependencies {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'Node.js was not found.' }
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Fail 'npm was not found.' }
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { Fail 'Rust/Cargo was not found.' }

    $modules = Join-Path $Frontend 'node_modules'
    if ((Test-Path -LiteralPath $modules) -or $SkipFrontendInstall) { return }

    Write-Step 'Installing frontend dependencies'
    Push-Location $Frontend
    try {
        Invoke-WithProxyFallback {
            & npm install --package-lock=false
        } 'npm install'
    } finally {
        Pop-Location
    }
}

function Ensure-AppIcon {
    if (Test-Path -LiteralPath $IconProduct) { return }
    if (-not (Test-Path -LiteralPath $IconSource)) { Fail "Application icon source is missing: $IconSource" }

    Write-Step 'Generating Tauri application icons'
    Push-Location $Frontend
    try {
        & npm run tauri -- icon 'src-tauri/app-icon.png' --output 'src-tauri/icons'
        if ($LASTEXITCODE -ne 0) { Fail 'Tauri icon generation failed.' }
    } finally {
        Pop-Location
    }
}

function Build-PythonBackend {
    Write-Step 'Building Python backend into runtime/backend'
    if (Test-Path -LiteralPath $BuildRoot) {
        Remove-Item -LiteralPath $BuildRoot -Recurse -Force
    }
    New-Item -ItemType Directory -Path $BuildRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $BackendSpec -Force | Out-Null

    @'
from rulesmd_editor.desktop_bridge import main

if __name__ == "__main__":
    main()
'@ | Set-Content -LiteralPath $BackendEntry -Encoding UTF8

    $addData = "$Resources;rulesmd_editor/resources"
    & $Python -m PyInstaller `
        --noconfirm `
        --clean `
        --onedir `
        --console `
        --name 'rulesmd-backend' `
        --distpath $BackendDist `
        --workpath $BackendWork `
        --specpath $BackendSpec `
        --add-data $addData `
        $BackendEntry

    if ($LASTEXITCODE -ne 0) { Fail 'PyInstaller backend build failed.' }
    if (-not (Test-Path -LiteralPath $BackendBuiltExe)) {
        Fail "Backend build finished but executable was not found: $BackendBuiltExe"
    }
}

function Build-TauriApp {
    Write-Step 'Building Tauri desktop executable (no installer bundle)'
    Clear-ProxyEnv
    Push-Location $Frontend
    try {
        & npm run tauri -- build --no-bundle
        $code = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    if ($code -ne 0) { Fail "Tauri build failed with exit code $code." }
    if (-not (Test-Path -LiteralPath $TauriExe)) {
        Fail "Tauri build finished but executable was not found: $TauriExe"
    }
}

function Assemble-Package {
    Write-Step 'Assembling clean portable package'
    if (Test-Path -LiteralPath $PackageDir) {
        Remove-Item -LiteralPath $PackageDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $PackageBackend -Force | Out-Null

    Copy-Item -LiteralPath $TauriExe -Destination $PackageExe -Force
    Copy-Item -Path (Join-Path $BackendBuiltDir '*') -Destination $PackageBackend -Recurse -Force

    if (-not (Test-Path -LiteralPath $PackageExe)) { Fail 'Portable main executable was not copied.' }
    if (-not (Test-Path -LiteralPath $PackageBackendExe)) { Fail 'Portable backend executable was not copied.' }

    $rootItems = @(Get-ChildItem -LiteralPath $PackageDir -Force)
    $unexpected = @($rootItems | Where-Object { $_.Name -notin @('Rulesmd Editor.exe', 'runtime') })
    if ($unexpected.Count -gt 0) {
        Fail "Portable package root contains unexpected files: $($unexpected.Name -join ', ')"
    }
    if ($rootItems.Count -ne 2) {
        Fail "Portable package root should contain exactly the main EXE and runtime folder, but contains $($rootItems.Count) items."
    }
}

function Test-PackagedBackend {
    Write-Step 'Testing bundled backend from Chinese + space path'
    # PackageDir intentionally contains Chinese characters and spaces. Launching the
    # final copied backend from here verifies that no cmd.exe/string-quoting path is used.
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $PackageBackendExe
    $psi.WorkingDirectory = $PackageBackend
    $psi.UseShellExecute = $false
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    $process = [System.Diagnostics.Process]::Start($psi)
    if ($null -eq $process) { Fail 'Unable to start the packaged backend for smoke testing.' }

    try {
        $process.StandardInput.WriteLine('{"id":1,"method":"ping","params":{}}')
        $process.StandardInput.Flush()
        $responseLine = $process.StandardOutput.ReadLine()
        if ([string]::IsNullOrWhiteSpace($responseLine)) {
            $stderr = $process.StandardError.ReadToEnd()
            Fail "Packaged backend returned no response. stderr: $stderr"
        }

        $response = $responseLine | ConvertFrom-Json
        if (($response.ok -ne $true) -or ($response.result.status -ne 'ok')) {
            Fail "Packaged backend ping failed: $responseLine"
        }
        Write-Host 'Chinese-path backend smoke test passed.' -ForegroundColor Green
    } finally {
        try { $process.StandardInput.Close() } catch {}
        if (-not $process.HasExited) {
            $process.Kill()
            $process.WaitForExit()
        }
        $process.Dispose()
    }
}

function Create-Zip {
    if ($NoZip) { return }
    Write-Step 'Creating player ZIP package'
    if (Test-Path -LiteralPath $ZipPath) { Remove-Item -LiteralPath $ZipPath -Force }
    Compress-Archive -LiteralPath $PackageDir -DestinationPath $ZipPath -CompressionLevel Optimal
    if (-not (Test-Path -LiteralPath $ZipPath)) { Fail 'ZIP creation failed.' }
}

Set-Location $Root
Write-Host 'Rulesmd Editor - Portable Windows Builder' -ForegroundColor Green
Write-Host "Project: $Root"
Write-Host "Output:  $PackageDir"

$script:ProxyAvailable = Test-LocalPort $ProxyHost $ProxyPort
if ($script:ProxyAvailable) {
    Write-Host "Local proxy available for dependency fallback: $ProxyUrl" -ForegroundColor DarkGray
}

Ensure-PythonEnvironment
Ensure-PythonBuildTools
Ensure-RuleResources
Ensure-FrontendDependencies
Ensure-AppIcon
Build-PythonBackend
Build-TauriApp
Assemble-Package
Test-PackagedBackend
Create-Zip

Write-Host ''
Write-Host 'Portable build succeeded.' -ForegroundColor Green
Write-Host "Player folder: $PackageDir"
if (-not $NoZip) {
    Write-Host "Player ZIP:    $ZipPath"
}
Write-Host 'Package root contains only Rulesmd Editor.exe and runtime\.' -ForegroundColor Green
