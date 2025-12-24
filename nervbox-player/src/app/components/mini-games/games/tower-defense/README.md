# Tower Defense - Erlenbach

Ein Tower Defense Spiel mit echten 3D-Karten von Erlenbach (Google Photorealistic 3D Tiles via Cesium).

**Status:** POC (Proof of Concept) - Admin-only sichtbar

## Features

### Implementiert

- **3D-Karte**: Echte Gebäude und Terrain von Erlenbach (Google Photorealistic 3D Tiles)
- **Straßennetz**: Gegner laufen auf echten Straßen (OpenStreetMap + A* Pathfinding)
- **3D-Modelle**: Tower und Enemies als glTF/glb Modelle (Primitive API)
- **Animationen**: Zombies mit Walk- und Death-Animation
- **Tower-System**: Platziere Tower neben Straßen (10-50m Abstand)
- **Wellen-System**: Gegner spawnen in Wellen (5 pro Welle)
- **Projektile**: Tower schießen auf Gegner in Reichweite
- **Sound-Effekte**: Projektil-Sound beim Schießen
- **Health Bars**: Gegner haben HP und farbige Lebensbalken
- **Blut-Effekte**: Spritzer bei Treffern + Blutflecken am Boden
- **Terrain-Following**: Gegner folgen dem echten Gelände (Höhen-Interpolation)
- **localStorage Cache**: OSM-Daten werden gecacht (schnellerer 2. Start)

### UI-Toggles

| Button | Funktion | Default |
|--------|----------|---------|
| Straßen (route) | Gelbe Straßen ein/aus | Aus |
| Routen (timeline) | Rote Gegner-Pfade ein/aus | Aus |
| Neigung (3d_rotation) | Kamera-Neigung wechseln | 45° |
| Kamera (my_location) | Kamera zurücksetzen | - |

### 3D-Modelle

Modelle befinden sich in `/public/assets/models/`:

| Datei | Typ | Beschreibung |
|-------|-----|--------------|
| `tower_archer.glb` | Tower | Bogen-Turm (114 KB) |
| `zombie_alternative.glb` | Enemy | Zombie mit Animationen (2.1 MB) |

#### Zombie-Animationen (Primitive API)

```
Armature|Walk      - Lauf-Animation (aktiv während Bewegung)
Armature|Die       - Sterbe-Animation (bei Tod)
Armature|Die2      - Alternative Sterbe-Animation
Armature|Idle      - Idle-Animation
Armature|Attack    - Angriffs-Animation
```

## Architektur

```
tower-defense/
├── tower-defense.component.ts   # Haupt-UI + Cesium Viewer
├── README.md                    # Diese Dokumentation
├── models/
│   ├── game.types.ts            # Interfaces & Types (inkl. height in GeoPosition)
│   ├── tower.model.ts           # Tower-Klasse
│   ├── enemy.model.ts           # Enemy-Klasse (mit model + terrainHeight)
│   └── projectile.model.ts      # Projectile-Klasse
├── renderers/
│   ├── tower.renderer.ts        # Tower Range-Kreis Rendering
│   ├── enemy.renderer.ts        # Health Bar Rendering
│   ├── projectile.renderer.ts   # Projektil Billboard-Rendering
│   └── blood.renderer.ts        # Blut-Effekte (Splatter + Stains)
└── services/
    ├── osm-street.service.ts    # OpenStreetMap + A* + localStorage Cache
    ├── game-state.service.ts    # Zentraler Spiel-State (Signals)
    └── entity-pool.service.ts   # Object Pooling für Health Bars/Projektile
```

## Services

### GameStateService

Zentraler State-Manager mit Angular Signals:

