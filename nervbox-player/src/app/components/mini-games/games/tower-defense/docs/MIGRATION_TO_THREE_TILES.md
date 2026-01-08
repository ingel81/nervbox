# Migration: Cesium → Three.js + 3DTilesRendererJS

## Motivation

### Das Problem
Three.js Objekte (Enemies, Towers) werden **nicht von Cesium 3D Tiles verdeckt**.
Sie erscheinen immer im Vordergrund, auch wenn sie hinter Gebäuden sein sollten.

### Warum bisherige Lösungen scheiterten
| Versuch | Problem |
|---------|---------|
| Shared WebGL Context | Cesium nutzt interne Framebuffer für 3D Tiles |
| PostProcessStage Texture Sharing | WebGL Binding-Fehler zwischen Engines |
| Raycast-basierte Occlusion | `pickFromRay` für 3D Tiles unzuverlässig |
| `czm_globeDepthTexture` | Enthält **nur Terrain**, nicht 3D Tiles! |

### Die Lösung
**Alles in einer Engine rendern** → Automatische Depth-Occlusion

[NASA 3DTilesRendererJS](https://github.com/NASA-AMMOS/3DTilesRendererJS) lädt Google Photorealistic 3D Tiles direkt in Three.js.

---

## Technologie-Übersicht

### 3DTilesRendererJS (NASA JPL)
- GitHub: https://github.com/NASA-AMMOS/3DTilesRendererJS
- NPM: `3d-tiles-renderer`
- Three.js offizielles Beispiel: https://threejs.org/examples/webgl_loader_3dtiles.html

### Features
- ✅ Google Photorealistic 3D Tiles Support
- ✅ Cesium Ion Token Authentifizierung
- ✅ DRACO Mesh Compression
- ✅ Raycasting für Terrain-Höhen
- ✅ LOD (Level of Detail) Management
- ✅ GlobeControls für Kamera-Navigation

---

## Was bleibt gleich

| Komponente | Status | Anmerkung |
|------------|--------|-----------|
| OSM Street Service | ✅ Unverändert | Overpass API unabhängig |
| Pathfinding (A*) | ✅ Unverändert | Reine Logik |
| Game State Manager | ✅ Unverändert | Reine Logik |
| Enemy/Tower Logik | ✅ Unverändert | Reine Logik |
| ThreeEnemyRenderer | ✅ Unverändert | Bereits Three.js |
| ThreeTowerRenderer | ✅ Unverändert | Bereits Three.js |
| ThreeProjectileRenderer | ✅ Unverändert | Bereits Three.js |
| ThreeEffectsRenderer | ✅ Unverändert | Bereits Three.js |
| GLTF Modelle | ✅ Unverändert | Gleiche Assets |

---

## Was sich ändert

### 1. Cesium Viewer → Three.js Scene + 3DTilesRenderer

```typescript
// ALT (Cesium)
this.viewer = new Cesium.Viewer(container, { ... });
await Cesium.createGooglePhotorealistic3DTileset();

// NEU (Three.js + 3DTilesRenderer)
this.scene = new THREE.Scene();
this.tilesRenderer = new TilesRenderer(GOOGLE_TILES_URL);
this.tilesRenderer.registerPlugin(new CesiumIonAuthPlugin({ apiToken, assetId }));
this.scene.add(this.tilesRenderer.group);
```

### 2. Kamera-Controls → GlobeControls

```typescript
// ALT (Cesium)
this.viewer.camera.flyTo({ destination: ... });

// NEU (Three.js)
import { GlobeControls } from '3d-tiles-renderer';
this.controls = new GlobeControls(this.scene, this.camera, this.renderer.domElement);
```

### 3. Terrain-Höhenabfrage → Raycast

```typescript
// ALT (Cesium)
const positions = [Cesium.Cartographic.fromDegrees(lon, lat)];
const sampled = await Cesium.sampleTerrainMostDetailed(terrainProvider, positions);
const height = sampled[0].height;

// NEU (Three.js Raycast)
const position = WGS84_ELLIPSOID.getCartographicToPosition(lat, lon, 10000);
const direction = position.clone().negate().normalize();
const raycaster = new THREE.Raycaster(position, direction);
raycaster.firstHitOnly = true;
const hits = raycaster.intersectObject(tilesRenderer.group, true);
const height = hits[0]?.point.length() - WGS84_RADIUS;
```

### 4. Koordinaten-Transformation

```typescript
// ALT (CesiumThreeSync)
// Eigene ENU-Transformation mit Cesium Cartesian3

// NEU (3DTilesRenderer Ellipsoid Utils)
import { WGS84_ELLIPSOID } from '3d-tiles-renderer';
const matrix = new THREE.Matrix4();
WGS84_ELLIPSOID.getRotationMatrixFromAzElRoll(lat, lon, 0, 0, 0, matrix);
```

---

## Architektur-Vergleich

### Vorher (Zwei Engines)
```
┌─────────────────────────────────────────┐
│ Cesium Viewer                           │
│  ├─ Google 3D Tiles (Gebäude)           │
│  ├─ Terrain Provider                    │
│  └─ Camera Controls                     │
├─────────────────────────────────────────┤
│ Three.js Canvas (Overlay)               │
│  ├─ Enemies (GLTF)                      │
│  ├─ Towers (GLTF)                       │
│  ├─ Projectiles                         │
│  └─ Effects                             │
└─────────────────────────────────────────┘
         ❌ Keine Depth-Occlusion
```

### Nachher (Eine Engine)
```
┌─────────────────────────────────────────┐
│ Three.js Scene                          │
│  ├─ TilesRenderer                       │
│  │   └─ Google 3D Tiles (Gebäude)       │
│  ├─ Enemies (GLTF)                      │
│  ├─ Towers (GLTF)                       │
│  ├─ Projectiles                         │
│  ├─ Effects                             │
│  └─ Route Lines                         │
└─────────────────────────────────────────┘
         ✅ Automatische Depth-Occlusion
```

---

## Implementierungsplan

### Session 1: Grundgerüst & 3D Tiles

**Ziel:** Three.js Scene mit Google 3D Tiles und Kamera-Navigation

#### Aufgaben:

1. **Dependencies installieren**
   ```bash
   npm install 3d-tiles-renderer
   ```

2. **Neue Engine-Klasse erstellen**
   - `three-tiles-engine.ts` - Hauptklasse
   - Three.js Scene, Camera, Renderer Setup
   - WebGL Renderer mit logarithmischem Depth Buffer

3. **3D Tiles Integration**
   - TilesRenderer mit Google Photorealistic Tiles
   - CesiumIonAuthPlugin für Authentifizierung
   - DRACO Loader für komprimierte Meshes

4. **Kamera-Controls**
   - GlobeControls Setup
   - Initiale Position (HQ Koordinaten)
   - Zoom/Pan/Rotate Limits

5. **Render-Loop**
   - `tilesRenderer.update()` pro Frame
   - Camera Matrix Updates

6. **Prototyp testen**
   - Gebäude sichtbar?
   - Navigation funktioniert?
   - Performance ok?

#### Dateien:
- `three-engine/three-tiles-engine.ts` (NEU)
- `tower-defense.component.ts` (Anpassen)

---

### Session 2: Game-Integration & Migration

**Ziel:** Vollständige Integration aller Game-Komponenten

#### Aufgaben:

1. **Terrain-Adapter umschreiben**
   - `terrain-adapter.ts` → Raycast-basiert
   - Höhen-Cache behalten
   - Batch-Sampling für Performance

2. **Koordinaten-System**
   - `cesium-three-sync.ts` → `ellipsoid-sync.ts`
   - WGS84 → Three.js Local Transformation
   - geoToLocal() / localToGeo() Methoden

3. **Entity Renderer integrieren**
   - ThreeEnemyRenderer an neue Engine
   - ThreeTowerRenderer an neue Engine
   - ThreeProjectileRenderer an neue Engine
   - ThreeEffectsRenderer an neue Engine

4. **Routen-Visualisierung**
   - Pfad-Linien in Three.js Scene
   - Spawn-Marker
   - HQ-Marker

5. **UI Integration**
   - Click-Handler für Tower-Platzierung
   - Raycast gegen Tiles für Position
   - Tower-Auswahl

6. **Alte Cesium-Komponenten entfernen**
   - Cesium Viewer entfernen
   - Alte Renderer entfernen
   - Imports aufräumen

7. **Testing & Bugfixing**
   - Depth-Occlusion verifizieren
   - Performance-Check
   - Edge Cases

#### Dateien:
- `three-engine/terrain-adapter.ts` (Umschreiben)
- `three-engine/ellipsoid-sync.ts` (NEU, ersetzt cesium-three-sync.ts)
- `three-engine/td-three-engine.ts` (Entfernen)
- `tower-defense.component.ts` (Anpassen)
- Alte Cesium Renderer (Entfernen)

---

## Risiken & Mitigationen

| Risiko | Wahrscheinlichkeit | Mitigation |
|--------|-------------------|------------|
| Performance schlechter als Cesium | Mittel | LOD-Einstellungen tunen, `maxDepth` begrenzen |
| Terrain-Raycast ungenau | Niedrig | Cache + mehrere Samples |
| GlobeControls nicht flexibel genug | Niedrig | Eigene Controls oder Fork |
| Google Tiles API-Änderungen | Niedrig | Cesium Ion als Proxy bleibt |

## Fallback-Plan

Falls 3DTilesRendererJS nicht funktioniert:
1. **Option B:** Cesium Model für Entities (Rückbau)
2. **Option C:** Limitation akzeptieren (kein Occlusion)

---

## Referenzen

- [3DTilesRendererJS GitHub](https://github.com/NASA-AMMOS/3DTilesRendererJS)
- [Three.js 3D Tiles Beispiel](https://threejs.org/examples/webgl_loader_3dtiles.html)
- [Cesium Blog: Three.js Enhancements](https://cesium.com/blog/2024/09/11/enhancements-to-the-threejs-3d-tiles-renderer/)
- [NPM Package](https://www.npmjs.com/package/3d-tiles-renderer)

### Lokale Beispiele

Das 3DTilesRendererJS Repository ist ausgecheckt unter:
```
samples/3DTilesRendererJS/
```

**Wichtige Beispiel-Dateien:**
- `example/three/googleMapsExample.js` - Google Photorealistic Tiles Setup (HAUPT-REFERENZ)
- `example/three/googleMapsAerial.js` - Raycaster Setup mit ReorientationPlugin
- `example/three/index.js` - Vollständiges Raycasting-Beispiel mit Mouse-Intersection
- `example/three/ellipsoid.js` - Koordinaten-Transformation Beispiele
- `src/three/TilesRenderer.js` - Haupt-Renderer Klasse
- `src/plugins/CesiumIonAuthPlugin.js` - Ion Auth Plugin

---

## Code-Referenzen aus Beispielen

### Google Photorealistic Tiles Setup (aus googleMapsExample.js)

```typescript
import {
  WGS84_ELLIPSOID,
  CAMERA_FRAME,
  GeoUtils,
  GlobeControls,
  CameraTransitionManager,
  TilesRenderer,
} from '3d-tiles-renderer';
import {
  TilesFadePlugin,
  UpdateOnChangePlugin,
  TileCompressionPlugin,
  UnloadTilesPlugin,
  GLTFExtensionsPlugin,
  CesiumIonAuthPlugin,
} from '3d-tiles-renderer/plugins';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

// TilesRenderer erstellen
tiles = new TilesRenderer();

// Plugins registrieren (Reihenfolge wichtig!)
tiles.registerPlugin(new CesiumIonAuthPlugin({
  apiToken: CESIUM_ION_TOKEN,  // Aus environment.ts
  assetId: '2275207',          // Google Photorealistic 3D Tiles
  autoRefreshToken: true
}));
tiles.registerPlugin(new TileCompressionPlugin());
tiles.registerPlugin(new UpdateOnChangePlugin());
tiles.registerPlugin(new UnloadTilesPlugin());
tiles.registerPlugin(new GLTFExtensionsPlugin({
  dracoLoader: new DRACOLoader().setDecoderPath('assets/draco/')
}));

// WICHTIG: tiles.group um -90° rotieren (Z-up → Y-up)
tiles.group.rotation.x = -Math.PI / 2;
scene.add(tiles.group);

// Kamera setzen
tiles.setResolutionFromRenderer(camera, renderer);
tiles.setCamera(camera);
```

### GlobeControls Setup

```typescript
import { GlobeControls } from '3d-tiles-renderer';

// GlobeControls benötigt: scene, camera, domElement, ellipsoid/group
controls = new GlobeControls(scene, camera, renderer.domElement, null);
controls.enableDamping = true;

// Ellipsoid setzen nachdem tiles geladen
controls.setEllipsoid(tiles.ellipsoid, tiles.group);
```

### Raycasting für Terrain-Höhen (aus index.js)

```typescript
import { Raycaster, Vector2 } from 'three';

const raycaster = new Raycaster();
raycaster.firstHitOnly = true;  // WICHTIG für Performance!

// Screen-Space Raycast (für Mouse-Klicks)
function getIntersectionAtMouse(mouse: Vector2, camera: Camera): Vector3 | null {
  raycaster.setFromCamera(mouse, camera);
  const results = raycaster.intersectObject(tiles.group, true);
  return results.length > 0 ? results[0].point : null;
}

// Vertikaler Raycast für Terrain-Höhe an Position
function getTerrainHeight(lat: number, lon: number): number | null {
  // Position 10km über dem Punkt
  const position = new Vector3();
  WGS84_ELLIPSOID.getCartographicToPosition(
    lat * MathUtils.DEG2RAD,
    lon * MathUtils.DEG2RAD,
    10000,  // 10km Höhe
    position
  );

  // Richtung zum Ellipsoid-Zentrum
  const direction = position.clone().negate().normalize();

  raycaster.set(position, direction);
  raycaster.firstHitOnly = true;

  const results = raycaster.intersectObject(tiles.group, true);
  if (results.length > 0) {
    // Abstand vom Zentrum = Höhe über Ellipsoid
    return results[0].point.length() - WGS84_ELLIPSOID.radius.x;
  }
  return null;
}
```

### Koordinaten-Transformation (WGS84 ↔ Three.js)

```typescript
import { WGS84_ELLIPSOID, CAMERA_FRAME, MathUtils } from '3d-tiles-renderer';

// WGS84 → Three.js Position
function geoToPosition(lat: number, lon: number, height: number): Vector3 {
  const position = new Vector3();
  WGS84_ELLIPSOID.getCartographicToPosition(
    lat * MathUtils.DEG2RAD,
    lon * MathUtils.DEG2RAD,
    height,
    position
  );
  // tiles.group Transformation anwenden
  position.applyMatrix4(tiles.group.matrixWorld);
  return position;
}

// Three.js Position → WGS84
function positionToGeo(position: Vector3): { lat: number, lon: number, height: number } {
  // Inverse tiles.group Transformation
  const localPos = position.clone();
  const invMatrix = tiles.group.matrixWorld.clone().invert();
  localPos.applyMatrix4(invMatrix);

  const result = {};
  WGS84_ELLIPSOID.getPositionToCartographic(localPos, result);

  return {
    lat: result.lat * MathUtils.RAD2DEG,
    lon: result.lon * MathUtils.RAD2DEG,
    height: result.height
  };
}
```

### Kamera auf Position setzen

```typescript
// Aus googleMapsExample.js - Kamera auf Lat/Lon/Height setzen
function setCameraPosition(lat: number, lon: number, height: number, az = 0, el = -45, roll = 0) {
  tiles.group.updateMatrixWorld();

  // Camera Matrix aus Koordinaten erstellen
  WGS84_ELLIPSOID.getObjectFrame(
    lat * MathUtils.DEG2RAD,
    lon * MathUtils.DEG2RAD,
    height,
    az * MathUtils.DEG2RAD,
    el * MathUtils.DEG2RAD,
    roll * MathUtils.DEG2RAD,
    camera.matrixWorld,
    CAMERA_FRAME
  );

  // tiles.group Transformation anwenden
  camera.matrixWorld.premultiply(tiles.group.matrixWorld);
  camera.matrixWorld.decompose(camera.position, camera.quaternion, camera.scale);
}
```

### ReorientationPlugin - Zentrieren auf HQ

Das `ReorientationPlugin` zentriert die Tiles auf eine bestimmte Position und richtet
das Koordinatensystem aus, sodass:
- **Y ist up** (vertikal)
- **X zeigt nach Westen**
- **Z zeigt nach Norden**

Dies vereinfacht die Koordinaten-Transformation enorm!

```typescript
import { ReorientationPlugin } from '3d-tiles-renderer/plugins';
import { MathUtils } from 'three';

// Bei Initialisierung - Tiles auf HQ zentrieren
tiles.registerPlugin(new ReorientationPlugin({
  lat: HQ_LAT * MathUtils.DEG2RAD,
  lon: HQ_LON * MathUtils.DEG2RAD,
  height: 0,
  recenter: true  // Setzt HQ auf (0, 0, 0)
}));

// Dynamisch ändern (z.B. bei Levelwechsel)
const plugin = tiles.getPluginByName('REORIENTATION_PLUGIN');
plugin.transformLatLonHeightToOrigin(
  newLat * MathUtils.DEG2RAD,
  newLon * MathUtils.DEG2RAD,
  0
);
```

**Vorteil:** Mit `recenter: true` liegt der HQ bei (0, 0, 0) in Three.js Koordinaten!
Alle anderen Positionen sind relative Offsets in Metern.

---

## Checkliste

### Session 1
- [ ] `npm install 3d-tiles-renderer`
- [ ] `ThreeTilesEngine` Klasse erstellen
- [ ] Three.js Scene + Renderer Setup
- [ ] TilesRenderer mit Cesium Ion Auth
- [ ] GlobeControls integrieren
- [ ] Render-Loop implementieren
- [ ] Prototyp testen (Gebäude sichtbar, Navigation)

### Session 2
- [ ] Terrain-Adapter auf Raycast umstellen
- [ ] Koordinaten-Sync neu implementieren
- [ ] Entity Renderer integrieren
- [ ] Routen-Visualisierung
- [ ] Click-Handler / Tower-Platzierung
- [ ] Alte Cesium-Komponenten entfernen
- [ ] Depth-Occlusion verifizieren
- [ ] Performance-Test
- [ ] Finaler Test aller Features
