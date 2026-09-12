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
$IconSource = Join-Path $TauriDir 'app-icon.png'
$IconProduct = Join-Path $TauriDir 'icons\icon.ico'
$GameAssets = Join-Path $Frontend 'public\game-assets'

$BuildRoot = Join-Path $Root 'build\portable'
$BackendEntry = Join-Path $BuildRoot 'backend_entry.py'
$BackendDist = Join-Path $BuildRoot 'dist'
$BackendWork = Join-Path $BuildRoot 'work'
$BackendSpec = Join-Path $BuildRoot 'spec'
$BackendBuiltDir = Join-Path $BackendDist 'rulesmd-backend'
$BackendBuiltExe = Join-Path $BackendBuiltDir 'rulesmd-backend.exe'

$ReleaseRoot = Join-Path $Root 'release'

function New-UnicodeString([int[]]$CodePoints) {
    return -join ($CodePoints | ForEach-Object { [char]$_ })
}

$TestEdition = New-UnicodeString @(0x6D4B, 0x8BD5, 0x7248)
$PackageName = "Rulesmd Editor $TestEdition"
$PackageDir = Join-Path $ReleaseRoot $PackageName
$PackageExe = Join-Path $PackageDir 'Rulesmd Editor.exe'
$PackageResources = Join-Path $PackageDir 'resources'
$PackageRuntime = Join-Path $PackageDir 'runtime'
$PackageBackendExe = Join-Path $PackageRuntime 'rulesmd-backend.exe'
$PackageBackendInternal = Join-Path $PackageRuntime '_internal'
$PackageRuleTemplate = Join-Path $PackageResources 'generated\rulesmd.template.ini'
$PackageRuleSchema = Join-Path $PackageResources 'generated\rules_schema.json'
$PackageAresSchema = Join-Path $PackageResources 'generated\ares_schema.json'
$PackageAresUnlocks = Join-Path $PackageResources 'ares_hardcode_unlocks.json'
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
    @(
        'HTTP_PROXY',
        'HTTPS_PROXY',
        'ALL_PROXY',
        'CARGO_HTTP_PROXY',
        'GIT_HTTP_PROXY',
        'GIT_HTTPS_PROXY'
    ) | ForEach-Object {
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

function Invoke-NativeAllowFailure([scriptblock]$Action) {
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $Action | Out-Host
        return [int]$LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
}

function Invoke-WithProxyFallback([scriptblock]$Action, [string]$Description) {
    Clear-ProxyEnv
    $code = Invoke-NativeAllowFailure $Action
    if ($code -eq 0) { return }

    if (-not $script:ProxyAvailable) {
        Fail "$Description failed, and local proxy $ProxyUrl is unavailable."
    }

    Write-Host "$Description failed directly. Retrying through $ProxyUrl ..." -ForegroundColor Yellow
    Enable-ProxyEnv
    try {
        $code = Invoke-NativeAllowFailure $Action
    } finally {
        Clear-ProxyEnv
    }
    if ($code -ne 0) {
        Fail "$Description failed both directly and through $ProxyUrl."
    }
}

function Test-VenvPython {
    if (-not (Test-Path -LiteralPath $Python)) { return $false }
    try {
        $code = Invoke-NativeAllowFailure {
            & $Python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" *> $null
        }
        return $code -eq 0
    } catch {
        return $false
    }
}

function Ensure-PythonEnvironment {
    if (Test-VenvPython) { return }

    $bootstrap = $null
    if (Get-Command py -ErrorAction SilentlyContinue) {
        $bootstrap = 'py'
    } elseif (Get-Command python -ErrorAction SilentlyContinue) {
        $bootstrap = 'python'
    } else {
        Fail 'Python 3.10 or newer was not found.'
    }

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

    if (-not (Test-VenvPython)) {
        Fail 'Python virtual environment could not be created.'
    }
}

function Ensure-PythonBuildTools {
    Write-Step 'Preparing Python backend build environment'
    Invoke-WithProxyFallback {
        & $Python -m pip install --disable-pip-version-check -e $Root
    } 'Rulesmd Python runtime dependency installation'

    $code = Invoke-NativeAllowFailure {
        & $Python -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('PyInstaller') else 1)" *> $null
    }
    if ($code -eq 0) {
        Write-Host 'PyInstaller is already available.' -ForegroundColor DarkGray
        return
    }

    Invoke-WithProxyFallback {
        & $Python -m pip install --disable-pip-version-check 'pyinstaller>=6'
    } 'PyInstaller installation'
}

