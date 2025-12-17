# Nervbox Deployment

## Voraussetzungen

```
parent-folder/
├── nervbox/          ← Dieses Repo
├── nervbox-mixer/    ← Muss parallel ausgecheckt sein
└── sounds/           ← Sound-Dateien (nicht im Repo)
```

## Dateien

```
deploy.conf         # Konfiguration (IP, User, Passwort) - gitignored
deploy.conf.example # Vorlage
deploy.sh           # Deployment-Script
start-dev.sh        # Lokaler Dev-Server
pi-setup/
  setup-pi.sh       # Einmaliges Pi-Setup
  nervbox.service   # Systemd Service
```

## Erstmaliges Pi-Setup

```bash
scp -r pi-setup user@<PI_IP>:/tmp/
ssh user@<PI_IP> "chmod +x /tmp/pi-setup/setup-pi.sh && sudo /tmp/pi-setup/setup-pi.sh"
```

Das Setup-Script:
- Installiert mpg123 (Audio-Wiedergabe)
- Erstellt Verzeichnisse (`/opt/nervbox`, `/opt/nervbox-data`)
- Installiert systemd Service
- Richtet nftables Port-Redirect ein (80 → 8080, 443 → 8443)

## Deployment

```bash
./deploy.sh                # Normal (DB + Sounds nur beim 1. Mal)
./deploy.sh --force-db     # DB überschreiben (mit Bestätigung)
./deploy.sh --force-sounds # Sounds überschreiben (mit Bestätigung)
```

## Konfiguration

`deploy.conf` (kopieren von `deploy.conf.example`):
```bash
PI_HOST="192.168.0.188"
PI_USER="user"
PI_PASS="<DEIN_PASSWORT>"
```

## Architektur

```
┌───────────────────────────────────────────────┐
│              Raspberry Pi                      │
├───────────────────────────────────────────────┤
│  Port 80  ──► nftables ──► Port 8080 (HTTP)   │
│  Port 443 ──► nftables ──► Port 8443 (HTTPS)  │
│                                    │           │
│                    ┌───────────────▼────────┐  │
│                    │     NervboxDeamon      │  │
│                    │  Kestrel :8080 + :8443 │  │
│                    └────────────────────────┘  │
└───────────────────────────────────────────────┘
```

**Warum Port 8080/8443?**
- .NET self-contained Apps können nicht mit `setcap` auf Port < 1024 binden
- Lösung: Kestrel auf 8080/8443, nftables leitet um

## Verzeichnisse auf dem Pi

| Pfad | Inhalt |
|------|--------|
| `/opt/nervbox/` | Anwendung (wird bei jedem Deploy überschrieben) |
| `/opt/nervbox-data/` | Persistente Daten (DB + Sounds) |
| `/var/log/nervbox/` | Log-Dateien |
| `/etc/letsencrypt/` | SSL-Zertifikate |

---

## HTTPS Setup (Let's Encrypt)

HTTPS wird benötigt für das **Recording-Feature** im Mixer (`navigator.mediaDevices` erfordert secure context).

### Voraussetzungen
- Domain mit A-Record auf die Pi-IP (z.B. `nervbox.sgeht.net → 192.168.0.188`)
- DNS-Zugang für TXT-Record (für Zertifikat-Erneuerung)

### Aktuelles Setup
- **Domain:** `nervbox.sgeht.net`
- **DNS:** all-inkl (A-Record zeigt auf LAN-IP)
- **Zertifikat:** Let's Encrypt mit DNS-01 Challenge (manuell)

### Erstmaliges Zertifikat erstellen

```bash
# Auf dem Pi:
sudo apt install certbot
sudo certbot certonly --manual --preferred-challenges dns -d nervbox.sgeht.net
```

Certbot zeigt einen TXT-Record-Wert an:
```
_acme-challenge.nervbox.sgeht.net → [angezeigter Wert]
```

→ Bei all-inkl KAS: DNS → TXT-Record anlegen → Enter drücken

### Zertifikat-Berechtigungen

```bash
# privkey muss lesbar sein für nervbox user
sudo chmod 644 /etc/letsencrypt/archive/nervbox.sgeht.net/privkey1.pem
sudo chmod 755 /etc/letsencrypt/live
sudo chmod 755 /etc/letsencrypt/archive
```

