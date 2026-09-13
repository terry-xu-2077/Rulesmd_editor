@echo off
setlocal
cd /d "%~dp0"

rem Keep the user's configured mirror as the primary index, but let pip fall back to
rem official PyPI for build-only packages that some mirrors may not carry.
set "PIP_EXTRA_INDEX_URL=https://pypi.org/simple"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-dev.ps1"
if errorlevel 1 pause
endlocal
