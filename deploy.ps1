#Requires -Version 7
<#
.SYNOPSIS
    Nervbox Deployment - baut Backend, Mixer und Player und deployed auf den Raspberry Pi.

.DESCRIPTION
    Nutzt nur Windows-Bordmittel (ssh.exe, scp.exe, tar.exe) - kein WSL, kein Git Bash.
    Login per SSH-Key (PI_SSH_KEY in deploy.conf).
    Die Uebertragung ueberschreibt Dateien auf dem Pi, loescht dort aber nichts.

.EXAMPLE
    .\deploy.ps1
    .\deploy.ps1 -ForceDb
    .\deploy.ps1 -ForceSounds
    .\deploy.ps1 -ForceInstruments
    .\deploy.ps1 -SkipBuild        # nur uebertragen (vorhandenes Release/)
#>
[CmdletBinding()]
param(
    [switch]$ForceDb,
    [switch]$ForceSounds,
    [switch]$ForceInstruments,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
Set-Location $ScriptDir

# ============================================
# Ausgabe-Helfer
# ============================================
function Write-Header([string]$Text) { Write-Host ""; Write-Host "=== $Text ===" -ForegroundColor Blue }
function Write-Ok([string]$Text)     { Write-Host "[OK] " -ForegroundColor Green -NoNewline; Write-Host $Text }
function Write-Warn([string]$Text)   { Write-Host "[WARN] " -ForegroundColor Yellow -NoNewline; Write-Host $Text }
function Write-Err([string]$Text)    { Write-Host "[ERROR] " -ForegroundColor Red -NoNewline; Write-Host $Text }

# Externes Programm ausfuehren, bei Fehler abbrechen
function Invoke-Native {
    param([string]$Exe, [string[]]$Arguments)
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Exe $($Arguments -join ' ') fehlgeschlagen (Exit $LASTEXITCODE)" }
}

# ============================================
# Konfiguration laden (deploy.conf, KEY="value"-Format)
# ============================================
$ConfFile = Join-Path $ScriptDir 'deploy.conf'
if (-not (Test-Path $ConfFile)) {
    Write-Err "deploy.conf nicht gefunden! Vorlage: deploy.conf.example"
    exit 1
}
$Conf = @{}
foreach ($line in Get-Content $ConfFile) {
    if ($line -match '^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$') {
        $Conf[$Matches[1]] = $Matches[2] -replace '\$HOME|\$\{HOME\}|^~', $env:USERPROFILE
    }
}
foreach ($key in 'PI_HOST', 'PI_USER', 'PI_SSH_KEY', 'PI_APP_PATH', 'PI_DATA_PATH') {
    if (-not $Conf[$key]) { Write-Err "$key fehlt in deploy.conf"; exit 1 }
}
$PiHost     = $Conf.PI_HOST
$PiUser     = $Conf.PI_USER
$PiKey      = [IO.Path]::GetFullPath($Conf.PI_SSH_KEY)
$PiAppPath  = $Conf.PI_APP_PATH
$PiDataPath = $Conf.PI_DATA_PATH
$PiTarget   = "$PiUser@$PiHost"
$SshOpts    = @('-i', $PiKey, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=10')

$ReleasePath     = Join-Path $ScriptDir 'Release'
$SoundsPath      = [IO.Path]::GetFullPath((Join-Path $ScriptDir ($Conf.LOCAL_SOUNDS_PATH ?? '../sounds')))
$InstrumentsPath = [IO.Path]::GetFullPath((Join-Path $ScriptDir '../instruments'))
$MixerPath       = [IO.Path]::GetFullPath((Join-Path $ScriptDir '../nervbox-mixer'))
$PlayerPath      = Join-Path $ScriptDir 'nervbox-player'

# ============================================
# SSH-Helfer
# ============================================
function Invoke-Pi([string]$Command) {
    & ssh.exe @SshOpts $PiTarget $Command
    if ($LASTEXITCODE -ne 0) { throw "SSH-Befehl fehlgeschlagen: $Command" }
}

function Get-PiOutput([string]$Command) {
    $out = & ssh.exe @SshOpts $PiTarget $Command
    return ($out -join "`n").Trim()
}

# Verzeichnis-Inhalt als tar.gz packen, auf den Pi kopieren und dort entpacken.
# Excludes: Pfade relativ zum Quellverzeichnis, verankert (z.B. 'linux-arm64').
function Send-Directory {
    param([string]$Source, [string]$Dest, [string[]]$Exclude = @())
    $archive = Join-Path $env:TEMP "nervbox-deploy-$(Get-Random).tgz"
    try {
        $tarArgs = @('-C', $Source, '-czf', $archive)
        foreach ($e in $Exclude) { $tarArgs += @('--exclude', "^$e") }
        $tarArgs += '.'
        Invoke-Native tar.exe $tarArgs
        $sizeMb = [math]::Round((Get-Item $archive).Length / 1MB, 1)
        Write-Host "  $sizeMb MB -> ${PiHost}:$Dest"
        $remoteArchive = "/tmp/$(Split-Path $archive -Leaf)"
        Invoke-Native scp.exe ($SshOpts + @('-q', $archive, "${PiTarget}:$remoteArchive"))
        Invoke-Pi "mkdir -p '$Dest' && tar -C '$Dest' -xzf '$remoteArchive' --no-same-owner; rc=`$?; rm -f '$remoteArchive'; exit `$rc"
    }
    finally {
        Remove-Item $archive -ErrorAction SilentlyContinue
    }
}

function Send-File([string]$Source, [string]$DestDir) {
    Invoke-Native scp.exe ($SshOpts + @('-q', $Source, "${PiTarget}:$DestDir/"))
}

function Confirm-Ja([string]$Question) {
    return (Read-Host "$Question (ja/nein)") -eq 'ja'
}

# ============================================
# Start
# ============================================
Write-Host @'

  _   _                 _
 | \ | | ___ _ ____   _| |__   _____  __
 |  \| |/ _ \ '__\ \ / / '_ \ / _ \ \/ /
 | |\  |  __/ |   \ V /| |_) | (_) >  <
 |_| \_|\___|_|    \_/ |_.__/ \___/_/\_\

'@ -ForegroundColor Blue
Write-Host "Deployment to $PiTarget`n"

# Voraussetzungen
foreach ($tool in 'ssh.exe', 'scp.exe', 'tar.exe', 'dotnet', 'npm') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { Write-Err "$tool nicht gefunden!"; exit 1 }
}
if (-not (Test-Path $PiKey)) { Write-Err "SSH-Key nicht gefunden: $PiKey"; exit 1 }
& ssh.exe @SshOpts $PiTarget 'true'
if ($LASTEXITCODE -ne 0) { Write-Err "SSH-Login auf $PiTarget mit Key $PiKey fehlgeschlagen!"; exit 1 }
Write-Ok "SSH-Verbindung zu $PiTarget"

