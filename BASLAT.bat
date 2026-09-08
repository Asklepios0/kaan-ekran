@echo off
chcp 65001 >nul
title Kaan Elektronik Kiosk Baslatici
cd /d "%~dp0"

echo ===================================================
echo   KAAN ELEKTRONIK - HASANPASA TV KIOSK BASLATICI
echo ===================================================
echo.

:: 1. Python kontrolu
set "PYTHON_EXE=python"
where python >nul 2>nul
if %errorlevel% neq 0 (
    if exist "C:\Users\Bedirhan\Python313\python.exe" (
        set "PYTHON_EXE=C:\Users\Bedirhan\Python313\python.exe"
    ) else (
        echo [HATA] Python bulunamadi!
        pause
        exit /b 1
    )
)

:: 2. Sunucuyu Baslat
echo [1/3] Kiosk yerel sunucusu baslatiliyor...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*backend/server.py*' -or $_.CommandLine -like '*backend\server.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>nul

start "Kaan Kiosk Sunucusu" /min "%PYTHON_EXE%" backend\server.py

:: Sunucunun acilmasini bekle (3 saniye)
powershell -NoProfile -Command "Start-Sleep -Seconds 3" >nul 2>nul

:: 3. Tarayiciyi Kiosk Modunda Ac
echo [2/3] Tam ekran Kiosk ekrani aciliyor...

set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
set "CHROME_X86=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
set "EDGE_PATH=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
set "EDGE_64=C:\Program Files\Microsoft\Edge\Application\msedge.exe"

if exist "%EDGE_64%" (
    start "" "%EDGE_64%" --kiosk "http://localhost:8080" --edge-kiosk-type=fullscreen --no-first-run --disable-pinch
) else if exist "%EDGE_PATH%" (
    start "" "%EDGE_PATH%" --kiosk "http://localhost:8080" --edge-kiosk-type=fullscreen --no-first-run --disable-pinch
) else if exist "%CHROME_PATH%" (
    start "" "%CHROME_PATH%" --kiosk "http://localhost:8080" --disable-pinch --overscroll-history-navigation=0 --no-first-run
) else if exist "%CHROME_X86%" (
    start "" "%CHROME_X86%" --kiosk "http://localhost:8080" --disable-pinch --overscroll-history-navigation=0 --no-first-run
) else (
    start "" "http://localhost:8080"
)

echo.
echo [3/3] Kiosk sistemi basariyla baslatildi!
echo.
echo ===================================================
echo  * Kiosk tam ekranindan cikmak icin: ALT + F4 veya F11
echo  * Sunucuyu tamamen kapatmak icin: DURDUR.bat
echo ===================================================
echo.
powershell -NoProfile -Command "Start-Sleep -Seconds 3" >nul 2>nul
