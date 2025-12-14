# nervbox Integration - Fortschritt

## Status: Phase 1+2 abgeschlossen

**Letzte Aktualisierung:** 2025-12-14 14:40

---

## Git-Status

| Repository | Branch | Letzter Commit |
|------------|--------|----------------|
| `nervbox` | `develop` | `a1a94c6` - feat: Phase 1+2 - Backend SQLite Migration + nervbox-player UI |
| `nervbox-mixer` | `main` | (unverändert) |

**Wichtig:** Alle Entwicklung erfolgt auf dem `develop`-Branch!

### Repository-Struktur

```
/home/joerg/projects/nervbox/
├── nervbox/                      # Haupt-Repository (Backend + Player)
│   ├── NervboxDeamon/            # .NET Backend
│   ├── NervboxUI/                # Alte Angular 8 UI (wird ersetzt)
│   ├── nervbox-player/           # NEU: Angular 21 Player UI
│   ├── PROGRESS.md               # Diese Datei
│   └── PROJEKT-PLAN.md           # Gesamtplan
└── nervbox-mixer/                # Separates Repository (Mixer UI)
```

---

## Phase 0: Shared Sound-Interface definieren

- [x] TypeScript Interface `Sound` als Referenz definiert
- [x] C# DTOs im Backend entsprechend angelegt

---

## Phase 1: Backend migrieren

### SQLite Migration

- [x] NuGet: `Npgsql.EntityFrameworkCore.PostgreSQL` entfernt
- [x] NuGet: `Microsoft.EntityFrameworkCore.Sqlite` hinzugefügt
- [x] Connection String durch konfigurierbaren `DatabasePath` ersetzt
- [x] Migrationen neu erstellt (`InitialSqlite`)

### Datenmodell-Änderungen

| Model | Änderungen |
|-------|------------|
| **Sound** | `Allowed`/`Valid` → `Enabled`, `Size` → `SizeBytes`, `Duration` → `DurationMs`, neu: `Name`, `CreatedAt`, `SoundTags` |
| **Tag** | Neu erstellt (id, name) |
| **SoundTag** | Neu erstellt (n:m Beziehung Sound↔Tag) |
| **User** | `Password` → `PasswordHash`, `RegistrationIp` → `IpAddress`, `Email`/`Role` bereinigt, neu: `CreatedAt` |
| **SoundUsage** | `Time` → `PlayedAt`, `PlayedByUserId` → `UserId`, neuer auto-increment `Id` |
| **ChatMessage** | `Date` → `CreatedAt`, `Type`/`Username` entfernt |

### Entfernte Features

- [x] TTS-Feature komplett entfernt (Controller, Service, Model, Config)
- [x] TimescaleController entfernt (PostgreSQL-spezifisch)

### JWT-Auth

- [x] Token-Laufzeit auf 14 Tage erhöht
- [x] IP-Beschränkung bei Registrierung bleibt erhalten

### Sound-Wiedergabe

- [x] `LocalPlayer` Feld in AppSettings (Standard: "mpg123")
- [x] `PlaySound()` prüft SSH.Enabled, wählt Wiedergabe-Modus
- [x] `KillAll()` unterstützt beide Modi
- [x] Unterstützte lokale Player: mpg123, ffplay, cvlc

**Wiedergabe-Modi:**

| Modus | SSH.Enabled | Verwendung |
|-------|-------------|------------|
| **Lokal** | false | Pi (Produktion) + Entwicklung auf eigenem Rechner |
| **Remote** | true | Backend auf anderem Rechner → Pi via SSH (Fallback) |

**Konfiguration Entwicklung (appsettings.Development.json):**
```json
{
  "AppSettings": {
    "SoundPath": "../../sounds",
    "LocalPlayer": "mpg123",
    "SSH": { "Enabled": false }
  }
}
```

**Konfiguration Produktion auf Pi (appsettings.json):**
```json
{
  "AppSettings": {
    "SoundPath": "/opt/nervbox/sounds",
    "LocalPlayer": "mpg123",
    "SSH": { "Enabled": false }
  }
}
```

### API-Änderungen

| Endpoint | Status |
|----------|--------|
| `GET /api/sounds` | Aktualisiert - gibt jetzt `name`, `durationMs`, `sizeBytes`, `tags`, `enabled`, `createdAt` zurück |
| `GET /api/sound/{hash}/file` | Neu - Sound-Datei herunterladen |
| `POST /api/sound/upload` | Neu - Sound hochladen mit Tags |
| `POST /api/sounds/tts` | Entfernt |
| `GET /api/sound/{id}/play` | Unverändert |
| `GET /api/sounds/killAll` | Unverändert |
| `/api/timescale/*` | Entfernt |

### Build-Status

```
✓ Build erfolgreich
✓ SQLite Migration erstellt
⚠ 3 Warnungen (CamService System.Drawing - Windows-only, kann ignoriert werden)
```

### Konfiguration

**appsettings.json:**
```json
{
  "AppSettings": {
    "DatabasePath": "/opt/nervbox-data/nervbox.db",
    "SoundPath": "/opt/nervbox-data/sounds"
  }
}
```

