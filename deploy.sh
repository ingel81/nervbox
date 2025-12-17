#!/bin/bash
# Nervbox Deployment Script
# Baut und deployed die Nervbox Anwendung auf den Raspberry Pi

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Farben
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Konfiguration laden
if [ -f "deploy.conf" ]; then
    source deploy.conf
else
    echo -e "${RED}[ERROR]${NC} deploy.conf nicht gefunden!"
    exit 1
fi

# Funktionen
print_header() {
    echo ""
    echo -e "${BLUE}=== $1 ===${NC}"
}

print_status() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Pruefen ob sshpass installiert ist
check_dependencies() {
    if ! command -v sshpass &> /dev/null; then
        print_warning "sshpass nicht installiert. Installiere..."
        sudo pacman -S sshpass --noconfirm 2>/dev/null || sudo apt-get install -y sshpass 2>/dev/null
    fi
}

# SSH-Befehl auf Pi ausfuehren
ssh_cmd() {
    sshpass -p "$PI_PASS" ssh -o StrictHostKeyChecking=no "$PI_USER@$PI_HOST" "$1"
}

# Dateien zum Pi kopieren
rsync_to_pi() {
    sshpass -p "$PI_PASS" rsync -avz --progress -e "ssh -o StrictHostKeyChecking=no" "$1" "$PI_USER@$PI_HOST:$2"
}

echo -e "${BLUE}"
echo "  _   _                 _               "
echo " | \ | | ___ _ ____   _| |__   _____  __"
echo " |  \| |/ _ \ '__\ \ / / '_ \ / _ \ \/ /"
echo " | |\  |  __/ |   \ V /| |_) | (_) >  < "
echo " |_| \_|\___|_|    \_/ |_.__/ \___/_/\_\\"
echo -e "${NC}"
echo "Deployment to $PI_HOST"
echo ""

check_dependencies

# ============================================
# 1. CLEAN BUILD - Backend
# ============================================
print_header "1/6 Backend Build (Clean)"

RELEASE_PATH="$SCRIPT_DIR/Release"
TEMP_DIR="/tmp/nervbox-deploy-backup"

# Wichtige Dateien sichern vor Clean Build
echo "Sichere Konfigurationsdateien..."
mkdir -p "$TEMP_DIR"
[ -f "$RELEASE_PATH/appsettings.Local.json" ] && cp "$RELEASE_PATH/appsettings.Local.json" "$TEMP_DIR/"
[ -f "$RELEASE_PATH/nervbox.db" ] && cp "$RELEASE_PATH/nervbox.db" "$TEMP_DIR/"

cd "$SCRIPT_DIR/NervboxDeamon"

# Dotnet clean und publish
dotnet clean -c Release
dotnet publish -c Release -r linux-arm64 --self-contained -o "$RELEASE_PATH"

# Konfigurationsdateien wiederherstellen
echo "Stelle Konfigurationsdateien wieder her..."
[ -f "$TEMP_DIR/appsettings.Local.json" ] && cp "$TEMP_DIR/appsettings.Local.json" "$RELEASE_PATH/"
[ -f "$TEMP_DIR/nervbox.db" ] && cp "$TEMP_DIR/nervbox.db" "$RELEASE_PATH/"
rm -rf "$TEMP_DIR"

print_status "Backend Build komplett"

# ============================================
# 2. CLEAN BUILD - nervbox-mixer
# ============================================
print_header "2/6 nervbox-mixer Build (Clean)"

