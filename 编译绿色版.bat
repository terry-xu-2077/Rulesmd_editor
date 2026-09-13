@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

rem Keep the user's configured mirror as the primary index, but let pip fall back to
rem official PyPI for build-only packages that some mirrors may not carry.
set "PIP_EXTRA_INDEX_URL=https://pypi.org/simple"

echo Rulesmd Editor - 绿色测试版编译
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-portable.ps1"
set "BUILD_EXIT=%ERRORLEVEL%"

echo.
if not "%BUILD_EXIT%"=="0" (
    echo [FAILED] 编译失败，请查看上方错误信息。
) else (
    echo [OK] 编译完成，测试包位于 release 目录。
)
echo.
pause
exit /b %BUILD_EXIT%
