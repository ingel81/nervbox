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
│   ├── deploy.sh               # Deployment Script
│   └── start-dev.sh            # Dev Server
│
├── nervbox-mixer/              ← SEPARATES REPO (github.com/ingel81/nervbox-mixer)
└── sounds/                     ← Nicht versioniert (~235MB, 658 MP3s)
```

## Dokumentation

| Datei | Inhalt |
|-------|--------|
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Pi Deployment Anleitung |
| [docs/PROJEKT-PLAN.md](docs/PROJEKT-PLAN.md) | Ursprünglicher Projektplan |
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
GET  /api/sound/{hash}/stream      # Sound streamen (Browser)
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

```bash
# Entwicklung
./start-dev.sh start              # Alles starten (Backend:8080, Player:4200, Mixer:4201)
./start-dev.sh stop               # Stoppen
./start-dev.sh status             # Status prüfen

# Deployment
./deploy.sh                       # Normal (DB+Sounds nur beim 1. Mal)
./deploy.sh --force-db            # DB überschreiben
./deploy.sh --force-sounds        # Sounds überschreiben

# Backend einzeln
cd NervboxDeamon && dotnet run

# Player einzeln
cd nervbox-player && npm start
```

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

- **DB + Sounds** werden nur beim ersten Deployment übertragen
- **Mixer** muss als Sibling-Repo ausgecheckt sein (`../nervbox-mixer`)
- **Player** läuft auf `/`, **Mixer** auf `/mixer/`
- **Environment**: `environment.prod.ts` nutzt relative URLs (`/api`)
