@echo off
chcp 65001 >nul
title Kaan Elektronik TV Kiosk Durdurucu
echo Kaan Elektronik Kiosk servisi durduruluyor...
powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*backend/server.py*' -or $_.CommandLine -like '*backend\server.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo Servis basariyla durduruldu.
timeout /t 2 >nul
exit 0
