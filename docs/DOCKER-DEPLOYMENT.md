# Docker Deployment auf Unraid mit Cloudflare Tunnel

Diese Anleitung beschreibt das Deployment von Nervbox als Docker-Container auf einem Unraid-Server mit sicherem Internetzugang via Cloudflare Tunnel.

## Voraussetzungen

- Unraid Server (x86_64)
- Docker auf Unraid aktiviert
- Cloudflare Account (kostenlos)
- Domain bei Cloudflare (Nameserver umgestellt)

## Architektur

```
┌─────────────────────────────────────────────────────────────────┐
│                         INTERNET                                 │
│                    nervbox.sgeht.net                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                    Cloudflare (SSL, DDoS-Schutz)
                              │
                    Cloudflare Tunnel (verschlüsselt)
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      UNRAID SERVER                              │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │   cloudflared       │    │     nervbox         │            │
│  │   (Tunnel Agent)    │───▶│   (Port 8080)       │            │
│  └─────────────────────┘    └─────────────────────┘            │
│                                       │                         │
│                              ┌────────┴────────┐               │
│                              │                  │               │
│                         /data/sounds      /data/nervbox.db     │
└─────────────────────────────────────────────────────────────────┘
```

## Schritt 1: Cloudflare Tunnel erstellen

### 1.1 Im Cloudflare Dashboard

1. Gehe zu **Zero Trust** → **Networks** → **Tunnels**
2. Klicke **Create a tunnel**
3. Wähle **Cloudflared** als Connector
4. Gib einen Namen ein: `nervbox-tunnel`
5. Kopiere den **Tunnel Token** (beginnt mit `eyJ...`)

### 1.2 Public Hostname konfigurieren

1. Im Tunnel, klicke **Configure**
2. Unter **Public Hostnames**, klicke **Add a public hostname**
3. Konfiguriere:
   - **Subdomain**: `nervbox`
   - **Domain**: `sgeht.net` (deine Domain)
   - **Service Type**: `HTTP`
   - **URL**: `nervbox:8080`
4. Speichern

## Schritt 2: Docker auf Unraid einrichten

### 2.1 Verzeichnisse erstellen

Erstelle auf dem Unraid-Server:

```bash
mkdir -p /mnt/user/appdata/nervbox/sounds
mkdir -p /mnt/user/appdata/nervbox/avatars
mkdir -p /mnt/user/appdata/nervbox/logs
```

### 2.2 Datenbank und Sounds vom Raspberry Pi kopieren

```bash
# Auf dem Pi: Daten exportieren
scp pi@RASPBERRY_PI_IP:/opt/nervbox-data/nervbox.db /mnt/user/appdata/nervbox/
scp -r pi@RASPBERRY_PI_IP:/opt/nervbox-data/sounds/* /mnt/user/appdata/nervbox/sounds/
```

### 2.3 docker-compose.yml erstellen

Erstelle `/mnt/user/appdata/nervbox/docker-compose.yml`:

```yaml
services:
  nervbox:
    image: ingel81/nervbox:latest
    container_name: nervbox
    restart: unless-stopped
    environment:
      - ASPNETCORE_ENVIRONMENT=Docker
      - TZ=Europe/Berlin
    volumes:
      - /mnt/user/appdata/nervbox:/data
      - /mnt/user/appdata/nervbox/logs:/var/log/nervbox
    networks:
      - nervbox-network
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:8080/api/sound"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: nervbox-tunnel
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      - TUNNEL_TOKEN=DEIN_TUNNEL_TOKEN_HIER
    networks:
      - nervbox-network
    depends_on:
      nervbox:
        condition: service_healthy

networks:
  nervbox-network:
    driver: bridge
```

**Wichtig:** Ersetze `DEIN_TUNNEL_TOKEN_HIER` mit deinem Cloudflare Tunnel Token!

### 2.4 Container starten

```bash
cd /mnt/user/appdata/nervbox
docker-compose up -d
```

### 2.5 Logs prüfen

```bash
# Nervbox Logs
docker logs nervbox

# Tunnel Logs
docker logs nervbox-tunnel
```

## Schritt 3: Verifizieren

1. Öffne `https://nervbox.sgeht.net` im Browser
2. Der Player sollte laden
3. Login sollte funktionieren
4. Sounds abspielen (im Browser)