function Ensure-RuleResources {
    $required = @($RuleTemplate, $RuleSchema)
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
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Fail 'Node.js was not found.'
    }
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Fail 'npm was not found.'
    }
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        Fail 'Rust/Cargo was not found.'
    }

    if ($SkipFrontendInstall) {
        Write-Host 'Frontend dependency installation was skipped by request.' -ForegroundColor DarkGray
        return
    }

    Write-Step 'Installing/updating frontend dependencies'
    Push-Location $Frontend
    try {
        Invoke-WithProxyFallback {
            & npm install --package-lock=false
        } 'npm install'
    } finally {
        Pop-Location
    }
}

function Sync-GameAsset([string]$Name, [string]$Url) {
    $target = Join-Path $GameAssets $Name
    if (Test-Path -LiteralPath $target) { return }

    try {
        Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $target -TimeoutSec 20
        return
    } catch {
        if (-not $script:ProxyAvailable) {
            Write-Host "[WARN] Unable to download game asset $Name." -ForegroundColor Yellow
            Remove-Item -LiteralPath $target -ErrorAction SilentlyContinue
            return
        }
    }

    try {
        Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $target -Proxy $ProxyUrl -TimeoutSec 30
    } catch {
        Write-Host "[WARN] Unable to download game asset $Name." -ForegroundColor Yellow
        Remove-Item -LiteralPath $target -ErrorAction SilentlyContinue
    }
}

function Ensure-GameAssets {
    Write-Step 'Synchronizing game UI assets'
    New-Item -ItemType Directory -Path $GameAssets -Force | Out-Null

    $base = 'https://raw.githubusercontent.com/terry-xu-2077/RulesmdEditorWeb/main/img'
    Sync-GameAsset 'iconTile.jpg' "$base/iconTile.jpg"
    Sync-GameAsset 'countryTile.png' "$base/countryTile.png"
    Sync-GameAsset 'bgIcon.png' "$base/bgIcon.png"
    Sync-GameAsset 'RA2_NONE.png' "$base/RA2_NONE.png"
    Sync-GameAsset 'app-logo.png' "$base/appIcon/%E8%B5%84%E6%BA%90%201@64x-8.png"
}

function Ensure-AppIcon {
    if (Test-Path -LiteralPath $IconProduct) { return }
    if (-not (Test-Path -LiteralPath $IconSource)) {
        Fail "Application icon source is missing: $IconSource"
    }

    Write-Step 'Generating Tauri application icons'
    Push-Location $Frontend
    try {
        & npm run tauri -- icon 'src-tauri/app-icon.png' --output 'src-tauri/icons'
        if ($LASTEXITCODE -ne 0) {
            Fail 'Tauri icon generation failed.'
        }
    } finally {
        Pop-Location
    }
}

function Build-PythonBackend {
    Write-Step 'Building Python backend into runtime'

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

    $args = @(
        '-m', 'PyInstaller',
        '--noconfirm',
        '--clean',
        '--onedir',
        '--console',
        '--name', 'rulesmd-backend',
        '--distpath', $BackendDist,
        '--workpath', $BackendWork,
        '--specpath', $BackendSpec,
        $BackendEntry
    )

    & $Python @args
    if ($LASTEXITCODE -ne 0) {
        Fail 'PyInstaller backend build failed.'
    }
    if (-not (Test-Path -LiteralPath $BackendBuiltExe)) {
        Fail "Backend build finished but executable was not found: $BackendBuiltExe"
    }
}

