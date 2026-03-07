@echo off
:: agent-telegram CLI Installer (CMD fallback)
::
:: This script delegates to the PowerShell installer.
:: If PowerShell is not available, it prints an error.
::
:: Usage:
::   install.cmd
::   install.cmd -Version 0.1.0

where powershell >nul 2>nul
if %errorlevel% equ 0 (
    powershell -ExecutionPolicy Bypass -Command "& { irm https://kurier.sh/install.ps1 -OutFile '%TEMP%\agent-telegram-install.ps1'; & '%TEMP%\agent-telegram-install.ps1' %*; Remove-Item '%TEMP%\agent-telegram-install.ps1' -ErrorAction SilentlyContinue }"
    exit /b %errorlevel%
)

where pwsh >nul 2>nul
if %errorlevel% equ 0 (
    pwsh -ExecutionPolicy Bypass -Command "& { irm https://kurier.sh/install.ps1 -OutFile '%TEMP%\agent-telegram-install.ps1'; & '%TEMP%\agent-telegram-install.ps1' %*; Remove-Item '%TEMP%\agent-telegram-install.ps1' -ErrorAction SilentlyContinue }"
    exit /b %errorlevel%
)

echo.
echo Error: PowerShell is required but not found.
echo.
echo Install PowerShell from: https://learn.microsoft.com/en-us/powershell/scripting/install/installing-powershell-on-windows
echo.
exit /b 1
