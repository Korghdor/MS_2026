@echo off
setlocal
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0update-site.ps1" %*
exit /b %errorlevel%