```typescript
// Signals (readonly)
phase: Signal<'setup' | 'wave' | 'gameover'>
waveNumber: Signal<number>
baseHealth: Signal<number>       // Startet bei 100
credits: Signal<number>          // Startet bei 100
towers: Signal<Tower[]>
enemies: Signal<Enemy[]>
projectiles: Signal<Projectile[]>
selectedTowerId: Signal<string | null>
enemiesAlive: Signal<number>     // Computed

// Methoden
initialize(viewer, entityPool, distanceCalculator, onProjectileFired)
spawnEnemy(path, maxHp, speed)   // Erstellt 3D-Zombie mit Walk-Animation
playEnemyDeathAnimation(enemy)   // Wechselt zu Death-Animation
update(currentTime)              // Game Loop - Enemies, Towers, Projectiles
```

### EntityPoolService

Object Pooling für Performance + Animation-Steuerung (Primitive API):

```typescript
initialize(viewer)
acquire(type): Entity            // 'healthBar' | 'projectile'
release(entity, type)
playAnimation(entity, name, loop) // Direkter Zugriff auf model.activeAnimations
playWalkAnimation(entity)         // 'Armature|Walk' (loop)
playDeathAnimation(entity)        // 'Armature|Die' (einmalig)
```

### OsmStreetService

Lädt Straßen von OpenStreetMap (Overpass API) mit localStorage-Cache:

```typescript
loadStreets(lat, lon, radiusMeters): StreetNetwork
// - Prüft zuerst localStorage Cache
// - Bei Cache-Miss: API-Aufruf + Cache speichern
// - Cache-Key: td_streets_v1_{lat}_{lon}_{radius}

findPath(network, startLat, startLon, endLat, endLon): StreetNode[]
findNearestStreetPoint(network, lat, lon)
haversineDistance(lat1, lon1, lat2, lon2): meters
```

### BloodRenderer

Blut-Effekte bei Treffern:

```typescript
spawnBloodSplatter(viewer, lon, lat, height)  // 3-5 Partikel, verschwinden nach 300-500ms
spawnBloodStain(viewer, lon, lat, height)     // Bleibt am Boden (max 50, FIFO)
clearAllBloodStains(viewer)                   // Bei Game Reset
```

## Game Loop

```
1. Welle starten (Button "Welle starten!")
   ├── gameState.startWave()
   ├── viewer.clock.shouldAnimate = true  # Aktiviert Animationen
   ├── Spawn-Interval: alle 800ms ein Zombie
   │   ├── Terrain-Höhe für Pfad samplen (sampleTerrainMostDetailed)
   │   ├── Model.fromGltfAsync() laden
   │   └── model.activeAnimations.add('Armature|Walk')
   └── startGameLoop()

2. Jeder Animation Frame
   └── gameState.update(currentTime)
       ├── updateEnemies()
       │   ├── enemy.update() → Position interpolieren
       │   ├── Heading berechnen (Blickrichtung)
       │   ├── Höhe interpolieren zwischen Wegpunkten
       │   ├── model.modelMatrix aktualisieren
       │   └── Bei "reached_base" → baseHealth -= 10, Death-Animation
       ├── updateTowerShooting(currentTime)
       │   ├── tower.canFire(time)?
       │   ├── tower.findTarget(enemies)
       │   ├── spawnProjectile(tower, targetId)
       │   └── onProjectileFired() → Sound abspielen
       └── updateProjectiles(deltaTime)
           ├── projectile.update(targetPos, delta)
           ├── Bei Hit:
           │   ├── BloodRenderer.spawnBloodSplatter()
           │   ├── BloodRenderer.spawnBloodStain()
           │   ├── enemy.takeDamage()
           │   └── Wenn tot: Death-Animation + verzögertes Entfernen
           └── Health Bar aktualisieren

3. Welle beendet
   └── checkWaveComplete() && allSpawned
       ├── gameState.endWave()
       ├── clearAllEnemies() → Alle Modelle entfernen
       ├── credits += 50
       └── requestRender()
```

## Koordinaten (Erlenbach, BW)

```typescript
// Kamera-Zentrum
ERLENBACH_COORDS = {
  latitude: 49.1726836,
  longitude: 9.2703122,
  height: 400
}

// Basis (zu verteidigen)
BASE_COORDS = {
  latitude: 49.17326887448299,
  longitude: 9.268588397188681
}

// Spawn-Punkt Nord
SPAWN_POINTS = [{
  id: 'spawn-north',
  name: 'Nord',
  latitude: 49.17554723547113,
  longitude: 9.263870533891945
}]
```