function Build-TauriApp {
    Write-Step 'Building Tauri desktop executable without installer bundle'
    Clear-ProxyEnv

    Push-Location $Frontend
    try {
        & npm run tauri -- build --no-bundle
        $code = $LASTEXITCODE
    } finally {
        Pop-Location
    }

    if ($code -ne 0) {
        Fail "Tauri build failed with exit code $code."
    }
    if (-not (Test-Path -LiteralPath $TauriExe)) {
        Fail "Tauri build finished but executable was not found: $TauriExe"
    }
}

function Assemble-Package {
    Write-Step 'Assembling flat portable package'

    if (Test-Path -LiteralPath $PackageDir) {
        Remove-Item -LiteralPath $PackageDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $PackageRuntime -Force | Out-Null
    New-Item -ItemType Directory -Path $PackageResources -Force | Out-Null

    Copy-Item -LiteralPath $TauriExe -Destination $PackageExe -Force
    Copy-Item -Path (Join-Path $BackendBuiltDir '*') -Destination $PackageRuntime -Recurse -Force
    Copy-Item -LiteralPath (Join-Path $Resources 'generated') -Destination $PackageResources -Recurse -Force
    Copy-Item -LiteralPath (Join-Path $Resources 'ares_hardcode_unlocks.json') -Destination $PackageResources -Force

    if (-not (Test-Path -LiteralPath $PackageExe)) {
        Fail 'Portable main executable was not copied.'
    }
    if (-not (Test-Path -LiteralPath $PackageBackendExe)) {
        Fail 'Portable backend executable was not copied.'
    }
    if (-not (Test-Path -LiteralPath $PackageBackendInternal -PathType Container)) {
        Fail 'Portable backend _internal directory was not copied.'
    }

    $requiredPackagedResources = @(
        $PackageRuleTemplate,
        $PackageRuleSchema,
        $PackageAresSchema,
        $PackageAresUnlocks
    )
    $missingPackagedResources = @(
        $requiredPackagedResources | Where-Object { -not (Test-Path -LiteralPath $_) }
    )
    if ($missingPackagedResources.Count -gt 0) {
        Fail "Portable resources are incomplete:`n$($missingPackagedResources -join "`n")"
    }

    $resourceRootItems = @(Get-ChildItem -LiteralPath $PackageResources -Force)
    $unexpectedResources = @($resourceRootItems | Where-Object { $_.Name -notin @('generated', 'ares_hardcode_unlocks.json') })
    if ($unexpectedResources.Count -gt 0) {
        Fail "Portable resources contain development/source files: $($unexpectedResources.Name -join ', ')"
    }

    $rootItems = @(Get-ChildItem -LiteralPath $PackageDir -Force)
    $unexpectedRoot = @(
        $rootItems | Where-Object { $_.Name -notin @('Rulesmd Editor.exe', 'resources', 'runtime') }
    )
    if ($unexpectedRoot.Count -gt 0) {
        Fail "Portable package root contains unexpected files: $($unexpectedRoot.Name -join ', ')"
    }
    if ($rootItems.Count -ne 3) {
        Fail "Portable package root must contain exactly three items, but contains $($rootItems.Count)."
    }

    $runtimeItems = @(Get-ChildItem -LiteralPath $PackageRuntime -Force)
    $unexpectedRuntime = @(
        $runtimeItems | Where-Object { $_.Name -notin @('rulesmd-backend.exe', '_internal') }
    )
    if ($unexpectedRuntime.Count -gt 0) {
        Fail "Portable runtime contains unexpected files: $($unexpectedRuntime.Name -join ', ')"
    }
    if ($runtimeItems.Count -ne 2) {
        Fail "Portable runtime must contain exactly rulesmd-backend.exe and _internal, but contains $($runtimeItems.Count) items."
    }
}

function Test-PackagedBackend {
    Write-Step 'Testing bundled backend from the final portable layout'

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $PackageBackendExe
    $psi.WorkingDirectory = $PackageRuntime
    $psi.UseShellExecute = $false
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $psi.EnvironmentVariables['PYTHONUTF8'] = '1'
    $psi.EnvironmentVariables['PYTHONIOENCODING'] = 'utf-8'
    $psi.EnvironmentVariables['RULESMD_RESOURCES_DIR'] = $PackageResources

    $process = [System.Diagnostics.Process]::Start($psi)
    if ($null -eq $process) {
        Fail 'Unable to start the packaged backend for smoke testing.'
    }

    try {
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        $stdin = $process.StandardInput.BaseStream

        $pingObject = [ordered]@{
            id = 1
            method = 'ping'
            params = @{ unicode = $TestEdition }
        }
        $pingBytes = $utf8NoBom.GetBytes(($pingObject | ConvertTo-Json -Compress) + "`n")
        $stdin.Write($pingBytes, 0, $pingBytes.Length)
        $stdin.Flush()
        $pingLine = $process.StandardOutput.ReadLine()
        if ([string]::IsNullOrWhiteSpace($pingLine)) {
            $stderr = $process.StandardError.ReadToEnd()
            Fail "Packaged backend returned no ping response. stderr: $stderr"
        }
        $ping = $pingLine | ConvertFrom-Json
        if (($ping.ok -ne $true) -or ($ping.result.status -ne 'ok') -or ($ping.result.unicode -ne $TestEdition)) {
            Fail "Packaged backend ping failed: $pingLine"
        }

        $newObject = [ordered]@{ id = 2; method = 'new_document'; params = @{} }
        $newBytes = $utf8NoBom.GetBytes(($newObject | ConvertTo-Json -Compress) + "`n")
        $stdin.Write($newBytes, 0, $newBytes.Length)
        $stdin.Flush()
        $newLine = $process.StandardOutput.ReadLine()
        if ([string]::IsNullOrWhiteSpace($newLine)) {
            $stderr = $process.StandardError.ReadToEnd()
            Fail "Packaged backend returned no new_document response. stderr: $stderr"
        }
        $newResponse = $newLine | ConvertFrom-Json
        if ($newResponse.ok -ne $true) {
            Fail "Packaged backend new_document failed: $newLine"
        }
        if (($newResponse.result.document.section_count -lt 10) -or ($newResponse.result.categories.Count -lt 1)) {
            Fail "Packaged backend new_document returned an incomplete template: $newLine"
        }

        $iconObject = [ordered]@{ id = 3; method = 'icon_library_snapshot'; params = @{} }
        $iconBytes = $utf8NoBom.GetBytes(($iconObject | ConvertTo-Json -Compress) + "`n")
        $stdin.Write($iconBytes, 0, $iconBytes.Length)
        $stdin.Flush()
        $iconLine = $process.StandardOutput.ReadLine()
        if ([string]::IsNullOrWhiteSpace($iconLine)) {
            $stderr = $process.StandardError.ReadToEnd()
            Fail "Packaged backend returned no icon resource response. stderr: $stderr"
        }
        $iconResponse = $iconLine | ConvertFrom-Json
        if ($iconResponse.ok -ne $true) {
            Fail "Packaged backend icon resource dependency test failed: $iconLine"
        }

        Write-Host 'Portable backend ping, new-document template, Pillow icon resources, UTF-8, and flat layout smoke tests passed.' -ForegroundColor Green
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
    if (Test-Path -LiteralPath $ZipPath) {
        Remove-Item -LiteralPath $ZipPath -Force
    }

    Compress-Archive -LiteralPath $PackageDir -DestinationPath $ZipPath -CompressionLevel Optimal
    if (-not (Test-Path -LiteralPath $ZipPath)) {
        Fail 'ZIP creation failed.'
    }
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
Ensure-GameAssets
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
Write-Host 'Package root: Rulesmd Editor.exe, resources, runtime.' -ForegroundColor Green
Write-Host 'Runtime root: rulesmd-backend.exe, _internal.' -ForegroundColor Green
