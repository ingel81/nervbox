# Tower Defense - Three.js Rendering Engine Migration

## Executive Summary

Migration des Tower Defense Spiels von Cesium Entity/Primitive Rendering zu einer **Three.js Overlay Architektur** für verbesserte Performance bei 1000+ Entities.

### Entscheidungen
| Aspekt | Entscheidung |
|--------|--------------|
| Rendering Engine | Three.js Overlay über Cesium |
| Cesium Rolle | Nur Terrain & Google 3D Tiles |
| 3D Modelle | Bestehende GLBs (zombie_alternative.glb, etc.) |
| Plattform | Desktop only |
| Entity Skalierung | Variable (100 - 2000+) |
| Cesium Fallback | Nein - komplette Migration |

---

## 1. Architektur

### 1.1 Canvas-Stack

```
┌─────────────────────────────────────────────────────────────┐
│  Three.js Canvas                                            │
│  ├─ z-index: 10                                             │
│  ├─ pointer-events: none                                    │
│  ├─ position: absolute                                      │
│  └─ background: transparent                                 │
├─────────────────────────────────────────────────────────────┤
│  Cesium Canvas                                              │
│  ├─ z-index: 0                                              │
│  └─ pointer-events: auto (Kamera-Kontrolle)                 │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Verantwortlichkeiten

| Layer | Komponenten |
|-------|-------------|
| **Three.js** | Zombies, Türme, Projektile, Health Bars, Partikel-Effekte |
| **Cesium** | Google Photorealistic 3D Tiles, Terrain, Straßen-Overlay |

### 1.3 Render Pipeline

```typescript
function gameLoop() {
  requestAnimationFrame(gameLoop);

  // 1. Game Logic Update
  gameStateManager.update(deltaTime);

  // 2. Cesium Render (Terrain, 3D Tiles)
  cesiumViewer.render();

  // 3. Kamera Synchronisation
  cesiumThreeSync.syncCamera();

  // 4. Three.js Render (Entities, Effects)
  threeRenderer.render(threeScene, threeCamera);
}
```

---

## 2. Kamera-Synchronisation

### 2.1 Prinzip

Cesium's Kamera wird vom User gesteuert. Three.js Kamera folgt exakt der Cesium Kamera.

### 2.2 Implementation

```typescript
class CesiumThreeSync {
  private cesiumViewer: Cesium.Viewer;
  private threeCamera: THREE.PerspectiveCamera;
  private origin: Cesium.Cartesian3;  // Spielfeld-Zentrum in ECEF
  private enuMatrix: Cesium.Matrix4;  // East-North-Up Transformation

  constructor(cesiumViewer: Cesium.Viewer, originLat: number, originLon: number) {
    this.cesiumViewer = cesiumViewer;
    this.origin = Cesium.Cartesian3.fromDegrees(originLon, originLat, 0);
    this.enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(this.origin);

    // Three.js Kamera Setup
    this.threeCamera = new THREE.PerspectiveCamera(
      60,                    // FOV - wird dynamisch angepasst
      window.innerWidth / window.innerHeight,
      0.1,
      10_000_000            // Sehr große Far-Plane für Cesium-Skala
    );
    this.threeCamera.matrixAutoUpdate = false;  // Manuelle Matrix-Kontrolle!
  }

