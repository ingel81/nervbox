# nervbox - Projektstatus

**Stand:** 2026-11-28

---

## Projekt-Zusammenfassung

**nervbox** ist ein Soundboard-System für Raspberry Pi mit Web-Interface. Es besteht aus:

- **Backend** (.NET 11, SQLite, SignalR) - Sound-Wiedergabe auf Pi, API, Auth
- **Player** (Angular 22) - Web-UI zum Sounds abspielen, Chat, Stats
- **Mixer** (Angular 22) - Audio-Editor zum Erstellen von Remixes

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
- `deploy.sh` - Deployment auf Pi (seit 2026-11-26 ersetzt durch `deploy.ps1`)
- `start-dev.sh` - Lokaler Dev-Server (seit 2026-11-26 ersetzt durch `start-dev.ps1`)
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

### Phase 7: Docker Deployment für Unraid (2026-01-05) - IN PROGRESS

**Ziel:** nervbox als Docker-Container auf Unraid-Server betreiben, erreichbar via nervbox.sgeht.net

#### Architektur
```
Internet → Cloudflare (SSL, DDoS) → Cloudflare Tunnel → Unraid Docker → nervbox:8080
```

#### Erstellte Dateien
| Datei | Beschreibung |
|-------|--------------|
| `Dockerfile` | Multi-stage Build (Backend + Player + Mixer) |
| `docker-compose.yml` | Container-Setup mit Cloudflare Tunnel |
| `.github/workflows/docker-build.yml` | GitHub Actions für automatische Builds zu Docker Hub |
| `.dockerignore` | Optimierter Build-Context |
| `appsettings.Docker.json` | Docker-spezifische Konfiguration (PlaybackMode: Browser) |
| `.env.example` | Vorlage für Cloudflare Tunnel Token |
| `docs/DOCKER-DEPLOYMENT.md` | Ausführliche Deployment-Anleitung |

#### Code-Änderungen
| Datei | Änderung |
|-------|----------|
| `AppSettings.cs` | Neues `PlaybackMode` Enum (Local/Browser) |
| `SoundService.cs` | Browser-Modus überspringt lokales mpg123 |
| `ConfigController.cs` | Neuer Endpoint `/api/config` für Client-Konfiguration |
| `config.service.ts` | Frontend-Service lädt PlaybackMode |
| `sound.service.ts` | Spielt Sound im Browser wenn PlaybackMode=Browser |
| `app.ts` | Lädt ConfigService beim App-Start |

#### Wichtige Unterschiede Pi vs Docker
| Aspekt | Raspberry Pi | Docker/Unraid |
|--------|--------------|---------------|
| Sound-Wiedergabe | Lokal via mpg123 | Im Browser (Streaming) |
| SSL | Let's Encrypt direkt | Cloudflare terminiert |
| Port-Forwarding | 80/443 offen | Keine Ports offen (Tunnel) |
| Update | `.\deploy.ps1` | `docker pull && docker-compose up -d` |

#### Offene Schritte
- [ ] GitHub Secrets einrichten (DOCKERHUB_USERNAME, DOCKERHUB_TOKEN)
- [ ] Code committen und pushen
- [ ] Cloudflare Tunnel erstellen
- [ ] DB + Sounds vom Pi auf Unraid kopieren
- [ ] Docker-Container auf Unraid starten
- [ ] DNS umstellen (nervbox.sgeht.net → Cloudflare Tunnel)

---

### Phase 8: Umzug auf Windows-Entwicklung (2026-11-26)
- Entwicklung von Arch-Linux auf Windows umgezogen (`D:Source
ervbox`)
- `deploy.ps1` / `start-dev.ps1` (+ `.bat`-Wrapper) ersetzen die Bash-Skripte – nur Windows-Bordmittel (ssh, scp, tar)
- Deploy per SSH-Key statt Passwort, tar.gz-Übertragung, keine Löschungen auf dem Pi
- Lokal: `PlaybackMode=Browser` in `appsettings.Development.json`
- `start-dev.ps1` prüft freie Ports und beendet nur eigene Prozesse
- Erstes Deploy getestet: DB + 703 Sounds unverändert (Prüfsummen), Backup `/opt/backup-20261126`

#### Offen
- [x] Alles aktualisiert (2026-11-26): .NET 8 → 11, EF Core 11, Angular 21/20 → 22 (Player + Mixer), Mixer auf esbuild-Builder, Pi-OS full-upgrade, SSH.NET 2026
- [x] TLS-Zertifikat erneuert (2026-11-26), automatische Erneuerung via certbot dns-cloudflare
- [x] `SSH.NET` auf 2026.0.1 aktualisiert

---

### Phase 9: Nervbox 2026 – „Nachtschicht“ (Branch `2026`, 26.–28.11.2026)

Jubiläumsedition „30 Jahre CABD“. Alles auf Branch `2026` (gepusht nach `origin/2026`, **Merge nach
`master` erst nach der LAN**), live auf dem Pi. Letzter Stand: `6881a3b`.

#### Oberfläche (Player)
- **Nachtschicht-Redesign** (`644d894`): Gerät um 3 Uhr nachts – Deck mit LCD, Tag-Schiene, Pad-Platte,
  Bondrucker-Chat, Kanalzüge; Nacht-Kit `src/styles/nacht/` (`nk-*`), alle Dialoge neu, Mobil-Leiste ≤ 768 px.
  Details: [nervbox-player/CLAUDE.md](../nervbox-player/CLAUDE.md).
