@echo off
setlocal
cd /d %~dp0

echo Starting Smart Manuals Documentation...
echo.

:: Start the browser
start "" "http://localhost:3000"

:: Start the server from the current directory
node server.js

pause