  syncCamera(): void {
    const cesiumCamera = this.cesiumViewer.camera;

    // Cesium Inverse View Matrix → Three.js World Matrix
    const civm = cesiumCamera.inverseViewMatrix;

    this.threeCamera.matrixWorld.set(
      civm[0], civm[4], civm[8],  civm[12],
      civm[1], civm[5], civm[9],  civm[13],
      civm[2], civm[6], civm[10], civm[14],
      civm[3], civm[7], civm[11], civm[15]
    );

    this.threeCamera.matrixWorldInverse.copy(this.threeCamera.matrixWorld).invert();

    // Projektion von Cesium übernehmen
    const frustum = cesiumCamera.frustum as Cesium.PerspectiveFrustum;
    this.threeCamera.fov = Cesium.Math.toDegrees(frustum.fovy);
    this.threeCamera.aspect = frustum.aspectRatio;
    this.threeCamera.near = frustum.near;
    this.threeCamera.far = frustum.far;
    this.threeCamera.updateProjectionMatrix();
  }
}
```

### 2.3 Koordinaten-Transformation

```typescript
// WGS84 (lat/lon) → lokale Three.js Koordinaten (Meter, relativ zum Spielfeld-Zentrum)
geoToLocal(lat: number, lon: number, height: number): THREE.Vector3 {
  const cartesian = Cesium.Cartesian3.fromDegrees(lon, lat, height);
  const local = Cesium.Matrix4.multiplyByPoint(
    this.inverseEnuMatrix,
    cartesian,
    new Cesium.Cartesian3()
  );
  // ENU (East-North-Up) → Three.js (X-right, Y-up, Z-back)
  return new THREE.Vector3(local.x, local.z, -local.y);
}

// Three.js lokal → WGS84
localToGeo(vec: THREE.Vector3): { lat: number; lon: number; height: number } {
  // Three.js → ENU
  const enu = new Cesium.Cartesian3(vec.x, -vec.z, vec.y);
  const ecef = Cesium.Matrix4.multiplyByPoint(this.enuMatrix, enu, new Cesium.Cartesian3());
  const cartographic = Cesium.Cartographic.fromCartesian(ecef);
  return {
    lat: Cesium.Math.toDegrees(cartographic.latitude),
    lon: Cesium.Math.toDegrees(cartographic.longitude),
    height: cartographic.height,
  };
}
```

---

## 3. Terrain-Integration

### 3.1 Height Queries

```typescript
class TerrainAdapter {
  private cesiumViewer: Cesium.Viewer;
  private heightCache = new Map<string, number>();

  // Terrain-Höhe für Position abfragen
  async getHeight(lat: number, lon: number): Promise<number> {
    const key = `${lat.toFixed(5)}_${lon.toFixed(5)}`;
    if (this.heightCache.has(key)) {
      return this.heightCache.get(key)!;
    }

    const positions = [Cesium.Cartographic.fromDegrees(lon, lat)];
    const sampled = await Cesium.sampleTerrainMostDetailed(
      this.cesiumViewer.terrainProvider,
      positions
    );
    const height = sampled[0].height ?? 0;
    this.heightCache.set(key, height);
    return height;
  }

  // Batch-Query für Pfade (effizienter)
  async preloadHeightsForPath(path: GeoPosition[]): Promise<void> {
    const positions = path.map(p => Cesium.Cartographic.fromDegrees(p.lon, p.lat));
    const sampled = await Cesium.sampleTerrainMostDetailed(
      this.cesiumViewer.terrainProvider,
      positions
    );
    sampled.forEach((s, i) => {
      const key = `${path[i].lat.toFixed(5)}_${path[i].lon.toFixed(5)}`;
      this.heightCache.set(key, s.height ?? 0);
    });
  }

