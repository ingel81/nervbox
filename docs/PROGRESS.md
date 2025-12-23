# nervbox - Projektstatus

**Stand:** 2025-12-23

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

### Phase 5: Mixer Instrument-Tab (2025-12-22)
- **Dual Sound Browser** im LAN-Modus:
  - Tab "Nervbox": Sounds von der API (dynamisch, mit Tags, Votes, Favoriten)
  - Tab "Instrumente": Lokale statische Sounds (Bass, Drums, Synth)
- **Instrument-Library** (`instrument-library.ts`):
  - 222 Sounds (8 Bass, 191 Drums, 23 Synth)
  - FX-Kategorie bewusst ausgeschlossen (kommt von Nervbox API)
- **Assets-Konfiguration**:
  - Instrumente unter `/assets/instruments/` (getrennt von Nervbox-Sounds)
  - Deploy-Script kopiert aus `../instruments/` Ordner
- **UI-Anpassungen**:
  - Tab-Toggle mit Icons + Text (Nervbox/Instrumente)
  - Kategorie-Dropdown für Instrumente (All/Bass/Drums/Synth)
  - Gestyled passend zum Dark Theme

### Phase 6: Player Erweiterungen
- **Admin Panel**: Verwaltung von Tags, Sounds
- **Avatar System**: Upload und Cropping von Benutzeravataren
- **Mini-Games**: Spiele zum Aufladen von Credits
- **Welcome Tour**: Shepherd.js Guided Tour für neue Benutzer
- **Achievement System**: Backend-Infrastruktur für Achievements
- **Credit System**: N$-Währung für Soundabspielungen
- **Favorites/Voting**: Sounds favorisieren und bewerten

### Zusätzliche Features
- **Tag-Verwaltung**: CRUD für Tags und Sounds (Admin)
- **Audio Effects**: Tuna.js Integration im Mixer (Echo, Pitch)
- **Mixer Effects Panel**: UI für Audio-Effekte
- **Grid Controls**: Snap-to-Grid Funktionalität im Mixer

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
