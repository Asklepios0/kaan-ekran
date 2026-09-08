<# :
@echo off
chcp 65001 >nul
title Kaan Elektronik TV Kiosk Baslatici
setlocal
set "SCRIPT_DIR=%~dp0"
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$code = [System.IO.File]::ReadAllText('%~f0', [System.Text.Encoding]::UTF8); Invoke-Expression $code"
exit /b %errorlevel%
#>

$ErrorActionPreference = "SilentlyContinue"

try {
    # 1. Proje Dizinini Belirle
    $desktopPath = [Environment]::GetFolderPath('Desktop')
    $targetDir = Join-Path $desktopPath "KaanElektronik_TVEkran"
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

    if (Test-Path (Join-Path $scriptDir "backend\server.py")) {
        $projDir = $scriptDir
    } elseif (Test-Path (Join-Path $targetDir "backend\server.py")) {
        $projDir = $targetDir
    } else {
        $projDir = $desktopPath
    }

    $serverPy = Join-Path $projDir "backend\server.py"

    # 2. Port 8080 Kontrolü (Arka plan servisi çalışıyor mu?)
    $isPortOpen = $false
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $asyncResult = $client.BeginConnect('127.0.0.1', 8080, $null, $null)
        $wait = $asyncResult.AsyncWaitHandle.WaitOne(800, $false)
        if ($wait -and $client.Connected) {
            $isPortOpen = $true
            $client.EndConnect($asyncResult)
        }
        $client.Close()
    } catch {
        $isPortOpen = $false
    }

    # 3. Servis çalışmıyorsa arka planda gizli başlat
    if (-not $isPortOpen -and (Test-Path $serverPy)) {
        Start-Process -FilePath "python" -ArgumentList "`"$serverPy`"" -WorkingDirectory $projDir -WindowStyle Hidden
        Start-Sleep -Seconds 2
    }

    # 4. Kiosk Tarayıcısını Başlat
    $edge1 = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
    $edge2 = "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
    $chrome1 = "C:\Program Files\Google\Chrome\Application\chrome.exe"
    $chrome2 = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

    $kioskUrl = "http://localhost:8080"

    if (Test-Path $edge2) {
        Start-Process -FilePath $edge2 -ArgumentList "--kiosk `"$kioskUrl`" --edge-kiosk-type=fullscreen --no-first-run --disable-pinch"
    } elseif (Test-Path $edge1) {
        Start-Process -FilePath $edge1 -ArgumentList "--kiosk `"$kioskUrl`" --edge-kiosk-type=fullscreen --no-first-run --disable-pinch"
    } elseif (Test-Path $chrome1) {
        Start-Process -FilePath $chrome1 -ArgumentList "--kiosk `"$kioskUrl`" --disable-pinch --no-first-run"
    } elseif (Test-Path $chrome2) {
        Start-Process -FilePath $chrome2 -ArgumentList "--kiosk `"$kioskUrl`" --disable-pinch --no-first-run"
    } else {
        Start-Process -FilePath $kioskUrl
    }

} catch {
    # Sessizce devam et veya hata logla
}
exit 0