- **NowPlaying**: laufende Sounds auf Pads und Kanälen (grün = eigene, eisblau = fremde), echte Zählung,
  bis 32 Stimmen; Zufall, Nochmal, NEU-Etikett.
- **Schnelltasten 1–9** (`a1f8048`): Pad-Menü „Auf Taste legen“, pro Benutzer im Browser (localStorage).
- **Pads** lösen mit der Maus beim Drücken aus, Touch beim Loslassen; ruhiges Scrollen am Handy.
- **Live-Steuerung**: Pad halten (160 ms) und ziehen – X = Tempo/Tonhöhe, Y = Filter, Schütteln = Wobble.
- **3D-Intro** bei jedem Laden: Gerät fällt auf den Schreibtisch, synthetischer Aufprall-Sound, nahtloser
  Übergang in die echte Oberfläche. **2D/3D-Umschalter** (Deck-Taste „3D“, nur Desktop) mit Maus-Parallaxe.
  - **Einschalt-Taste** (`6881a3b`): sperrt der Browser Ton ohne Klick, wartet „NERVBOX EINSCHALTEN“ –
    so kommt der Aufprall-Sound sicher.
  - Safari/iOS (WebKit): flaches Einblenden, keine 3D-Ansicht (Projektion weicht dort ab; erst auf echtem
    Apple-Gerät prüfen). Schwache Geräte / kein WebGL: flach. `prefers-reduced-motion`: kein Intro.
  - Willkommens-Tour startet erst nach dem Intro.
- **Update-Hinweis** (`02eafd0`): nach einem Deploy „Neue Version verfügbar → Neu laden“.
- **Avatar-Kürzel** nur aus dem Benutzernamen (`shared/user-initials.ts`): überall gleich, echte Namen bleiben verborgen.
- **Toolbar** passt von 1024 bis 1440 px (Logo verschwindet unter 1240 px).
- Spielhalle: gemeinsamer Spielrahmen, alle Spiele passen in den Bildschirm, Escape fragt nach;
  neu: **Hotdog-Greifer, Rubbellos, Roulette** (serverseitig entschieden) und **LAN-Pong** (Mehrspieler über SignalR).
- PWA (installierbar, Favicon), Lazy Loading (Startbundle 2,24 → 1,12 MB).

#### Audio (Backend + Browser)
- **Software-Mixer** (`LocalPlayer=mixer`, auf dem Pi aktiv): eine aplay-Ausgabe statt 8-Stimmen-Grenze,
  Limiter, Stopp pro Sound, echte Pegel; Effekte pro Klick (Pitch, Rückwärts, Echo, Hall, Telefon) – gleich
  im Browser-Modus (Web Audio).
- **Lautheits-Angleichung**: jeder Sound einmal gemessen (`loudness.json`), zu laute werden leiser
  (Dateien bleiben unverändert); Admin-Menü an/aus.
- **Sprachausgabe (Piper)**: nur Admin-Test, Dienst `nervbox-tts`.

#### Backend / Sicherheit
- Passwort-Hashes und IPs nicht mehr in `/api/users` und der Register-Antwort (`3b82b91`).
- Kompression, Caching (Bundles immutable, index no-cache), Range-Requests für Sounds, SQLite WAL,
  sauberer Shutdown ≤ 3 s, SignalR-WebSockets mit Token.
- Guthaben-Änderungen serialisiert (keine Doppelbuchungen bei parallelen Käufen); Admin-Konto nicht in Ranglisten.

#### Betrieb
- DB-Backup nur bei Schritten, die die DB verändern können (siehe [DEPLOYMENT.md](DEPLOYMENT.md)).
- Getestete Browser: Chrome, Firefox (Intro, 3D, Klicks ok), WebKit/Safari mit flachem Fallback.

#### Offen
- [ ] Wirtschafts-Umstellung Schekel → Holz („THE PURGE“) vor der LAN (26.12.): Umrechnung, Einkommen nur
      online, Spielhalle beschleunigt, Ausdünnen der Credit-Buchungen – **vorher DB-Backup**.
- [ ] Online-Anzeige und Countdown zur nächsten Auszahlung im LCD (Backend liefert die Daten noch nicht).
- [ ] Safari/iPhone: 3D auf echtem Gerät prüfen, dann Fallback ggf. entfernen.
- [ ] LAN 26.–30.12.: DNS-IP von `nervbox.sgeht.net` auf die Party-IP, danach zurück.
- [ ] Nach der LAN: `2026` nach `master` mergen.

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
│   ├── NervboxDeamon/            # .NET 11 Backend
│   ├── nervbox-player/           # Angular 22 Player UI
│   ├── docs/                     # Diese Dokumentation
│   ├── deploy.ps1                # Deployment Script (Windows)
│   └── start-dev.ps1             # Dev Server Script (Windows)
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
./start-dev.ps1 start   # Backend + Player + Mixer starten
./start-dev.ps1 stop    # Alles stoppen

# Deployment
./deploy.ps1            # Normal
./deploy.ps1 -ForceDb   # DB überschreiben
```

---

## Weitere Dokumentation

| Datei | Inhalt |
|-------|--------|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Pi-Setup, HTTPS, Troubleshooting |
| [todo.md](todo.md) | Offene Ideen |
| [../CLAUDE.md](../CLAUDE.md) | Claude Code Anweisungen |
