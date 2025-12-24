# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Critical Instructions

### German Feedback Requirements
1. **Objektives Feedback**: Gib immer Feedback, das auf überprüfbaren Fakten und Daten basiert.
2. **Sicherheit bei Zustimmung**: Bestätige nur dann, dass ich richtig liege, wenn du zu 100% sicher bist.
3. **Nachfragen bei Unklarheiten**: Wenn eine Aussage mehrdeutig ist, frage nach Klarstellung.

### Development Constraints
- **niemals starten ...nur bauen** - Never run `npm start`, only build
- **niemals issues schließen oder commiten ohne befehl dazu** - Never close issues or commit without explicit command
- **Full ESLint + Prettier setup** - Strict TypeScript linting with auto-fix capabilities
- **Strict Angular Templates** - strictTemplates enabled for maximum type safety

## Commands

- `npm run build` - Create production build
- `npm run build:prod` - Production build with optimizations
- `npm run build:lan` - Build for Raspberry Pi deployment
- `npm run lint` - Run ESLint to check for code quality issues
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run format` - Format code with Prettier

## Architecture

### Standalone Angular 21 Application
- **No NgModules** - Components use standalone: true and import dependencies directly
- **Angular Signals** - All state management uses signals
- **Bootstrap** - Uses `bootstrapApplication()` in main.ts
- **State Management** - Services with signals for reactive state

### Single Page Layout
```
┌─────────────────────────────────────────────────────────────┐
│  TOOLBAR: Logo | Search | Tags | [Stats] [Chat] [User]      │
├─────────────────────────────────────────────────────────────┤
│  Sound Grid (responsive, multiple cards per row)            │
├─────────────────────────────────────────────────────────────┤
│  NOW PLAYING: [User] spielt [Sound]                         │
└─────────────────────────────────────────────────────────────┘
```

### File Structure
```
src/app/
├── app.ts                        # Root + Main Layout
├── app.config.ts                 # Provider configuration
├── core/
│   ├── services/                 # API, Auth, Sound, Chat, SignalR, Achievements, etc.
│   │   ├── achievement.service.ts
│   │   ├── api.service.ts
│   │   ├── auth.service.ts
│   │   ├── avatar.service.ts
│   │   ├── credit.service.ts
│   │   ├── favorites.service.ts
│   │   ├── selection.service.ts
│   │   ├── signalr.service.ts
│   │   ├── sound.service.ts
│   │   ├── user-cache.service.ts
│   │   ├── user.service.ts
│   │   ├── vote.service.ts
│   │   └── welcome-tour.service.ts
│   ├── interceptors/             # JWT interceptor
│   └── models/                   # TypeScript interfaces
├── components/
│   ├── admin/                    # Admin Panel
│   ├── auth/                     # Login/Register dialogs
│   ├── avatar-upload-dialog/     # Avatar upload
│   ├── chat/                     # Chat component
│   ├── chat-widget/              # Chat overlay widget
│   ├── mini-games/               # Minispiele
│   ├── now-playing/              # Live playback indicator
│   ├── shared/                   # Shared components
│   ├── sound-grid/               # Sound list + cards
│   ├── stats/                    # Stats component
│   ├── stats-popup/              # Top sounds/users dialog
│   ├── tag-filter/               # Tag chip filters
│   └── toolbar/                  # Header toolbar
└── shared/
    └── pipes/                    # Duration pipe, etc.
```

### Backend API
- Base URL: `/api` (production), `http://localhost:8080/api` (development)
- Authentication: JWT Bearer tokens (14 days validity)
- Real-time: SignalR hubs at `/ws/chatHub`, `/ws/soundHub`

### Key Endpoints
- `GET /api/sound` - List all sounds
- `GET /api/sound/{hash}/play` - Play sound
- `GET /api/sound/statistics/topsounds` - Top 25 sounds
- `GET /api/sound/statistics/topusers` - Top 25 users
- `POST /api/users/auth/login` - Login
- `POST /api/users/auth/register` - Register (1 account per IP)
- `GET /api/chat` - Get chat messages

## Design System

### Colors (match nervbox-mixer)
- Primary Purple: #9333ea
- Secondary Pink: #ec4899
- Dark Background: #0a0a0a / #1a1b1f
- Accent Orange: #f97316

### Typography
- Monospace: JetBrains Mono
- Body: Inter, system-ui

### Material Theme
- Dark theme with heavy customization
- Purple/pink accent colors
- Glassmorphism effects

## Git Configuration

### Commit Message Format
Use conventional prefixes:
- `fix:` - Bug fixes
- `feat:` - New features
- `refactor:` - Code restructuring
- `chore:` - Maintenance tasks

