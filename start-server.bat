@echo off
REM SnailTube Storage Server Startup Script for Windows

echo.
echo ===================================
echo  🐌 SnailTube Storage Server
echo ===================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
  echo 📦 Installing dependencies...
  call npm install
  echo.
)

REM Set default port if not specified
if "%PORT%"=="" set PORT=8000

echo 🚀 Server starting on port %PORT%
echo 📍 Open http://localhost:%PORT% in your browser
echo.

node server.js

pause