if (-not $SkipBuild) {
    # ============================================
    # 1. CLEAN BUILD - Backend
    # ============================================
    Write-Header "1/6 Backend Build (Clean)"

    # Wichtige Dateien sichern vor Clean Build
    $backupDir = Join-Path $env:TEMP 'nervbox-deploy-backup'
    New-Item -ItemType Directory -Force $backupDir | Out-Null
    foreach ($f in 'appsettings.Local.json', 'nervbox.db') {
        $p = Join-Path $ReleasePath $f
        if (Test-Path $p) { Copy-Item $p $backupDir -Force }
    }

    Push-Location (Join-Path $ScriptDir 'NervboxDeamon')
    try {
        Invoke-Native dotnet @('clean', '-c', 'Release', '--nologo', '-v', 'q')
        Invoke-Native dotnet @('publish', '-c', 'Release', '-r', 'linux-arm64', '--self-contained', '-o', $ReleasePath, '--nologo')
    }
    finally { Pop-Location }

    # Konfigurationsdateien wiederherstellen
    foreach ($f in 'appsettings.Local.json', 'nervbox.db') {
        $p = Join-Path $backupDir $f
        if (Test-Path $p) { Copy-Item $p $ReleasePath -Force }
    }
    Remove-Item -Recurse -Force $backupDir
    Write-Ok "Backend Build komplett"

    # ============================================
    # 2. CLEAN BUILD - nervbox-mixer
    # ============================================
    Write-Header "2/6 nervbox-mixer Build (Clean)"
    $mixerWww = Join-Path $ReleasePath 'wwwroot/mixer'
    if (Test-Path $MixerPath) {
        Push-Location $MixerPath
        try {
            Remove-Item -Recurse -Force 'dist', '.angular/cache' -ErrorAction SilentlyContinue
            Invoke-Native npm.cmd @('ci', '--no-audit', '--no-fund')
            Invoke-Native npm.cmd @('run', 'build:lan')

            # Instrumente vorher retten, Rest von wwwroot/mixer neu
            $instrWww = Join-Path $mixerWww 'assets/instruments'
            $instrTmp = $null
            if (Test-Path $instrWww) {
                $instrTmp = Join-Path $env:TEMP "nervbox-instruments-$(Get-Random)"
                Move-Item $instrWww $instrTmp
            }
            Remove-Item -Recurse -Force $mixerWww -ErrorAction SilentlyContinue
            New-Item -ItemType Directory -Force $mixerWww | Out-Null
            $dist = if (Test-Path 'dist/nervbox-mixer/browser') { 'dist/nervbox-mixer/browser' } else { 'dist/nervbox-mixer' }
            Copy-Item "$dist/*" $mixerWww -Recurse -Force
            if ($instrTmp) {
                New-Item -ItemType Directory -Force (Split-Path $instrWww) | Out-Null
                Move-Item $instrTmp $instrWww
            }
        }
        finally { Pop-Location }

        # Instrument-Assets: nur lokal vorbereiten (werden nur beim 1. Deployment uebertragen)
        $instrWww = Join-Path $mixerWww 'assets/instruments'
        if (-not (Test-Path $instrWww) -and (Test-Path $InstrumentsPath)) {
            Write-Host "Kopiere Instrument-Assets lokal (einmalig)..."
            New-Item -ItemType Directory -Force $instrWww | Out-Null
            Copy-Item "$InstrumentsPath/*" $instrWww -Recurse -Force
        }
        Write-Ok "nervbox-mixer Build komplett"
    }
    else {
        Write-Warn "nervbox-mixer nicht gefunden ($MixerPath), ueberspringe..."
    }

    # ============================================
    # 3. CLEAN BUILD - nervbox-player
    # ============================================
    Write-Header "3/6 nervbox-player Build (Clean)"
    if (Test-Path $PlayerPath) {
        Push-Location $PlayerPath
        try {
            Remove-Item -Recurse -Force 'dist', '.angular/cache' -ErrorAction SilentlyContinue
            Invoke-Native npm.cmd @('ci', '--no-audit', '--no-fund')
            Invoke-Native npm.cmd @('run', 'build')

            # Player laeuft auf / -> alte Player-Dateien in wwwroot/ loeschen (mixer/ behalten)
            $www = Join-Path $ReleasePath 'wwwroot'
            New-Item -ItemType Directory -Force $www | Out-Null
            Get-ChildItem $www -File | Remove-Item -Force
            $dist = if (Test-Path 'dist/nervbox-player/browser') { 'dist/nervbox-player/browser' } else { 'dist/nervbox-player' }
            Copy-Item "$dist/*" $www -Recurse -Force
        }
        finally { Pop-Location }
        Write-Ok "nervbox-player Build komplett"
    }
    else {
        Write-Warn "nervbox-player nicht gefunden, ueberspringe..."
    }
}
else {
    Write-Warn "Build uebersprungen (-SkipBuild), nutze vorhandenes Release/"
}