**Kein Claude Footer** - No automatic Claude signatures in commits

## Quality Gates

```bash
# Before committing changes:
npm run lint          # Check for linting errors
npm run lint:fix      # Auto-fix what's possible
npm run format        # Format code consistently
npm run build         # Verify build succeeds
```

## Cesium 3D Integration

### Setup
- Cesium Ion Access Token in `environment.ts` unter `cesiumAccessToken`
- Google Photorealistic 3D Tiles via `Cesium.createGooglePhotorealistic3DTileset()`
- Assets in `public/assets/models/` (glTF/GLB Format)

### Performance-Optimierungen
- **requestRenderMode**: `true` für on-demand Rendering, `false` während Animationen
- **globe.pick()** statt `scene.pickPosition()` - deutlich schneller auf Terrain
- **Entity Pooling** für häufig erstellte/entfernte Entities (Projektile, Health Bars)
- **Throttling** bei Mouse-Move Events (30ms reicht für flüssige Preview)

### Entities auf 3D Tiles
- **Billboard** statt Ellipse verwenden - Ellipsen werden von 3D Tiles verdeckt
- `disableDepthTestDistance: Number.POSITIVE_INFINITY` für immer sichtbare Marker
- `heightReference: Cesium.HeightReference.CLAMP_TO_GROUND` für Boden-Entities

### Terrain-Höhen
```typescript
// Terrain-Höhe für Position samplen
const positions = [Cesium.Cartographic.fromDegrees(lon, lat)];
const sampled = await Cesium.sampleTerrainMostDetailed(terrainProvider, positions);
const height = sampled[0].height;
```

## glTF Modelle & Animationen

### Root Motion Problem
Viele Animationen (z.B. Walk) enthalten "Root Motion" - das Modell bewegt sich in der Animation vorwärts. Beim Loop-Reset springt die Position zurück → sichtbarer Ruckler.

**Lösung:** Script `scripts/fix-root-motion.js` entfernt Root-Translation:
```bash
node scripts/fix-root-motion.js input.glb output.glb
```

Das Script setzt alle Translation-Keyframes des Root-Bones (Hips) auf den ersten Frame-Wert.

**In Blender manuell:**
1. Animation Workspace öffnen
2. Graph Editor → Root/Hips Bone → Location Y (Vorwärtsbewegung)
3. Alle Keyframes auf konstanten Wert setzen oder löschen

### Animation in Cesium
```typescript
// Model laden
const model = await Cesium.Model.fromGltfAsync({ url, scale });
scene.primitives.add(model);

// Animation starten (nach model.ready)
model.activeAnimations.add({
  name: 'Armature|Walk',
  loop: Cesium.ModelAnimationLoop.REPEAT,
  multiplier: 2.0,  // Geschwindigkeit
});

// Position/Rotation updaten
model.modelMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(position, hpr);
```

### Modell-Inspektion
```bash
npx @gltf-transform/cli inspect model.glb  # Zeigt Animationen, Meshes, etc.
```

## OpenStreetMap Integration

### Overpass API
- Mehrere Server für Fallback (kumi.systems, overpass-api.de, maps.mail.ru)
- Ergebnisse in localStorage cachen
- Query für Straßen: `way["highway"~"residential|primary|..."]`

### Distanz zu Straßen
**Wichtig:** Nicht nur Distanz zu Nodes prüfen, sondern zu Liniensegmenten!
```typescript
// Falsch: Nur Node-Distanz
const dist = haversine(point, node);

// Richtig: Distanz zum nächsten Punkt auf dem Segment
const dist = distanceToSegment(point, segmentStart, segmentEnd);
```

### A* Pathfinding
- Graph aus Street-Nodes bauen (Nachbarn = vorheriger/nächster Node im Street-Array)
- Haversine-Distanz als Heuristik
- Terrain-Höhen für jeden Pfad-Punkt samplen für smooth movement

## Movement & Animation Sync

### Delta-Time basierte Bewegung
```typescript
update(deltaTimeMs: number) {
  const cappedDelta = Math.min(deltaTimeMs, 100);  // Cap gegen Tab-Switch-Sprünge
  this.progress += this.speed * (cappedDelta / 1000) * 60;

  // Overflow behalten für smooth transitions
  while (this.progress >= 1) {
    this.progress -= 1;  // NICHT = 0!
    this.currentIndex++;
  }
}
```

### Heading berechnen (Cesium)
```typescript
// Cesium: 0 = North, PI/2 = East
// Model faces -Y, daher -PI/2 Offset
const heading = Math.atan2(dLon, dLat) - Math.PI / 2;
```