  // Raycast gegen Terrain (für Tower-Platzierung)
  raycastTerrain(screenX: number, screenY: number): THREE.Vector3 | null {
    const ray = this.cesiumViewer.camera.getPickRay(new Cesium.Cartesian2(screenX, screenY));
    if (!ray) return null;

    const intersection = this.cesiumViewer.scene.globe.pick(ray, this.cesiumViewer.scene);
    if (!intersection) return null;

    const cartographic = Cesium.Cartographic.fromCartesian(intersection);
    return this.geoToLocal(
      Cesium.Math.toDegrees(cartographic.latitude),
      Cesium.Math.toDegrees(cartographic.longitude),
      cartographic.height
    );
  }
}
```

---

## 4. GPU-Instancing System

### 4.1 InstancedEntityManager

```typescript
class InstancedEntityManager<T extends { id: string }> {
  private mesh: THREE.InstancedMesh;
  private entities = new Map<string, { index: number; data: T }>();
  private freeIndices: number[] = [];
  private maxInstances: number;
  private tempMatrix = new THREE.Matrix4();
  private tempPosition = new THREE.Vector3();
  private tempQuaternion = new THREE.Quaternion();
  private tempScale = new THREE.Vector3(1, 1, 1);

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    maxInstances: number
  ) {
    this.maxInstances = maxInstances;
    this.mesh = new THREE.InstancedMesh(geometry, material, maxInstances);
    this.mesh.count = 0;  // Start mit 0 sichtbaren Instanzen
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Alle Indizes als frei markieren
    for (let i = maxInstances - 1; i >= 0; i--) {
      this.freeIndices.push(i);
    }
  }

  add(entity: T, position: THREE.Vector3, rotation: THREE.Euler): number {
    if (this.freeIndices.length === 0) {
      console.warn('InstancedEntityManager: Max instances reached');
      return -1;
    }

    const index = this.freeIndices.pop()!;
    this.entities.set(entity.id, { index, data: entity });

    this.updateInstance(index, position, rotation);
    this.mesh.count = Math.max(this.mesh.count, index + 1);

    return index;
  }

  update(id: string, position: THREE.Vector3, rotation: THREE.Euler): void {
    const entry = this.entities.get(id);
    if (!entry) return;
    this.updateInstance(entry.index, position, rotation);
  }

  remove(id: string): void {
    const entry = this.entities.get(id);
    if (!entry) return;

    // Instanz unsichtbar machen (scale 0)
    this.tempMatrix.makeScale(0, 0, 0);
    this.mesh.setMatrixAt(entry.index, this.tempMatrix);

    this.freeIndices.push(entry.index);
    this.entities.delete(id);
  }

  private updateInstance(index: number, position: THREE.Vector3, rotation: THREE.Euler): void {
    this.tempQuaternion.setFromEuler(rotation);
    this.tempMatrix.compose(position, this.tempQuaternion, this.tempScale);
    this.mesh.setMatrixAt(index, this.tempMatrix);
  }

  // Am Ende jedes Frames aufrufen!
  commitToGPU(): void {
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  get instancedMesh(): THREE.InstancedMesh {
    return this.mesh;
  }

  get count(): number {
    return this.entities.size;
  }
}
```

### 4.2 Performance-Targets

| Entity-Typ | Max Instanzen | Draw Calls | GPU Memory |
|------------|---------------|------------|------------|
| Zombies | 2000 | 1 | ~80 MB |
| Türme | 200 | 1 | ~20 MB |
| Projektile | 1000 | 1 | ~10 MB |
| Health Bars | 2000 | 1 (Sprites) | ~5 MB |
| Partikel | 10000 | 1 | ~20 MB |

---

## 5. Animation mit Instancing

### 5.1 Problem

Standard `THREE.SkinnedMesh` funktioniert nicht mit `THREE.InstancedMesh` - jedes SkinnedMesh braucht eigene Bone-Berechnungen.

### 5.2 Lösung: Hybrid LOD System

```
┌─────────────────────────────────────────────────────────────┐
│  LOD 0: Distanz < 50m (max ~50 Entities)                    │
│  ├─ Einzelne SkinnedMesh pro Entity                         │
│  ├─ Volle Skelett-Animation (30 FPS)                        │
│  └─ AnimationMixer pro Mesh                                 │
├─────────────────────────────────────────────────────────────┤
│  LOD 1: Distanz 50-150m (bulk)                              │
│  ├─ InstancedMesh mit Vertex Animation Texture (VAT)        │
│  ├─ 8-16 vorberechnete Frames                               │
│  └─ Animation-Offset per Instance Attribute                 │
├─────────────────────────────────────────────────────────────┤
│  LOD 2: Distanz > 150m (bulk)                               │
│  ├─ InstancedMesh statisch oder Billboard                   │
│  ├─ Keine Animation (kaum sichtbar)                         │
│  └─ Maximale Performance                                    │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Vertex Animation Texture (VAT) Baking

