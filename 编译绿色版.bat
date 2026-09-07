@echo off
chcp 65001 >nul
cd /d "%~dp0"

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
