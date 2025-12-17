#!/bin/bash
# Nervbox - Einmaliges Setup auf Raspberry Pi
# Dieses Script wird auf dem Pi ausgefuehrt

set -e

echo "=== Nervbox Pi Setup ==="
echo ""

# Konfiguration
APP_PATH="/opt/nervbox"
DATA_PATH="/opt/nervbox-data"
LOG_PATH="/var/log/nervbox"
SERVICE_USER="$USER"

# Farben
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Root-Check
if [ "$EUID" -ne 0 ]; then
    echo "Bitte als root ausfuehren: sudo ./setup-pi.sh"
    exit 1
fi

echo "1. System aktualisieren..."
apt-get update
apt-get upgrade -y
print_status "System aktualisiert"

echo ""
echo "2. Dependencies installieren..."
apt-get install -y mpg123 rsync nftables
print_status "mpg123, rsync und nftables installiert"

echo ""
echo "3. Verzeichnisse erstellen..."
mkdir -p "$APP_PATH"
mkdir -p "$DATA_PATH/sounds"
mkdir -p "$LOG_PATH"

# Berechtigungen setzen
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_PATH"
chown -R "$SERVICE_USER:$SERVICE_USER" "$DATA_PATH"
chown -R "$SERVICE_USER:$SERVICE_USER" "$LOG_PATH"

print_status "Verzeichnisse erstellt"
echo "  - $APP_PATH"
echo "  - $DATA_PATH"
echo "  - $LOG_PATH"

echo ""
echo "4. Systemd Service installieren..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/nervbox.service" ]; then
    cp "$SCRIPT_DIR/nervbox.service" /etc/systemd/system/

    # User in Service-File ersetzen
    sed -i "s/User=user/User=$SERVICE_USER/" /etc/systemd/system/nervbox.service

    systemctl daemon-reload
    systemctl enable nervbox
    print_status "Systemd Service installiert und aktiviert"
else
    print_warning "nervbox.service nicht gefunden - manuell kopieren!"
fi

echo ""
echo "5. Port-Redirect einrichten (80 -> 8080, 443 -> 8443)..."
# .NET self-contained Apps koennen nicht mit setcap auf Port < 1024 binden
# Loesung: Kestrel auf 8080/8443, nftables leitet um

# nftables Regeln erstellen
nft add table ip nat 2>/dev/null || true
nft add chain ip nat prerouting { type nat hook prerouting priority -100 \; } 2>/dev/null || true
nft add rule ip nat prerouting tcp dport 80 redirect to :8080 2>/dev/null || true
nft add rule ip nat prerouting tcp dport 443 redirect to :8443 2>/dev/null || true

# Regeln persistent speichern
nft list ruleset > /etc/nftables.conf
systemctl enable nftables
systemctl restart nftables

print_status "Port-Redirect 80 -> 8080, 443 -> 8443 eingerichtet"

echo ""
echo "6. Audio-Setup pruefen..."
# Pruefen ob Audio-Ausgabe verfuegbar ist
if aplay -l &>/dev/null; then
    print_status "Audio-Hardware gefunden"
    # Audio-Gruppe hinzufuegen falls nicht vorhanden
    usermod -a -G audio "$SERVICE_USER" 2>/dev/null || true
else
    print_warning "Keine Audio-Hardware gefunden"
fi

echo ""
echo "=== Setup abgeschlossen ==="
echo ""
echo "Naechste Schritte:"
echo "  1. Deployment von Dev-PC aus starten: ./deploy.sh"
echo "  2. Service Status pruefen: sudo systemctl status nervbox"
echo "  3. Logs ansehen: journalctl -u nervbox -f"
echo ""
echo "Verzeichnisse:"
echo "  App:   $APP_PATH"
echo "  Daten: $DATA_PATH"
echo "  Logs:  $LOG_PATH"
echo ""
echo "Port-Konfiguration:"
echo "  HTTP:  Port 80  -> 8080 (Kestrel)"
echo "  HTTPS: Port 443 -> 8443 (Kestrel)"
echo ""
echo "Fuer HTTPS: Siehe docs/DEPLOYMENT.md (Let's Encrypt Setup)"