## Straßennetz-Konfiguration

| Einstellung | Wert |
|-------------|------|
| Radius | 2000m (2km) |
| Cache | localStorage |
| Cache-Key | `td_streets_v1_{lat}_{lon}_{radius}` |
| Typische Größe | 100-300 KB |

## Tower-Platzierung

| Regel | Wert |
|-------|------|
| Min. Abstand zu Straße | 10m |
| Max. Abstand zu Straße | 50m |
| Min. Abstand zu Basis | 30m |
| Min. Abstand zu Spawn | 30m |
| Min. Abstand zu anderen Towern | 20m |
| Tower-Range | 60m |

## Steuerung

| Aktion | Steuerung |
|--------|-----------|
| Kamera verschieben | Linke Maustaste + Ziehen |
| Kamera drehen | Strg + Maus |
| Zoom | Mausrad |
| Tower selektieren | Klick auf Tower |
| Tower platzieren | Build-Mode → Klick neben Straße |

## Sound

Projektil-Sound: `3ae29d3b4c96b913c63964373e218f08`
- Wird bei jedem Schuss abgespielt
- Lautstärke: 30%

## Cesium Setup

Voraussetzung: Cesium Ion Token in `environment.ts`:

```typescript
export const environment = {
  cesiumAccessToken: 'dein-token-hier'
};
```

Token erstellen: https://cesium.com/ion/tokens (kostenlos, 75k Tiles/Monat)

## Viewer-Konfiguration

```typescript
// Zoom-Einstellungen
zoomFactor: 1.5              // Feineres Zoomen (Standard: 3.0)
minimumZoomDistance: 50      // Min 50m
maximumZoomDistance: 2000    // Max 2km

// Nur Mausrad-Zoom (kein Rechtsklick-Zoom)
zoomEventTypes: [WHEEL, PINCH]
```

## Performance-Optimierungen

- **Object Pooling**: Health Bars und Projektile werden wiederverwendet
- **requestRenderMode**: Nur bei Änderungen rendern
- **Primitive API**: Direkter Zugriff auf Animationen (statt Entity API)
- **Terrain Height Cache**: Pfad-Höhen werden einmal gesampled, dann interpoliert
- **localStorage Cache**: OSM-Daten werden lokal gespeichert
- **minimumPixelSize**: Modelle bleiben bei Zoom-Out sichtbar
- **Max Blood Stains**: Limitiert auf 50 (FIFO)

## Technische Details

### Primitive API vs Entity API

| Aspekt | Entity API | Primitive API (verwendet) |
|--------|------------|---------------------------|
| Animation-Kontrolle | Nur `runAnimations: true/false` | Voller Zugriff auf `activeAnimations` |
| Spezifische Animation | Nicht möglich | `model.activeAnimations.add({ name: 'X' })` |
| Height Reference | `CLAMP_TO_GROUND` | Manuell via Terrain-Sampling |
| Position Update | Entity Position Property | `model.modelMatrix` |

### Terrain Height Handling

```typescript
// Beim Pfad-Laden (einmalig):
Cesium.sampleTerrainMostDetailed(terrainProvider, cartographics)

// Während Bewegung (interpoliert):
const currentHeight = path[currentIndex].height;
const nextHeight = path[currentIndex + 1].height;
const height = currentHeight + (nextHeight - currentHeight) * progress;
```

## TODO / Nächste Schritte

- [ ] Mehr Spawn-Punkte aktivieren
- [ ] Wave-Progression (mehr/stärkere Gegner)
- [ ] Tower-Upgrades
- [ ] Mehrere Tower-Typen
- [ ] Game Over Screen
- [ ] Score-System / Highscore
- [ ] Tower-Verkauf
- [ ] Verschiedene Gegner-Typen
- [ ] Attack-Animation bei Basis-Erreichen