```typescript
// Vorberechnung beim App-Start oder Build-Time
function bakeAnimationToVAT(
  skinnedMesh: THREE.SkinnedMesh,
  animationClip: THREE.AnimationClip,
  frameCount: number
): THREE.DataTexture {
  const geometry = skinnedMesh.geometry;
  const vertexCount = geometry.attributes.position.count;

  // Texture: Width = VertexCount, Height = FrameCount
  const data = new Float32Array(vertexCount * frameCount * 4); // RGBA

  const mixer = new THREE.AnimationMixer(skinnedMesh);
  const action = mixer.clipAction(animationClip);
  action.play();

  for (let frame = 0; frame < frameCount; frame++) {
    // Animation zu Frame-Zeit setzen
    const time = (frame / frameCount) * animationClip.duration;
    mixer.setTime(time);

    // Skeleton Update erzwingen
    skinnedMesh.skeleton.update();

    // Vertex-Positionen nach Skinning auslesen
    const positionAttribute = geometry.attributes.position;
    const skinIndices = geometry.attributes.skinIndex;
    const skinWeights = geometry.attributes.skinWeight;

    for (let v = 0; v < vertexCount; v++) {
      const skinnedPosition = computeSkinnedVertex(
        positionAttribute, skinIndices, skinWeights,
        skinnedMesh.skeleton, v
      );

      const offset = (frame * vertexCount + v) * 4;
      data[offset + 0] = skinnedPosition.x;
      data[offset + 1] = skinnedPosition.y;
      data[offset + 2] = skinnedPosition.z;
      data[offset + 3] = 1.0;
    }
  }

  const texture = new THREE.DataTexture(
    data, vertexCount, frameCount,
    THREE.RGBAFormat, THREE.FloatType
  );
  texture.needsUpdate = true;
  return texture;
}
```

---

## 6. Depth Buffer Integration

### 6.1 Problem

Cesium und Three.js haben separate Depth-Buffer → Z-Fighting zwischen 3D Tiles und Game-Entities möglich.

### 6.2 Lösung: Logarithmischer Depth Buffer

```typescript
// Three.js Renderer Setup
const threeRenderer = new THREE.WebGLRenderer({
  canvas: threeCanvas,
  alpha: true,
  antialias: true,
  logarithmicDepthBuffer: true  // WICHTIG!
});

// Cesium hat logarithmicDepthBuffer seit v1.46 standardmäßig aktiviert
// Beide nutzen dieselbe mathematische Formel → kein Z-Fighting
```

### 6.3 Warum funktioniert das?

```
Linear Depth:    Präzision konzentriert sich nahe der Near-Plane
                 ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

Logarithmic:     Gleichmäßige Präzision über alle Distanzen
                 ████████████████████████████████████████████
```

