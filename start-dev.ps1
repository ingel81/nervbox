#Requires -Version 7
<#
.SYNOPSIS
    Nervbox Dev-Setup: startet Backend, Player und Mixer lokal unter Windows.

.DESCRIPTION
    Backend (Kestrel) ist der Einstiegspunkt und leitet / an den Player-Dev-Server
    und /mixer an den Mixer-Dev-Server weiter.
    Sound-Wiedergabe laeuft im Browser (PlaybackMode=Browser in appsettings.Development.json).

.EXAMPLE
    .\start-dev.ps1 start          # Alles starten, Live-Logs, Strg+C beendet alles
    .\start-dev.ps1 start -NoLogs  # Alles starten, im Hintergrund weiterlaufen lassen
    .\start-dev.ps1 stop
    .\start-dev.ps1 status
    .\start-dev.ps1 logs
    .\start-dev.ps1 restart
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('start', 'stop', 'status', 'logs', 'restart')]
    [string]$Action = 'start',
    [switch]$NoLogs
)

$ErrorActionPreference = 'Stop'

# ============================================
# Konfiguration
# ============================================
# Eigener Port-Block fuer Nervbox-Dev (kollidiert nicht mit 3000/4200/5000/8080 usw.)
$Ports = [ordered]@{ Backend = 4710; Player = 4711; Mixer = 4712 }

$ScriptDir  = $PSScriptRoot
$BackendDir = Join-Path $ScriptDir 'NervboxDeamon'
$ReleaseDir = Join-Path $ScriptDir 'Release'
$PlayerDir  = Join-Path $ScriptDir 'nervbox-player'
$MixerDir   = [IO.Path]::GetFullPath((Join-Path $ScriptDir '../nervbox-mixer'))
$LogDir     = Join-Path $env:TEMP 'nervbox-dev'
$PidFile    = Join-Path $LogDir 'pids.json'
$Logs       = [ordered]@{
    Backend = Join-Path $LogDir 'backend.log'
    Player  = Join-Path $LogDir 'player.log'
    Mixer   = Join-Path $LogDir 'mixer.log'
}
$LogStyle = @{
    Backend = @{ Tag = '[BACK]'; Color = 'Green' }
    Player  = @{ Tag = '[PLAY]'; Color = 'Cyan' }
    Mixer   = @{ Tag = '[MIX] '; Color = 'Magenta' }
}

# ============================================
# Helfer
# ============================================
function Get-PortProcessIds([int]$Port) {
    Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        Where-Object { $_ -ne 0 }
}

function Get-CommandLine([int]$ProcessId) {
    (Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue).CommandLine
}

# Eigener Prozess = Kommandozeile enthaelt "nervbox" (Pfad oder NervboxDeamon.dll)
function Test-OwnProcess([int]$ProcessId) {
    (Get-CommandLine $ProcessId) -match 'nervbox'
}

function Stop-ProcessTree([int]$ProcessId) {
    & taskkill.exe /F /T /PID $ProcessId *> $null
    return ($LASTEXITCODE -eq 0)
}

# Startet einen Befehl versteckt via cmd.exe, stdout+stderr ins Logfile. Gibt den Prozess zurueck.
function Start-Logged([string]$WorkDir, [string]$Command, [string]$LogFile) {
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "$Command > `"$LogFile`" 2>&1" `
        -WorkingDirectory $WorkDir -WindowStyle Hidden -PassThru
}

function Test-PortsFree {
    $busy = $false
    foreach ($name in $Ports.Keys) {
        foreach ($procId in Get-PortProcessIds $Ports[$name]) {
            $cmd = Get-CommandLine $procId
            $shortCmd = if ($cmd) { $cmd.Substring(0, [Math]::Min(120, $cmd.Length)) } else { '?' }
            Write-Host "Port $($Ports[$name]) ($name) belegt durch PID ${procId}: $shortCmd" -ForegroundColor Red
            $busy = $true
        }
    }
    return -not $busy
}

function Wait-Port([int]$Port, [int]$TimeoutSec, [System.Diagnostics.Process]$Process) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Get-PortProcessIds $Port) { return $true }
        if ($Process -and $Process.HasExited) { return $false }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

