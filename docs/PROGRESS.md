# nervbox - Projektstatus

**Stand:** 2025-12-17

---

## Projekt-Zusammenfassung

**nervbox** ist ein Soundboard-System für Raspberry Pi mit Web-Interface. Es besteht aus:

- **Backend** (.NET 8, SQLite, SignalR) - Sound-Wiedergabe auf Pi, API, Auth
- **Player** (Angular 21) - Web-UI zum Sounds abspielen, Chat, Stats
- **Mixer** (Angular 20) - Audio-Editor zum Erstellen von Remixes

---

## Abgeschlossene Phasen

### Phase 1: Backend Migration
- PostgreSQL → SQLite migriert
- TTS-Feature entfernt
- Tags-System implementiert (statt Kategorien)
- JWT-Auth auf 14 Tage
- Lokale Sound-Wiedergabe (mpg123)

### Phase 2: Player UI (Angular 21)
- Komplett neu entwickelt (standalone components, signals)
- Sound-Grid mit Suche und Tag-Filter
- Login/Register mit JWT
- Chat (SignalR)
- Stats (Top Sounds/Users)
- Activity Bar (wer spielt was)
- Dark Theme (Purple/Pink)

### Phase 3: Mixer LAN-Integration
- Sound-Datenmodell: API-Sounds → SoundLibraryItem Mapping
- Upload-Service mit Tag-Auswahl
- Export-Dialog erweitert
- Environment-Konfiguration (Public vs LAN Mode)

### Phase 4: Build & Deployment
- `deploy.sh` - Deployment auf Pi
- `start-dev.sh` - Lokaler Dev-Server
- HTTPS mit Let's Encrypt (nervbox.sgeht.net)
- nftables Port-Redirect (80→8080, 443→8443)
- Altes Angular 8 Frontend entfernt

### Zusätzliche Features
- **Tag-Verwaltung**: CRUD für Tags und Sounds (Admin)
- **Audio Effects**: Tuna.js Integration im Mixer (Echo, Pitch)

---

## Offene Ideen (für später)

### Credit-System (Phase 5)
- Credits für Abspielvorgänge (Admins ausgenommen)
- Minispiele um Credits aufzufüllen (Arkanoid, etc.)
- Credit-Regeneration

### Custom Avatare
- Upload und Zuschneiden
- Im Chat und bei Remixes/Sounds anzeigen

---

## Architektur

```
/home/joerg/projects/nervbox/
├── nervbox/                      # Haupt-Repository
│   ├── NervboxDeamon/            # .NET 8 Backend
│   ├── nervbox-player/           # Angular 21 Player UI
│   ├── docs/                     # Diese Dokumentation
│   ├── deploy.sh                 # Deployment Script
│   └── start-dev.sh              # Dev Server Script
└── nervbox-mixer/                # Separates Repo (Audio-Editor)
```

### URLs (Production)

| URL | Beschreibung |
|-----|--------------|
| https://nervbox.sgeht.net/ | Player |
| https://nervbox.sgeht.net/mixer/ | Mixer |
| https://nervbox.sgeht.net/api/ | API |

---

## Befehle

```bash
# Entwicklung
./start-dev.sh start    # Backend + Player + Mixer starten
./start-dev.sh stop     # Alles stoppen

# Deployment
./deploy.sh             # Normal
./deploy.sh --force-db  # DB überschreiben
```

---

## Weitere Dokumentation

| Datei | Inhalt |
|-------|--------|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Pi-Setup, HTTPS, Troubleshooting |
| [todo.md](todo.md) | Offene Ideen |
| [../CLAUDE.md](../CLAUDE.md) | Claude Code Anweisungen |