### nftables HTTPS Redirect

```bash
sudo nft add rule ip nat prerouting tcp dport 443 redirect to :8443
sudo nft list ruleset | sudo tee /etc/nftables.conf
```

### Kestrel Konfiguration

In `appsettings.json`:
```json
{
  "Kestrel": {
    "Endpoints": {
      "Http": {
        "Url": "http://0.0.0.0:8080"
      },
      "Https": {
        "Url": "https://0.0.0.0:8443",
        "Certificate": {
          "Path": "/etc/letsencrypt/live/nervbox.sgeht.net/fullchain.pem",
          "KeyPath": "/etc/letsencrypt/live/nervbox.sgeht.net/privkey.pem"
        }
      }
    }
  }
}
```

### Zertifikat erneuern (alle 90 Tage)

```bash
ssh user@192.168.0.188

# Erneuerung starten
sudo certbot renew --manual --preferred-challenges dns

# Certbot zeigt neuen TXT-Record-Wert
# → Bei all-inkl: _acme-challenge.nervbox.sgeht.net TXT-Record aktualisieren
# → Warten bis DNS propagiert (1-2 Min)
# → Enter drücken

# Berechtigungen für neues Zertifikat setzen
sudo chmod 644 /etc/letsencrypt/archive/nervbox.sgeht.net/privkey*.pem

# Service neu starten
sudo systemctl restart nervbox
```

**Tipp:** Kalender-Erinnerung setzen für ~80 Tage nach Erstellung.

### Zertifikat prüfen

```bash
# Ablaufdatum anzeigen
sudo certbot certificates

# HTTPS testen
curl -I https://nervbox.sgeht.net/
```

---

## HTTP → HTTPS Redirect

In Production werden alle HTTP-Anfragen automatisch auf HTTPS umgeleitet (308 Permanent Redirect).

```
http://nervbox.sgeht.net/  →  https://nervbox.sgeht.net/
```

Konfiguriert in `Startup.cs`:
- `AddHttpsRedirection()` mit Port 443
- `UseHttpsRedirection()` nur in Production (nicht Development)

---

## URLs

| URL | Beschreibung |
|-----|--------------|
| `https://nervbox.sgeht.net/` | Player (HTTPS) |
| `https://nervbox.sgeht.net/mixer/` | Mixer mit Recording (HTTPS) |
| `https://nervbox.sgeht.net/api/sound` | API |
| `http://nervbox.sgeht.net/` | Redirect zu HTTPS |

---

## Pi Befehle

```bash
# Service
sudo systemctl status nervbox
sudo systemctl restart nervbox
journalctl -u nervbox -f

# Port-Redirect prüfen
sudo nft list ruleset

# Manueller Test
curl http://localhost:8080/api/sound
curl https://localhost:8443/api/sound --insecure

# Zertifikat-Status
sudo certbot certificates
```

---

## Troubleshooting

### Service startet nicht
```bash
journalctl -u nervbox -n 50 --no-pager
```

### HTTPS funktioniert nicht

```bash
# Prüfen ob Port 8443 lauscht
ss -tlnp | grep 8443

# Prüfen ob nftables-Regel existiert
sudo nft list ruleset | grep 443

# Zertifikat-Berechtigungen prüfen
ls -la /etc/letsencrypt/archive/nervbox.sgeht.net/
# privkey*.pem muss lesbar sein (644)

# Falls Redirect fehlt:
sudo nft add rule ip nat prerouting tcp dport 443 redirect to :8443
sudo nft list ruleset | sudo tee /etc/nftables.conf
```

### Port 80 funktioniert nicht
```bash
# Prüfen ob nftables-Regel existiert
sudo nft list ruleset | grep "redirect to :8080"

# Falls nicht, manuell hinzufügen:
sudo nft add table ip nat
sudo nft add chain ip nat prerouting { type nat hook prerouting priority -100 \; }
sudo nft add rule ip nat prerouting tcp dport 80 redirect to :8080
sudo nft list ruleset | sudo tee /etc/nftables.conf
```

### API antwortet nicht
```bash
# Prüfen ob Service läuft
systemctl is-active nervbox

# Prüfen ob Ports lauschen
ss -tlnp | grep -E '(8080|8443)'
```
