# nervbox + nervbox-mixer Integration

## Ziel

Zusammenführung von nervbox (LAN-Party Sound-Player) und nervbox-mixer (Sound-Designer) zu einem integrierten System, wobei der Mixer weiterhin als standalone öffentliches Tool verfügbar bleibt.

---

## Git-Workflow

> **WICHTIG: Alle Entwicklung erfolgt auf dem `develop`-Branch, nie direkt auf `main`!**
>
> Merge nach `main` erfolgt erst nach vollständiger Fertigstellung (evtl. mehrere Monate).

```bash
# Entwicklung starten
git checkout -b develop
git push -u origin develop

# Alle Commits auf develop
git add .
git commit -m "..."
git push

# Nach kompletter Fertigstellung (Monate später)
git checkout main
git merge develop
git push
```

### Repositories (Hybrid-Struktur)

| Repository | Branch | Inhalt |
|------------|--------|--------|
| `nervbox` | `develop` | Backend (.NET 10) + Player UI (Angular 21) |
| `nervbox-mixer` | `develop` | Mixer UI (Angular 21) - eigenständig |

---

## Architektur-Übersicht

```
┌─────────────────────────────────────────────────────────────────┐
│                      Raspberry Pi (LAN)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │   Player UI      │  │    Mixer UI      │  │  C# Backend   │  │
│  │   (Angular 21)   │  │   (Angular 21)   │  │  (.NET 10)    │  │
│  │                  │  │                  │  │               │  │
│  │  /               │  │  /mixer/         │  │  /api/        │  │
│  │                  │  │                  │  │               │  │
│  │  - Sound-Liste   │  │  - Browse        │  │  - Sounds     │  │
│  │  - Suche         │  │  - Arrange       │  │  - Users      │  │
│  │  - Abspielen     │  │  - Export MP3    │  │  - Stats      │  │
│  │  - Top Sounds    │  │  - Upload        │  │  - Chat       │  │
│  │  - Top Users     │  │  - Kategorie     │  │  - Auth       │  │
│  │  - Chat          │  │    wählen        │  │  - SignalR    │  │
│  └──────────────────┘  └──────────────────┘  └───────┬───────┘  │
│                                                       │          │
│            ┌──────────────────────────────────────────┘          │
│            ▼                                                     │
│     ┌─────────────┐      ┌─────────────┐                        │
│     │ nervbox.db  │      │  /sounds/   │──► mpg123 ──► 🔊       │
│     │  (SQLite)   │      │  (Ordner)   │                        │
│     └─────────────┘      └─────────────┘                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────┐
│                    Public (nervbox-mixer.de)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Mixer UI (Angular 21)                  │   │
│  │                                                           │   │
│  │  - Browse lokale /assets/sounds/                          │   │
│  │  - Arrange                                                │   │
│  │  - Export MP3 (Download)                                  │   │
│  │  - Kein Backend, kein Auth                                │   │
│  │  - Arrangements in localStorage                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Entscheidungen

| Aspekt | Entscheidung |
|--------|--------------|
| **Frontend** | Angular 21 |
| **Backend** | .NET 10 (LTS, erscheint Nov 2025) |
| **Datenbank** | SQLite + Entity Framework Core (PostgreSQL entfernen) |
| **Auth** | JWT mit langer Laufzeit (14 Tage), kein Refresh-Token |
| **IP-Beschränkung** | Max. 1 Account pro IP-Adresse |
| **Sound-Klassifikation** | Nur Tags (keine Kategorien) |
| **Player UI Features** | Sound-Liste, Suche, Play, Top Sounds, Top Users, Chat |
| **Mixer Live-Play** | Nein (nur Export + Upload) |
| **Mixer Export** | Tags wählbar beim Upload |
| **Sound-Quelle** | Gemeinsamer Ordner auf Filesystem |
| **Altes Angular 8 UI** | Komplett ersetzen |
| **Public Mixer** | Bleibt 100% standalone ohne Backend |
| **URL-Struktur** | `/` (Player) + `/mixer/` (Mixer) |
| **Deployment** | Direkt auf Raspberry Pi (kein Docker) |
| **TTS-Feature** | Entfernen |
| **Credit-System** | Später (Phase 5+) |

---

## Mixer: Zwei Modi, ein Codebase

Der nervbox-mixer unterstützt zwei Modi basierend auf Environment-Konfiguration:

### Public Mode (nervbox-mixer.de)

```typescript
// environment.ts
export const environment = {
  production: true,
  nervboxApi: null
};
```

| Feature | Verhalten |
|---------|-----------|
| Sounds laden | Aus `/assets/sounds/` (statisch) |
| Export | Download als MP3 |
| Upload | Nicht verfügbar |
| Auth | Keine |
| Arrangements | localStorage |

### LAN Mode (192.168.x.x/mixer)

```typescript
// environment.lan.ts
export const environment = {
  production: true,
  nervboxApi: '/api'
};
```

| Feature | Verhalten |
|---------|-----------|
| Sounds laden | Von nervbox API |
| Export | Download als MP3 |
| Upload | Zu nervbox mit Tag-Auswahl |
| Auth | JWT vom Player (SharedStorage) |
| Arrangements | localStorage |

### Feature-Matrix

| Feature | Public | LAN |
|---------|--------|-----|
| Sound-Browser | ✅ lokal | ✅ API |
| Arrangements bauen | ✅ | ✅ |
| Playback im Browser | ✅ | ✅ |
| Export MP3 | ✅ Download | ✅ Download |
| Upload zu nervbox | ❌ | ✅ |
| Tags wählen | ❌ | ✅ |

---

## Einheitliches Sound-Datenmodell

> **WICHTIG:** Dieses Modell gilt für Backend, Player und Mixer!
>
> **Mixer-Status:** Hat aktuell noch `category` + `tags`. Wird in Phase 3 auf reines Tags-System umgestellt.

### Ziel-Format (Backend + Player sofort, Mixer später)

```typescript
// Gemeinsames Interface für alle Systeme
interface Sound {
  hash: string;           // Primäre ID (SHA256 oder ähnlich)
  name: string;           // Anzeigename (generiert aus filename)
  filename: string;       // Originaler Dateiname
  durationMs: number;     // Länge in Millisekunden
  sizeBytes: number;      // Dateigröße
  tags: string[];         // Tags (ersetzt Kategorien)
  enabled: boolean;       // Darf abgespielt werden
  createdAt: string;      // ISO 8601 Timestamp
}