# ============================================
# 4. Service stoppen
# ============================================
Write-Header "4/6 Service stoppen"
Invoke-Pi "sudo systemctl stop nervbox 2>/dev/null || true"
Write-Ok "Service gestoppt"

# ============================================
# 5. Dateien uebertragen
# ============================================
Write-Header "5/6 Dateien uebertragen"

# Anwendung (ohne DB, Instrumente und dotnet-Zwischenordner linux-arm64)
Write-Host "Uebertrage Anwendung..."
Send-Directory $ReleasePath $PiAppPath -Exclude @('nervbox.db', 'nervbox.db-shm', 'nervbox.db-wal', 'linux-arm64', 'wwwroot/mixer/assets/instruments')
# Ausfuehrungsrechte setzen (gehen beim Packen unter Windows verloren)
Invoke-Pi "cd '$PiAppPath' && chmod +x NervboxDeamon createdump *.so"
Write-Ok "Anwendung uebertragen"

# Instrumente: nur beim ersten Deployment (oder -ForceInstruments)
$instrLocal = Join-Path $ReleasePath 'wwwroot/mixer/assets/instruments'
$instrExist = Get-PiOutput "test -d $PiAppPath/wwwroot/mixer/assets/instruments && ls -A $PiAppPath/wwwroot/mixer/assets/instruments | head -1"
if (-not $instrExist -or $ForceInstruments) {
    if (Test-Path $instrLocal) {
        if ($instrExist) { Write-Warn "ACHTUNG: Ueberschreibe Instrumente!" } else { Write-Host "Erstes Deployment: Uebertrage Instrumente..." }
        Send-Directory $instrLocal "$PiAppPath/wwwroot/mixer/assets/instruments"
        Write-Ok "Instrumente uebertragen"
    }
}
else {
    Write-Ok "Instrumente bleiben erhalten (-ForceInstruments zum Ueberschreiben)"
}

