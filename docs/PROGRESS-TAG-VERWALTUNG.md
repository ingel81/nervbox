# Progress: Tag-Verwaltung für nervbox

**Session:** 2025-12-15
**Status:** Abgeschlossen

---

## Umgesetzt

### Phase 1: Backend API (NervboxDeamon/)

| Datei | Status | Beschreibung |
|-------|--------|--------------|
| `Controllers/TagController.cs` | NEU | CRUD-Endpunkte für Tags (GET, POST, PUT, DELETE) |
| `Controllers/SoundController.cs` | ERWEITERT | PUT /sound/{hash}, DELETE, Toggle, GET /all |
| `Models/View/TagModels.cs` | NEU | TagCreateModel, TagUpdateModel, SoundUpdateModel |
| `Services/SoundService.cs` | ERWEITERT | SoundHelper, UpdateSoundEnabledStatus(), RemoveSoundFromCache() |

**API-Endpunkte:**
```
GET    /api/tag               - Alle Tags mit Sound-Count
POST   /api/tag               - Tag erstellen (Admin)
PUT    /api/tag/{id}          - Tag umbenennen (Admin)
DELETE /api/tag/{id}          - Tag löschen (Admin)

PUT    /api/sound/{hash}      - Sound bearbeiten (Admin)
PUT    /api/sound/{hash}/toggle - Enable/Disable (Admin)
DELETE /api/sound/{hash}      - Sound löschen (Admin)
GET    /api/sound/all         - Alle Sounds inkl. disabled (Admin)
```

### Phase 2: nervbox-player (Angular 21)

| Datei | Status | Beschreibung |
|-------|--------|--------------|
| `core/models/sound.model.ts` | ERWEITERT | Tag, SoundUpdateRequest Interfaces |
| `core/services/sound.service.ts` | ERWEITERT | CRUD für Tags/Sounds |
| `components/sound-grid/sound-card.component.ts` | ERWEITERT | Tags auf Cards, Admin-Menü |
| `components/admin/sound-edit-dialog.component.ts` | NEU | Sound bearbeiten Dialog |
| `components/admin/tag-manager-dialog.component.ts` | NEU | Tag-Verwaltung Dialog |
| `components/admin/delete-sound-dialog.component.ts` | NEU | Sound löschen Dialog (mit Namensbestätigung) |
| `components/toolbar/toolbar.component.ts` | ERWEITERT | Tag-Manager Button |
| `app.ts` | ERWEITERT | Handler für neue Events |

**Features:**
- Tags werden auf Sound-Cards angezeigt (max 3, "+N" für mehr)
- Admins sehen Bearbeiten/Deaktivieren/Löschen im Kontextmenü
- Sound-Edit-Dialog: Name, Tags, Enabled ändern
- Sound-Delete-Dialog: Löschen mit Namensbestätigung
- Tag-Manager-Dialog: Tags erstellen, umbenennen, löschen
- Tag-Manager-Button in Toolbar (nur für Admins)
- Standard-Sortierung: Beliebtheit
- Tooltip nur bei abgeschnittenen Namen

### Phase 3: nervbox-mixer

| Datei | Status | Beschreibung |
|-------|--------|--------------|
| `sound-browser/services/sound-library.service.ts` | ERWEITERT | Tags als Kategorien im LAN-Modus |

**Änderung:** Im LAN-Modus werden Tags direkt als Filter-Kategorien verwendet.

---

## Builds

Alle Projekte bauen ohne Warnungen:

```bash
# Backend
cd /home/joerg/projects/nervbox/nervbox/NervboxDeamon && dotnet build

# Player
cd /home/joerg/projects/nervbox/nervbox/nervbox-player && npm run build

# Mixer
cd /home/joerg/projects/nervbox/nervbox-mixer && npm run build
```

---

## Dateien

**Datenbank (Development):**
```
/home/joerg/projects/nervbox/nervbox/Release/nervbox.db
```

**Dev-Script:**
```bash
./start-dev.sh start   # Startet Backend + Player + Mixer mit Logs
./start-dev.sh stop    # Stoppt alles
./start-dev.sh status  # Zeigt Status
```