## Wichtige Unterschiede zum Pi-Deployment

| Aspekt | Raspberry Pi | Docker/Unraid |
|--------|--------------|---------------|
| **Sound-Wiedergabe** | Lokal via mpg123 | Im Browser (Streaming) |
| **SSL** | Let's Encrypt direkt | Cloudflare terminiert |
| **Port-Forwarding** | 80/443 offen | Keine Ports offen |
| **Update** | `./deploy.sh` | `docker pull && docker-compose up -d` |

## Updates

Wenn ein neues Image verfügbar ist:

```bash
cd /mnt/user/appdata/nervbox
docker-compose pull
docker-compose up -d
```

## Troubleshooting

### Container startet nicht

```bash
# Logs prüfen
docker logs nervbox

# Container-Status
docker ps -a
```

### Tunnel verbindet nicht

1. Prüfe den Token in der `docker-compose.yml`
2. Prüfe die Cloudflare Tunnel-Konfiguration
3. Stelle sicher, dass die Hostname-Konfiguration `nervbox:8080` ist (nicht `localhost`)

### Sounds werden nicht abgespielt

1. Prüfe ob die Sound-Dateien in `/mnt/user/appdata/nervbox/sounds/` liegen
2. Prüfe die Browser-Konsole auf Fehler
3. Stelle sicher, dass der PlaybackMode auf "Browser" steht

### Datenbank-Fehler

```bash
# Berechtigungen prüfen
ls -la /mnt/user/appdata/nervbox/

# SQLite muss schreibbar sein
chmod 644 /mnt/user/appdata/nervbox/nervbox.db
```

## Sicherheit

- **Keine offenen Ports**: Cloudflare Tunnel erfordert keine Port-Weiterleitung
- **SSL/TLS**: Automatisch via Cloudflare
- **DDoS-Schutz**: Inkludiert bei Cloudflare
- **JWT Auth**: 14-Tage Token-Authentifizierung bleibt aktiv
- **IP-Registrierung**: 1 Account pro IP (kann durch Cloudflare-Proxy-IPs beeinflusst werden)

## GitHub Actions (Automatische Builds)

Das Repository enthält einen GitHub Actions Workflow, der bei jedem Push auf `main` automatisch:

1. Das Docker-Image baut
2. Es zu Docker Hub pusht (`ingel81/nervbox:latest`)

### Secrets einrichten

Im GitHub Repository unter **Settings** → **Secrets and variables** → **Actions**:

- `DOCKERHUB_USERNAME`: Dein Docker Hub Username
- `DOCKERHUB_TOKEN`: Ein Docker Hub Access Token (nicht dein Passwort!)

### Docker Hub Access Token erstellen

1. Gehe zu [hub.docker.com](https://hub.docker.com)
2. **Account Settings** → **Security** → **Access Tokens**
3. **New Access Token** erstellen
4. Als Secret in GitHub speichern

## Konfiguration ändern

Die Docker-Konfiguration liegt in `appsettings.Docker.json`:

```json
{
  "AppSettings": {
    "Secret": "CHANGE_THIS_SECRET_IN_PRODUCTION",
    "PlaybackMode": "Browser",
    "DatabasePath": "/data/nervbox.db",
    "SoundPath": "/data/sounds"
  }
}
```

**Wichtig:** Ändere den `Secret` für Produktion zu einem sicheren 32+ Zeichen String!

### Secret in Docker überschreiben

Du kannst das Secret als Environment-Variable überschreiben:

```yaml
environment:
  - AppSettings__Secret=mein_super_geheimes_secret_hier
```

## Backup

### Automatisches Backup (empfohlen)

Erstelle ein Backup-Script `/mnt/user/appdata/nervbox/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/mnt/user/backup/nervbox"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# Datenbank sichern
cp /mnt/user/appdata/nervbox/nervbox.db "$BACKUP_DIR/nervbox_$DATE.db"

# Alte Backups löschen (behalte die letzten 7)
ls -t "$BACKUP_DIR"/nervbox_*.db | tail -n +8 | xargs -r rm
```

Füge das Script zum Unraid Scheduler hinzu (täglich).

## Weiterführende Links

- [Cloudflare Tunnel Dokumentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [Docker Hub: ingel81/nervbox](https://hub.docker.com/r/ingel81/nervbox)
- [GitHub Repository](https://github.com/ingel81/nervbox)
