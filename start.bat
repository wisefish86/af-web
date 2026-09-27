@echo off
title Andrey Fitness
if not exist node_modules call npm install
start "" http://localhost:5173
call npm run dev
pause
