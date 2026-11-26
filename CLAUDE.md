# CLAUDE.md

## Projekt

**Nervbox** - Soundboard-System für Raspberry Pi mit Web-Interface.

## Repos & Struktur

```
parent/
├── nervbox/                    ← DIESES REPO
│   ├── NervboxDeamon/          # .NET 8 Backend
│   │   ├── Controllers/        # API Controller
│   │   ├── Services/           # Business Logic
│   │   ├── Hubs/               # SignalR Hubs
│   │   └── Models/             # EF Core Entities
│   ├── nervbox-player/         # Angular 21 Player
│   │   └── src/app/
│   │       ├── components/     # UI Components
│   │       └── core/services/  # API, Auth, SignalR
│   ├── Release/                # Build Output
│   ├── pi-setup/               # Pi Deployment Setup
│   ├── docs/                   # Dokumentation
│   ├── deploy.ps1 / .bat       # Deployment auf den Pi (Windows)
│   └── start-dev.ps1 / .bat    # Lokaler Dev-Server (Windows)
│
├── nervbox-mixer/              ← SEPARATES REPO (github.com/ingel81/nervbox-mixer)
└── sounds/                     ← Nicht versioniert (~235MB, 658 MP3s)
```

## Dokumentation

| Datei | Inhalt |
|-------|--------|
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Pi Deployment Anleitung |
| [docs/PROGRESS.md](docs/PROGRESS.md) | Entwicklungsfortschritt |
| [docs/todo.md](docs/todo.md) | Offene Ideen |
| [nervbox-player/CLAUDE.md](nervbox-player/CLAUDE.md) | Player-spezifische Infos |

## Tech Stack

| Teil | Stack |
|------|-------|
| Backend | .NET 8, ASP.NET Core, EF Core, SQLite, SignalR |
| Player | Angular 21, Standalone, Signals, Material |
| Mixer | Angular 20, Standalone (separates Repo) |
| Pi Audio | mpg123 |
| Auth | JWT (14 Tage) |

## Backend API

```
GET  /api/sound                    # Alle Sounds
GET  /api/sound/{hash}/play        # Sound abspielen (Pi lokal)
GET  /api/sound/{hash}/file        # Sound-Datei streamen (Browser)
GET  /api/sound/statistics/*       # Top Sounds/Users
POST /api/users/auth/login         # Login → JWT
POST /api/users/auth/register      # Register (1x pro IP)
GET  /api/tag                      # Alle Tags
GET  /api/chat                     # Chat Historie

SignalR Hubs:
  /ws/soundHub                     # Sound Events (Play, Stop)
  /ws/chatHub                      # Chat Messages
```

## Befehle

```powershell
# Entwicklung (Windows, PowerShell 7 - kein WSL/Git Bash nötig)
.\start-dev.ps1 start            # Alles starten (Backend:8080, Player:4200, Mixer:4201), Strg+C stoppt
.\start-dev.ps1 start -NoLogs    # Im Hintergrund
.\start-dev.ps1 stop             # Stoppen (nur eigene Prozesse)
.\start-dev.ps1 status           # Status prüfen

# Deployment auf den Pi (192.168.0.188)
.\deploy.ps1                     # Normal (DB+Sounds nur beim 1. Mal)
.\deploy.ps1 -ForceDb            # DB überschreiben (Bestätigung)
.\deploy.ps1 -ForceSounds        # Sounds überschreiben (Bestätigung)
.\deploy.ps1 -SkipBuild          # Nur übertragen

# Backend einzeln
cd NervboxDeamon; dotnet run
```

Lokal spielt der Sound im **Browser** (`PlaybackMode: Browser` in `appsettings.Development.json`), auf dem Pi lokal via mpg123.

## Deployment (Raspberry Pi)

| Setting | Wert |
|---------|------|
| Target | Pi 4/5, arm64, Debian |
| Port | 80 (extern) → 8080 (Kestrel intern, via nftables) |
| App | `/opt/nervbox` |
| Daten | `/opt/nervbox-data` (DB + Sounds) |
| Logs | `/var/log/nervbox` |
| Service | `systemctl {start|stop|status} nervbox` |

**Port-Architektur:** .NET self-contained Apps können nicht mit `setcap` auf Port < 1024 binden. Lösung: Kestrel auf 8080, nftables leitet 80 → 8080 um.

## URLs (Production)

```
http://PI_IP/           # Player
http://PI_IP/mixer/     # Mixer
http://PI_IP/api/       # API
```

## Gitignored (Secrets)

- `deploy.conf` - Pi Credentials
- `appsettings.Local.json` - Giphy API Keys
- `Release/nervbox.db` - Lokale DB

## Wichtig

- **DB + Sounds dürfen niemals verloren gehen.** Sie werden nur beim ersten Deployment übertragen; Deploy löscht nichts auf dem Pi. Vor riskanten Schritten Backup (siehe docs/DEPLOYMENT.md)
- Lokale, nicht versionierte Notizen: `CLAUDE.local.md`
- **Mixer** muss als Sibling-Repo ausgecheckt sein (`../nervbox-mixer`)
- **Player** läuft auf `/`, **Mixer** auf `/mixer/`
- **Environment**: `environment.prod.ts` nutzt relative URLs (`/api`)
