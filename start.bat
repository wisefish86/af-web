@echo off
title Andrey Fitness

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed or is not available in PATH.
  echo.
  echo Install the LTS version of Node.js, then close this window
  echo and start this file again.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo npm was not found.
  echo Reinstall Node.js LTS and make sure it is added to PATH.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed.
    pause
    exit /b 1
  )
)

start "" http://localhost:5173
call npm run dev
pause