// Name-Generierung aus Filename
// "drums/Kick 1.wav" → "Kick 1"
// "bass/Moog Bass 2 (C2).wav" → "Moog Bass 2 (C2)"
const generateName = (filename: string): string => {
  return filename
    .split('/').pop()!                    // Pfad entfernen
    .replace(/\.[^.]+$/, '');             // Extension entfernen
};
```

### Aktuelles Mixer-Format (wird migriert)

```typescript
// Mixer JETZT (sound-library.ts)
interface SoundLibraryItem {
  id: string;             // → wird zu hash
  name: string;           // → wird zu filename (oder entfällt)
  category: string;       // → wird zu tags[0]
  filename: string;       // bleibt
  duration?: number;      // → durationMs (Sekunden → Millisekunden)
  tags?: string[];        // bleibt, category wird eingefügt
}
```

### Migration Mixer → Ziel-Format

```typescript
// Konvertierung in Phase 3
const migrateSound = (old: SoundLibraryItem): Sound => ({
  hash: old.id,
  name: old.name,                         // bleibt wie im Mixer
  filename: old.filename.split('/').pop()!,
  durationMs: (old.duration || 0) * 1000,
  sizeBytes: 0,  // wird beim Laden ermittelt
  tags: [old.category.toLowerCase(), ...(old.tags || [])],
  enabled: true,
  createdAt: new Date().toISOString()
});
```

### Verwendung pro System

| System | Quelle | Format |
|--------|--------|--------|
| **Backend API** | SQLite DB | JSON Response |
| **Player UI** | `GET /api/sounds` | JSON Array |
| **Mixer Standalone** | `/assets/sounds.json` | Statisches JSON |
| **Mixer LAN** | `GET /api/sounds` | JSON Array |

### Beispiel: sounds.json (Mixer Standalone)

```json
{
  "sounds": [
    {
      "hash": "a1b2c3d4",
      "name": "Airhorn",
      "filename": "airhorn.mp3",
      "durationMs": 2300,
      "sizeBytes": 45000,
      "tags": ["fx", "loud"],
      "enabled": true,
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Beispiel: API Response (Backend)

```json
GET /api/sounds

[
  {
    "hash": "a1b2c3d4",
    "name": "Airhorn",
    "filename": "airhorn.mp3",
    "durationMs": 2300,
    "sizeBytes": 45000,
    "tags": ["fx", "loud"],
    "enabled": true,
    "createdAt": "2024-01-15T10:30:00Z"
  }
]
```

---

## Dateistruktur auf Raspberry Pi

```
/opt/nervbox/
├── NervboxDeamon/
│   ├── wwwroot/
│   │   ├── index.html              # Player UI (Angular 21)
│   │   ├── main.js
│   │   ├── styles.css
│   │   └── mixer/                  # Mixer UI (Angular 21)
│   │       ├── index.html
│   │       ├── main.js
│   │       └── styles.css
│   ├── appsettings.json
│   └── NervboxDeamon.dll           # .NET 10 Backend
│
├── nervbox.db                      # SQLite Datenbank (kein PostgreSQL!)
│
└── sounds/                         # Flacher Sound-Ordner (Tags statt Kategorien)
    ├── airhorn.mp3
    ├── kick.wav
    ├── snare.wav
    ├── bass-drop.mp3
    └── mein-remix.mp3              # Mixer-Exports
```

---

## API Endpoints

### Sounds

```
GET  /api/sounds                    # Liste aller Sounds mit Tags
GET  /api/sounds/{hash}/file        # Sound-Datei herunterladen
POST /api/sounds/upload             # Neuen Sound hochladen
     - file: MP3/WAV Datei
     - tags: string[]               # Tag-Liste
     → Backend speichert Datei, berechnet Hash, fügt zu DB hinzu

GET  /api/tags                      # Liste aller Tags
```

### Playback

```
POST /api/sounds/{hash}/play        # Sound auf Raspberry abspielen
POST /api/sounds/stop               # Alle Sounds stoppen (killall)
```

### Stats

```
GET  /api/stats/top-sounds          # Meistgespielte Sounds
GET  /api/stats/top-users           # Aktivste User
```

### Users

```
POST /api/users/register            # Registrierung
POST /api/users/login               # Login
GET  /api/users/me                  # Aktueller User
```

### Chat (SignalR Hub)

```
Hub: /hubs/chat
- SendMessage(message)
- ReceiveMessage(user, message, timestamp)
```

### Sound Events (SignalR Hub)

```
Hub: /hubs/sounds
- SoundPlayed(soundHash, fileName, user, timestamp)
- SoundAdded(soundHash, fileName, tags[])
```

---

## Datenbank-Schema (SQLite)

```sql
-- Users
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    ip_address TEXT NOT NULL,              -- IP-Beschränkung: 1 Account pro IP
    first_name TEXT,
    last_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ip_address)                     -- Enforced: max 1 Account pro IP
);

-- Sounds (gecached aus Filesystem)
CREATE TABLE sounds (
    hash TEXT PRIMARY KEY,
    name TEXT NOT NULL,                    -- Anzeigename (aus filename generiert)
    file_name TEXT NOT NULL,
    duration_ms INTEGER,
    size_bytes INTEGER,
    enabled BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sound Tags (n:m Beziehung)
CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE sound_tags (
    sound_hash TEXT NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (sound_hash, tag_id),
    FOREIGN KEY (sound_hash) REFERENCES sounds(hash),
    FOREIGN KEY (tag_id) REFERENCES tags(id)
);

-- Sound Usage / Stats
CREATE TABLE sound_usages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sound_hash TEXT NOT NULL,
    user_id INTEGER,
    played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sound_hash) REFERENCES sounds(hash),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Chat Messages
CREATE TABLE chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## Implementierungs-Phasen

### Phase 0: Shared Sound-Interface definieren

> **Zuerst!** Einheitliches Datenmodell für alle Systeme festlegen

- [ ] TypeScript Interface `Sound` als Referenz (siehe "Einheitliches Sound-Datenmodell")
- [ ] C# DTO im Backend entsprechend anlegen
- [ ] Mixer `sounds.json` Format anpassen (falls nötig)

### Phase 1: Backend migrieren (.NET 10)

> Bestehendes Backend modernisieren, nicht neu schreiben

- [ ] PostgreSQL → SQLite migrieren
  - NuGet: `Npgsql.EntityFrameworkCore.PostgreSQL` entfernen
  - NuGet: `Microsoft.EntityFrameworkCore.Sqlite` hinzufügen
  - Connection String anpassen
  - Migrationen neu erstellen
- [ ] Tags-System implementieren (statt Kategorien)
  - `tags` und `sound_tags` Tabellen
  - API für Tag-Verwaltung
- [ ] JWT-Auth mit langer Laufzeit (14 Tage)
  - `Microsoft.AspNetCore.Authentication.JwtBearer`
  - IP-Beschränkung bei Registrierung
- [ ] Sound-File Download Endpoint (`GET /api/sounds/{hash}/file`)
- [ ] Sound-Upload Endpoint (`POST /api/sounds/upload`)
- [ ] SignalR Hub für Sound-Events (notify bei neuem Sound)
- [ ] TTS-Feature entfernen
- [ ] Altes Angular 8 Frontend aus wwwroot entfernen

### Phase 2: Neues Player UI (Angular 21)

> Komplett neu entwickeln (altes Frontend verwerfen)

- [ ] Neues Angular 21 Projekt erstellen
- [ ] Sound-Browser Komponente
  - Tags als Filter/Chips
  - Suche (Titel + Tags)
  - Play-Button pro Sound
- [ ] Sound abspielen via API
- [ ] Top Sounds Anzeige
- [ ] Top Users Anzeige
- [ ] Chat Integration (SignalR)
- [ ] User Login/Register (mit IP-Hinweis)
- [ ] Real-time Updates via SignalR (wer spielt was)

### Phase 3: Mixer LAN-Integration

> Bestehenden Mixer erweitern + Datenmodell vereinheitlichen
> Mixer hat bereits Sounds als JSON + Assets auf Webspace

- [ ] **Sound-Datenmodell migrieren**
  - `SoundLibraryItem` → `Sound` Interface angleichen
  - `category` in Tags überführen
  - `id` → `hash`, `duration` → `durationMs`
  - `scan-sounds.js` Script anpassen
- [ ] Environment-Konfiguration für nervboxApi
- [ ] SoundLibraryService: API-Modus wenn nervboxApi gesetzt
- [ ] Export-Dialog erweitern:
  - Checkbox "Upload zu nervbox"
  - Tag-Auswahl (Multi-Select, wenn Upload aktiv)
- [ ] Upload-Service implementieren
- [ ] Nach Upload: SignalR notification empfangen

### Phase 4: Build & Deployment

- [ ] Build-Script: `npm run build:lan` mit environment.lan.ts
- [ ] Build-Script: Player UI für wwwroot
- [ ] Build-Script: Mixer UI für wwwroot/mixer (mit `--base-href /mixer/`)
- [ ] Deploy-Script für Raspberry Pi
- [ ] Setup-Dokumentation aktualisieren

### Phase 5: Credit-System (optional, später)

- [ ] Credits-Tabelle im DB-Schema
- [ ] Credit-Regeneration (zeitbasiert)
- [ ] Kosten pro Sound-Abspielen
- [ ] Mini-Games für Credit-Gewinn
- [ ] UI für Credit-Anzeige

---

## Build Commands

```bash
# Public Mixer (nervbox-mixer.de)
cd nervbox-mixer
npm run build:prod
# → Deploy dist/ auf Webserver

# LAN Mixer (Raspberry)
cd nervbox-mixer
ng build --configuration=lan --base-href /mixer/
# → Kopieren nach NervboxDeamon/wwwroot/mixer/

# Player UI (Raspberry)
cd nervbox-player  # oder nervbox-ui
npm run build:prod
# → Kopieren nach NervboxDeamon/wwwroot/

# Backend
cd nervbox/NervboxDeamon
dotnet publish -c Release -r linux-arm64
# → Deploy auf Raspberry
```

---

## Offene Fragen / Später

- [ ] Admin-Bereich für Sound-Moderation (allowed/blocked)?
- [ ] Arrangements in DB speichern statt nur localStorage?
- [ ] Mobile-optimiertes UI für Player?

---

## Referenzen

- nervbox Backend: `nervbox/NervboxDeamon/`
- nervbox-mixer: `nervbox/nervbox-mixer/`
- Altes Frontend (zu ersetzen): `nervbox/NervboxUI/`