# Sounds: nur beim ersten Deployment (oder -ForceSounds mit Bestaetigung)
$soundsExist = Get-PiOutput "test -d $PiDataPath/sounds && ls -A $PiDataPath/sounds | head -1"
if (-not $soundsExist) {
    if (Test-Path $SoundsPath) {
        Write-Host "Erstes Deployment: Uebertrage Sounds..."
        Send-Directory $SoundsPath "$PiDataPath/sounds"
        Write-Ok "Sounds uebertragen"
    }
}
elseif ($ForceSounds) {
    Write-Warn "ACHTUNG: Ueberschreibe Live-Sounds!"
    if (Confirm-Ja "Sicher?") {
        Send-Directory $SoundsPath "$PiDataPath/sounds"
        Write-Ok "Sounds ueberschrieben"
    }
    else { Write-Ok "Sounds nicht ueberschrieben" }
}
else {
    Write-Ok "Live-Sounds bleiben erhalten (-ForceSounds zum Ueberschreiben)"
}

# Datenbank: nur beim ersten Deployment (oder -ForceDb mit Bestaetigung)
$dbLocal = Join-Path $ReleasePath 'nervbox.db'
$dbExists = Get-PiOutput "test -f $PiDataPath/nervbox.db && echo yes || echo no"
if ($dbExists -eq 'no') {
    Write-Host "Erstes Deployment: Uebertrage initiale Datenbank..."
    Send-File $dbLocal $PiDataPath
    Write-Ok "Initiale Datenbank uebertragen"
}
elseif ($ForceDb) {
    Write-Warn "ACHTUNG: Ueberschreibe Live-Datenbank!"
    if (Confirm-Ja "Sicher?") {
        Send-File $dbLocal $PiDataPath
        Write-Ok "Datenbank ueberschrieben"
    }
    else { Write-Ok "Datenbank nicht ueberschrieben" }
}
else {
    Write-Ok "Live-Datenbank bleibt erhalten (-ForceDb zum Ueberschreiben)"
}

# ============================================
# 6. Service starten
# ============================================
Write-Header "6/6 Service starten"
Invoke-Pi "sudo systemctl start nervbox"
Start-Sleep -Seconds 2
if ((Get-PiOutput "systemctl is-active nervbox") -eq 'active') {
    Write-Ok "Service laeuft!"
}
else {
    Write-Err "Service nicht gestartet!"
    Write-Host "Logs pruefen mit: ssh -i $PiKey $PiTarget 'journalctl -u nervbox -n 50'"
    exit 1
}

Write-Host ""
Write-Host "=== Deployment erfolgreich! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Nervbox erreichbar unter: https://$PiHost/"
Write-Host ""
Write-Host "Nuetzliche Befehle:"
Write-Host "  Status:  ssh -i $PiKey $PiTarget 'sudo systemctl status nervbox'"
Write-Host "  Logs:    ssh -i $PiKey $PiTarget 'journalctl -u nervbox -f'"
Write-Host "  Restart: ssh -i $PiKey $PiTarget 'sudo systemctl restart nervbox'"