# ============================================
# Aktionen
# ============================================
function Start-Dev {
    Write-Host "=== nervbox Dev-Setup starten ===" -ForegroundColor Yellow

    if (Test-Path $PidFile) {
        Write-Host "nervbox laeuft bereits (oder unsauber beendet)! Erst stoppen: .\start-dev.ps1 stop" -ForegroundColor Red
        exit 1
    }
    if (-not (Test-PortsFree)) {
        Write-Host "Abbruch. Eigene Reste beenden mit: .\start-dev.ps1 stop" -ForegroundColor Red
        exit 1
    }

    New-Item -ItemType Directory -Force $LogDir | Out-Null
    foreach ($f in $Logs.Values) { Set-Content -Path $f -Value $null }

    # node_modules bei Bedarf installieren
    foreach ($dir in $PlayerDir, $MixerDir) {
        if (-not (Test-Path (Join-Path $dir 'node_modules'))) {
            Write-Host "Installiere npm-Pakete in $dir ..." -ForegroundColor Green
            Push-Location $dir
            try { & npm.cmd ci --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw "npm ci fehlgeschlagen in $dir" } }
            finally { Pop-Location }
        }
    }

    # Backend bauen (Debug, nach Release/ wie bisher)
    Write-Host "Baue Backend..." -ForegroundColor Green
    & dotnet build $BackendDir -o $ReleaseDir -c Debug --nologo -v q
    if ($LASTEXITCODE -ne 0) { Write-Host "Backend Build fehlgeschlagen!" -ForegroundColor Red; exit 1 }

    Write-Host "Starte Player (Port $($Ports.Player))..." -ForegroundColor Green
    $player = Start-Logged $PlayerDir "npx ng serve --port $($Ports.Player) --host 0.0.0.0 --allowed-hosts=all" $Logs.Player

    Write-Host "Starte Mixer (Port $($Ports.Mixer))..." -ForegroundColor Green
    $mixer = Start-Logged $MixerDir "npx ng serve --port $($Ports.Mixer) --host 0.0.0.0 --allowed-hosts=all --configuration lan --serve-path /mixer" $Logs.Mixer

    Write-Host "Starte Backend (Port $($Ports.Backend))..." -ForegroundColor Green
    $env:ASPNETCORE_ENVIRONMENT = 'Development'
    $env:Kestrel__Endpoints__Http__Url = "http://0.0.0.0:$($Ports.Backend)"
    $env:DevProxy__PlayerUrl = "http://localhost:$($Ports.Player)"
    $env:DevProxy__MixerUrl = "http://localhost:$($Ports.Mixer)"
    try {
        $backend = Start-Logged $ReleaseDir 'dotnet NervboxDeamon.dll' $Logs.Backend
    }
    finally {
        Remove-Item Env:ASPNETCORE_ENVIRONMENT, Env:Kestrel__Endpoints__Http__Url, Env:DevProxy__PlayerUrl, Env:DevProxy__MixerUrl -ErrorAction SilentlyContinue
    }

    @{ Backend = $backend.Id; Player = $player.Id; Mixer = $mixer.Id } | ConvertTo-Json | Set-Content $PidFile

    # Warten bis alles lauscht
    $ok = $true
    foreach ($item in @(@('Backend', $backend, 60), @('Player', $player, 180), @('Mixer', $mixer, 180))) {
        $name, $proc, $timeout = $item
        Write-Host "  warte auf $name (Port $($Ports[$name]))... " -NoNewline
        if (Wait-Port $Ports[$name] $timeout $proc) { Write-Host "bereit" -ForegroundColor Green }
        else {
            Write-Host "FEHLER - siehe $($Logs[$name])" -ForegroundColor Red
            Get-Content $Logs[$name] -Tail 15 | ForEach-Object { Write-Host "    $_" }
            $ok = $false
        }
    }
    if (-not $ok) { Stop-Dev; exit 1 }

    Write-Host ""
    Write-Host "Nervbox:  http://localhost:$($Ports.Backend)/        (Player via Backend)" -ForegroundColor Green
    Write-Host "Mixer:    http://localhost:$($Ports.Backend)/mixer/" -ForegroundColor Green
    Write-Host "Logs:     $LogDir"
    Write-Host ""

    if ($NoLogs) {
        Write-Host "Laeuft im Hintergrund. Stoppen: .\start-dev.ps1 stop" -ForegroundColor Cyan
        return
    }

    Write-Host "Strg+C beendet alle Services" -ForegroundColor Cyan
    Write-Host "=== Live Logs ===" -ForegroundColor Yellow
    try {
        Show-Logs -StopWhenExited @($backend, $player, $mixer)
    }
    finally {
        Write-Host ""
        Write-Host "=== Beende alle Services ===" -ForegroundColor Yellow
        Stop-Dev
    }
}