- Cesium nutzt [Hybrid Multi-Frustum Logarithmic Depth](https://cesium.com/blog/2018/05/24/logarithmic-depth/)
- Three.js schreibt `gl_FragDepthEXT = log2(vFragDepth) * logDepthBufFC * 0.5`
- Beide verwenden dieselbe logarithmische Funktion

---

## 7. Datei-Struktur

### 7.1 Neue Dateien

```
tower-defense/
├── three-engine/
│   ├── td-three-engine.ts              # Haupt-Engine Klasse
│   ├── cesium-three-sync.ts            # Kamera + Koordinaten Sync
│   ├── terrain-adapter.ts              # Cesium Terrain API Wrapper
│   ├── instanced-entity-manager.ts     # GPU-Instancing System
│   ├── lod-manager.ts                  # LOD-Wechsel Logik
│   ├── vat-baker.ts                    # Vertex Animation Texture Generator
│   │
│   ├── renderers/
│   │   ├── three-enemy.renderer.ts     # Zombie Rendering (LOD)
│   │   ├── three-tower.renderer.ts     # Tower Rendering
│   │   ├── three-projectile.renderer.ts
│   │   ├── three-health-bar.renderer.ts
│   │   └── three-effects.renderer.ts   # Partikel, Blood, Fire
│   │
│   └── shaders/
│       ├── vat-animation.vert.glsl     # VAT Vertex Shader
│       └── vat-animation.frag.glsl     # VAT Fragment Shader
```

### 7.2 Zu modifizierende Dateien

| Datei | Änderungen |
|-------|------------|
| `tower-defense.component.ts` | Three.js Canvas Setup, Engine-Initialisierung |
| `game-components/render.component.ts` | Renderer-Backend Auswahl entfernen |
| `managers/game-state.manager.ts` | Three.js Engine Update-Loop |
| `managers/enemy.manager.ts` | Three.js Renderer statt Cesium |
| `managers/tower.manager.ts` | Three.js Renderer statt Cesium |
| `managers/projectile.manager.ts` | Three.js Renderer statt Cesium |

### 7.3 Zu löschende Dateien (nach Migration)

```
renderers/
├── enemy.renderer.ts         # → Ersetzt durch three-enemy.renderer.ts
├── tower.renderer.ts         # → Ersetzt durch three-tower.renderer.ts
├── projectile.renderer.ts    # → Ersetzt durch three-projectile.renderer.ts
├── blood.renderer.ts         # → Integriert in three-effects.renderer.ts
└── fire.renderer.ts          # → Integriert in three-effects.renderer.ts
```

---

## 8. Implementierungsplan

### Phase 1: Foundation (1 Woche)

**Ziel**: Three.js Canvas über Cesium, Kamera-Sync funktioniert

| Task | Beschreibung | Dateien |
|------|--------------|---------|
| 1.1 | Three.js Canvas Setup | `tower-defense.component.ts` |
| 1.2 | CesiumThreeSync Klasse | `three-engine/cesium-three-sync.ts` |
| 1.3 | TerrainAdapter Klasse | `three-engine/terrain-adapter.ts` |
| 1.4 | Basis TdThreeEngine | `three-engine/td-three-engine.ts` |
| 1.5 | Test: Cube an Geo-Position | - |

**Akzeptanzkriterien**:
- [ ] Three.js Canvas rendert über Cesium
- [ ] Kamera bewegt sich synchron
- [ ] Test-Objekt erscheint an korrekter Geo-Position
- [ ] Kein Z-Fighting sichtbar

### Phase 2: Entity Rendering (2 Wochen)

**Ziel**: Alle Entities in Three.js, 1000 Zombies @ 60 FPS

| Task | Beschreibung | Dateien |
|------|--------------|---------|
| 2.1 | InstancedEntityManager | `three-engine/instanced-entity-manager.ts` |
| 2.2 | ThreeEnemyRenderer (ohne Animation) | `three-engine/renderers/three-enemy.renderer.ts` |
| 2.3 | ThreeTowerRenderer | `three-engine/renderers/three-tower.renderer.ts` |
| 2.4 | ThreeProjectileRenderer | `three-engine/renderers/three-projectile.renderer.ts` |
| 2.5 | ThreeHealthBarRenderer | `three-engine/renderers/three-health-bar.renderer.ts` |
| 2.6 | Manager-Integration | `managers/*.manager.ts` |
| 2.7 | LOD Manager | `three-engine/lod-manager.ts` |
| 2.8 | VAT Baking | `three-engine/vat-baker.ts` |
| 2.9 | VAT Shader | `three-engine/shaders/vat-animation.*` |

**Akzeptanzkriterien**:
- [ ] 1000 Zombies spawnen und bewegen sich
- [ ] FPS bleibt > 55 bei 1000 Entities
- [ ] LOD-Wechsel funktioniert sichtbar
- [ ] Health Bars korrekt positioniert

### Phase 3: Effects & Polish (1 Woche)

**Ziel**: Vollständige visuelle Parität + Effekte

| Task | Beschreibung | Dateien |
|------|--------------|---------|
| 3.1 | Blood Splatter Partikel | `three-engine/renderers/three-effects.renderer.ts` |
| 3.2 | Fire/Smoke Partikel | `three-engine/renderers/three-effects.renderer.ts` |
| 3.3 | Tower Range Indicator | `three-engine/renderers/three-tower.renderer.ts` |
| 3.4 | Tower Selection Highlight | `three-engine/renderers/three-tower.renderer.ts` |
| 3.5 | Death Animation | `three-engine/renderers/three-enemy.renderer.ts` |

**Akzeptanzkriterien**:
- [ ] Blut-Effekte bei Treffer
- [ ] Feuer-Effekt bei Base-Damage
- [ ] Tower-Selection funktioniert
- [ ] Death-Animation spielt

### Phase 4: Integration & Cleanup (1 Woche)

**Ziel**: Alte Cesium-Renderer entfernen, Code aufräumen

| Task | Beschreibung | Dateien |
|------|--------------|---------|
| 4.1 | Alte Renderer entfernen | `renderers/*.ts` (löschen) |
| 4.2 | Cesium Entity-Code entfernen | `tower-defense.component.ts` |
| 4.3 | Performance-Profiling | - |
| 4.4 | Edge-Cases testen | - |
| 4.5 | Dokumentation | `docs/ARCHITECTURE.md` |

**Akzeptanzkriterien**:
- [ ] Keine Cesium Entities mehr verwendet
- [ ] Alle Tests bestehen
- [ ] Dokumentation aktualisiert

---

## 9. Risiken & Mitigationen

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|-------------------|--------|------------|
| Z-Fighting | Mittel | Hoch | Logarithmischer Depth Buffer + Testing |
| Kamera-Drift | Niedrig | Mittel | postRender Event statt RAF |
| VAT Performance | Mittel | Mittel | Fallback auf statische Instanzen |
| Mobile Performance | N/A | N/A | Scope: Nur Desktop |
| Terrain-Query Latency | Niedrig | Niedrig | Height-Cache + Batch-Queries |

---

## 10. Referenzen

### Offizielle Dokumentation
- [Cesium Blog: Integrating with Three.js](https://cesium.com/blog/2017/10/23/integrating-cesium-with-threejs/)
- [Cesium: Logarithmic Depth Buffer](https://cesium.com/blog/2018/05/24/logarithmic-depth/)
- [Three.js: InstancedMesh](https://threejs.org/docs/#api/en/objects/InstancedMesh)
- [Three.js: Logarithmic Depth Example](https://threejs.org/examples/webgl_camera_logarithmicdepthbuffer.html)

### Referenz-Projekte (nur Ideen, keine Libs!)
- [CesiumGS/cesium-threejs-experiment](https://github.com/CesiumGS/cesium-threejs-experiment)
- [leon-juenemann/cesiumjs-with-threejs](https://github.com/leon-juenemann/cesiumjs-with-threejs)
- [weijun-lab/three-to-cesium](https://github.com/weijun-lab/three-to-cesium)

### Im Projekt vorhanden
- `games/kayberg/engine/kayberg-engine.ts` - Three.js Engine Pattern
- `games/kayberg/engine/entities/` - Entity Pattern mit dispose()

---

## 11. Git Workflow

```bash
# Feature-Branch bereits erstellt
git checkout feature/threejs-rendering-engine

# Nach jeder Phase: Commit
git add .
git commit -m "feat(tower-defense): Phase X complete - [description]"

# Nach Abschluss: Merge
git checkout master
git merge feature/threejs-rendering-engine
git push origin master
```

---

*Dokument erstellt: 2026-01-07*
*Branch: feature/threejs-rendering-engine*