---

## Phase 2: Neues Player UI (Angular 21)

### Grundstruktur (abgeschlossen)

- [x] Neues Angular 21 Projekt erstellen (`nervbox-player`)
- [x] Angular Material 21 + SignalR installiert
- [x] ESLint + Prettier Konfiguration (vom Mixer übernommen)
- [x] Dark Theme mit Purple/Pink Akzenten (nervbox-mixer Design)
- [x] Globale Styles inkl. Material Overrides

### Models & Services (abgeschlossen)

- [x] Sound, User, Chat Models definiert
- [x] API Service (HttpClient Wrapper)
- [x] Auth Service (JWT, Signals)
- [x] Sound Service (Sounds laden, abspielen, Stats)
- [x] JWT Interceptor

### UI-Komponenten (in Arbeit)

- [x] Toolbar (Logo, Suche, Action Buttons)
- [x] Sound Grid (responsives Karten-Raster)
- [x] Sound Card (kompakte Anzeige mit Play Button)
- [x] Tag Filter (Chips zum Filtern)
- [x] Activity Bar (zeigt wer spielt was)
- [x] Stats Dialog (Top Sounds/Users mit Tabs)
- [x] Chat Sidebar (SignalR, permanent rechts auf Desktop)
- [x] Login Dialog (mit Enter-Support, Browser-Credentials)
- [x] Register Dialog (mit IP-Hinweis)

### Alle Features implementiert

- [x] SignalR Real-time Updates für Activity Bar

### Build-Status

```
✓ Build erfolgreich (519 kB initial bundle)
⚠ Budget-Warnung (überschreitet 500 kB um 20 kB)
```

### Projektstruktur

```
nervbox-player/
├── src/app/
│   ├── core/
│   │   ├── models/         # Sound, User, Chat interfaces
│   │   ├── services/       # API, Auth, Sound services
│   │   └── interceptors/   # JWT interceptor
│   ├── components/
│   │   ├── toolbar/        # Header toolbar
│   │   ├── sound-grid/     # Sound list + cards
│   │   ├── tag-filter/     # Tag chips
│   │   ├── chat-widget/    # (TODO)
│   │   ├── stats-popup/    # (TODO)
│   │   └── auth/           # (TODO)
│   └── shared/
│       └── pipes/          # Duration pipe
├── src/environments/       # Dev + Prod config
└── CLAUDE.md              # Claude Code instructions
```

---

## Phase 3: Mixer LAN-Integration

- [ ] Sound-Datenmodell migrieren (`SoundLibraryItem` → `Sound`)
- [ ] Environment-Konfiguration für nervboxApi
- [ ] SoundLibraryService: API-Modus
- [ ] Export-Dialog erweitern (Upload + Tag-Auswahl)
- [ ] Upload-Service implementieren

---

## Phase 4: Build & Deployment

- [ ] Build-Script: `npm run build:lan`
- [ ] Build-Script: Player UI für wwwroot
- [ ] Build-Script: Mixer UI für wwwroot/mixer
- [ ] Deploy-Script für Raspberry Pi
- [ ] Setup-Dokumentation aktualisieren

---

## Phase 5: Credit-System (optional)

- [ ] Credits-Tabelle im DB-Schema
- [ ] Credit-Regeneration
- [ ] Kosten pro Sound-Abspielen
- [ ] Mini-Games für Credit-Gewinn
- [ ] UI für Credit-Anzeige

---

## Geänderte Dateien (Phase 1)

### Modifiziert
- `NervboxDeamon.csproj` - SQLite statt PostgreSQL
- `appsettings.json` - DatabasePath, TTSPath entfernt
- `appsettings.Development.json` - SQLite, TTSPath entfernt
- `NervboxDBContext.cs` - Tags DbSets, OnModelCreating
- `Startup.cs` - UseSqlite, TimescaleDB-Code entfernt
- `DbModels/Sound.cs` - Neues Schema
- `DbModels/User.cs` - Neues Schema
- `DbModels/SoundUsage.cs` - Neues Schema
- `DbModels/ChatMessage.cs` - Neues Schema
- `Models/Settings/AppSettings.cs` - DatabasePath, TTSPath entfernt, LocalPlayer hinzugefügt
- `Services/UserService.cs` - Neue Feldnamen
- `Services/SoundService.cs` - TTS entfernt, neue Feldnamen, lokale Wiedergabe
- `Controllers/SoundController.cs` - TTS-Endpoint entfernt, neue Response
- `Controllers/Base/ChatController.cs` - Neue Feldnamen
- `Hubs/ChatHub.cs` - TTS entfernt, neue Feldnamen

### Neu erstellt
- `DbModels/Tag.cs`
- `DbModels/SoundTag.cs`
- `Migrations/*_InitialSqlite.cs`

### Gelöscht
- `Models/View/TTSModel.cs`
- `Controllers/TimescaleController.cs`
- `Migrations/` (alte PostgreSQL-Migrationen)