MIXER_PATH="$SCRIPT_DIR/../nervbox-mixer"
if [ -d "$MIXER_PATH" ]; then
    cd "$MIXER_PATH"

    # Clean build mit LAN-Konfiguration (baseHref: /mixer/)
    rm -rf dist .angular/cache
    npm ci
    npm run build:lan

    # Nach wwwroot/mixer kopieren
    rm -rf "$RELEASE_PATH/wwwroot/mixer"
    mkdir -p "$RELEASE_PATH/wwwroot/mixer"
    if [ -d "dist/nervbox-mixer/browser" ]; then
        cp -r dist/nervbox-mixer/browser/* "$RELEASE_PATH/wwwroot/mixer/"
    else
        cp -r dist/nervbox-mixer/* "$RELEASE_PATH/wwwroot/mixer/"
    fi

    print_status "nervbox-mixer Build komplett"
else
    print_warning "nervbox-mixer nicht gefunden, ueberspringe..."
fi

# ============================================
# 3. CLEAN BUILD - nervbox-player
# ============================================
print_header "3/6 nervbox-player Build (Clean)"

PLAYER_PATH="$SCRIPT_DIR/nervbox-player"
if [ -d "$PLAYER_PATH" ]; then
    cd "$PLAYER_PATH"

    # Clean build
    rm -rf dist .angular/cache
    npm ci
    npm run build

    # Nach wwwroot/ kopieren (Player laeuft auf /, nicht /player)
    # Alte Player-Dateien loeschen (aber mixer/ behalten)
    find "$RELEASE_PATH/wwwroot" -maxdepth 1 -type f -delete 2>/dev/null || true
    mkdir -p "$RELEASE_PATH/wwwroot"
    if [ -d "dist/nervbox-player/browser" ]; then
        cp -r dist/nervbox-player/browser/* "$RELEASE_PATH/wwwroot/"
    else
        cp -r dist/nervbox-player/* "$RELEASE_PATH/wwwroot/"
    fi

    print_status "nervbox-player Build komplett"
else
    print_warning "nervbox-player nicht gefunden, ueberspringe..."
fi

cd "$SCRIPT_DIR"

# ============================================
# 4. Service stoppen
# ============================================
print_header "4/6 Service stoppen"

ssh_cmd "sudo systemctl stop nervbox 2>/dev/null || true"
print_status "Service gestoppt"

# ============================================
# 5. Dateien uebertragen
# ============================================
print_header "5/6 Dateien uebertragen"

# Anwendung uebertragen (ohne DB - die liegt in /opt/nervbox-data)
echo "Uebertrage Anwendung..."
sshpass -p "$PI_PASS" rsync -avz --progress --exclude='nervbox.db' -e "ssh -o StrictHostKeyChecking=no" "$RELEASE_PATH/" "$PI_USER@$PI_HOST:$PI_APP_PATH/"

# Sounds: NUR beim ersten Deployment!
# Live-Sounds werden NIEMALS ueberschrieben (ausser mit --force-sounds)
SOUNDS_EXIST=$(ssh_cmd "test -d $PI_DATA_PATH/sounds && ls -A $PI_DATA_PATH/sounds | head -1")
if [ -z "$SOUNDS_EXIST" ]; then
    if [ -d "$SCRIPT_DIR/$LOCAL_SOUNDS_PATH" ]; then
        echo "Erstes Deployment: Uebertrage Sounds..."
        rsync_to_pi "$SCRIPT_DIR/$LOCAL_SOUNDS_PATH/" "$PI_DATA_PATH/sounds/"
        print_status "Sounds uebertragen"
    fi
elif [ "$1" == "--force-sounds" ]; then
    print_warning "ACHTUNG: Ueberschreibe Live-Sounds!"
    read -p "Sicher? (ja/nein): " confirm
    if [ "$confirm" == "ja" ]; then
        rsync_to_pi "$SCRIPT_DIR/$LOCAL_SOUNDS_PATH/" "$PI_DATA_PATH/sounds/"
        print_status "Sounds ueberschrieben"
    else
        print_status "Sounds nicht ueberschrieben"
    fi
else
    print_status "Live-Sounds bleiben erhalten (--force-sounds zum Ueberschreiben)"
fi

# Datenbank: NUR beim ersten Deployment!
# Live-Daten werden NIEMALS ueberschrieben (ausser mit --force-db)
DB_EXISTS=$(ssh_cmd "test -f $PI_DATA_PATH/nervbox.db && echo yes || echo no")
if [ "$DB_EXISTS" == "no" ]; then
    echo "Erstes Deployment: Uebertrage initiale Datenbank..."
    sshpass -p "$PI_PASS" scp -o StrictHostKeyChecking=no "$RELEASE_PATH/nervbox.db" "$PI_USER@$PI_HOST:$PI_DATA_PATH/"
    print_status "Initiale Datenbank uebertragen"
elif [ "$1" == "--force-db" ]; then
    print_warning "ACHTUNG: Ueberschreibe Live-Datenbank!"
    read -p "Sicher? (ja/nein): " confirm
    if [ "$confirm" == "ja" ]; then
        sshpass -p "$PI_PASS" scp -o StrictHostKeyChecking=no "$RELEASE_PATH/nervbox.db" "$PI_USER@$PI_HOST:$PI_DATA_PATH/"
        print_status "Datenbank ueberschrieben"
    else
        print_status "Datenbank nicht ueberschrieben"
    fi
else
    print_status "Live-Datenbank bleibt erhalten (--force-db zum Ueberschreiben)"
fi

print_status "Dateien uebertragen"

# ============================================
# 6. Service starten
# ============================================
print_header "6/6 Service starten"

# Service starten (Port 80 wird via nftables auf 8080 umgeleitet)
ssh_cmd "sudo systemctl start nervbox"

# Kurz warten und Status pruefen
sleep 2
if ssh_cmd "systemctl is-active nervbox" | grep -q "active"; then
    print_status "Service laeuft!"
else
    print_error "Service nicht gestartet!"
    echo "Logs pruefen mit: ssh $PI_USER@$PI_HOST 'journalctl -u nervbox -n 50'"
    exit 1
fi

# ============================================
# Fertig
# ============================================
echo ""
echo -e "${GREEN}=== Deployment erfolgreich! ===${NC}"
echo ""
echo "Nervbox erreichbar unter: http://$PI_HOST/"
echo ""
echo "Nuetzliche Befehle:"
echo "  Status:  ssh $PI_USER@$PI_HOST 'sudo systemctl status nervbox'"
echo "  Logs:    ssh $PI_USER@$PI_HOST 'journalctl -u nervbox -f'"
echo "  Restart: ssh $PI_USER@$PI_HOST 'sudo systemctl restart nervbox'"