function Stop-Dev {
    Write-Host "=== nervbox Dev-Setup stoppen ===" -ForegroundColor Yellow

    # 1. Gestartete Prozessbaeume (cmd.exe -> node/dotnet) beenden
    if (Test-Path $PidFile) {
        $pids = Get-Content $PidFile -Raw | ConvertFrom-Json
        foreach ($name in 'Backend', 'Player', 'Mixer') {
            $procId = $pids.$name
            if ($procId -and (Get-Process -Id $procId -ErrorAction SilentlyContinue)) {
                if (Stop-ProcessTree $procId) { Write-Host "  $name (PID $procId) beendet" }
            }
        }
        Remove-Item $PidFile -Force
    }

    # 2. Reste auf den Dev-Ports - aber nur eigene Prozesse
    foreach ($name in $Ports.Keys) {
        foreach ($procId in Get-PortProcessIds $Ports[$name]) {
            if (Test-OwnProcess $procId) {
                if (Stop-ProcessTree $procId) { Write-Host "  Port $($Ports[$name]): Rest-Prozess $procId beendet" }
            }
            else {
                Write-Host "  Port $($Ports[$name]): fremder Prozess $procId - nicht angefasst" -ForegroundColor Yellow
            }
        }
    }
    Write-Host "Gestoppt!" -ForegroundColor Green
}

function Show-Status {
    Write-Host "=== nervbox Status ===" -ForegroundColor Yellow
    foreach ($name in $Ports.Keys) {
        $port = $Ports[$name]
        $procIds = @(Get-PortProcessIds $port)
        $label = '{0,-8}({1}): ' -f $name, $port
        if ($procIds.Count -eq 0) { Write-Host "$label" -NoNewline; Write-Host 'STOPPED' -ForegroundColor Red }
        elseif (Test-OwnProcess $procIds[0]) { Write-Host "$label" -NoNewline; Write-Host "RUNNING (PID $($procIds -join ','))" -ForegroundColor Green }
        else { Write-Host "$label" -NoNewline; Write-Host "BELEGT durch fremden Prozess (PID $($procIds -join ','))" -ForegroundColor Yellow }
    }
    Write-Host "Logs: $LogDir"
}

# Mehrere Logfiles gleichzeitig verfolgen (wie tail -f), farbig mit Prefix
function Show-Logs([System.Diagnostics.Process[]]$StopWhenExited = @()) {
    $readers = [ordered]@{}
    foreach ($name in $Logs.Keys) {
        if (-not (Test-Path $Logs[$name])) { New-Item -ItemType File -Force $Logs[$name] | Out-Null }
        $fs = [IO.FileStream]::new($Logs[$name], 'Open', 'Read', 'ReadWrite, Delete')
        $readers[$name] = [IO.StreamReader]::new($fs)
    }
    try {
        while ($true) {
            $any = $false
            foreach ($name in $readers.Keys) {
                while ($null -ne ($line = $readers[$name].ReadLine())) {
                    Write-Host "$($LogStyle[$name].Tag) " -ForegroundColor $LogStyle[$name].Color -NoNewline
                    Write-Host $line
                    $any = $true
                }
            }
            if ($StopWhenExited.Count -gt 0 -and ($StopWhenExited | Where-Object { $_.HasExited })) {
                Write-Host "Ein Service wurde beendet." -ForegroundColor Red
                return
            }
            if (-not $any) { Start-Sleep -Milliseconds 300 }
        }
    }
    finally {
        foreach ($r in $readers.Values) { $r.Dispose() }
    }
}

switch ($Action) {
    'start'   { Start-Dev }
    'stop'    { Stop-Dev }
    'status'  { Show-Status }
    'logs'    { Write-Host "Strg+C zum Beenden (Services laufen weiter)" -ForegroundColor Yellow; Show-Logs }
    'restart' { Stop-Dev; Start-Sleep -Seconds 2; Start-Dev }
}
