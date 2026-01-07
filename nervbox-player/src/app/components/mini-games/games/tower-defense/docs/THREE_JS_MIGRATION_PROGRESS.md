# Tower Defense - Three.js Migration Progress

**Stand:** 2026-01-07
**Branch:** feature/threejs-rendering-engine

---

## Status-Übersicht

| Phase | Status | Beschreibung |
|-------|--------|--------------|
| Phase 1 | ✅ Abgeschlossen | Foundation (Canvas, Sync, Terrain, Engine) |
| Phase 2 | ✅ Abgeschlossen | Entity Renderers (Enemy, Tower, Projectile, Effects) |
| Phase 3 | ✅ Abgeschlossen | Manager-Migration (Hybrid-Modus) |
| Phase 4 | ⏳ Ausstehend | Alte Cesium Renderer entfernen |

---

## Phase 1: Foundation ✅

### Erstellte Dateien

| Datei | Beschreibung |
|-------|--------------|
| `three-engine/cesium-three-sync.ts` | Kamera-Synchronisation Cesium → Three.js |
| `three-engine/terrain-adapter.ts` | Terrain-Höhen Abfrage + Cache |
| `three-engine/td-three-engine.ts` | Haupt-Engine Klasse |
| `three-engine/index.ts` | Exports |

### Technische Details

- **Canvas-Stack**: Three.js Canvas über Cesium (z-index: 10)
- **Pointer-Events**: Three.js Canvas = none (Cesium behält Kamera-Kontrolle)
- **Depth Buffer**: Logarithmisch (für Cesium-Kompatibilität)
- **Koordinaten**: WGS84 ↔ lokale ENU-Koordinaten

---

## Phase 2: Entity Renderers ✅

### Erstellte Dateien

| Datei | Beschreibung |
|-------|--------------|
| `three-engine/instanced-entity-manager.ts` | GPU-Instancing System |
| `three-engine/renderers/three-enemy.renderer.ts` | GLB Models + Animationen |
| `three-engine/renderers/three-tower.renderer.ts` | Tower Models + Range/Selection |
| `three-engine/renderers/three-projectile.renderer.ts` | Projektile (Instanced) |
| `three-engine/renderers/three-effects.renderer.ts` | Partikel (Blood, Fire) |

### Features

- **EnemyRenderer**: GLTFLoader, AnimationMixer, Health Bars als Sprites
- **TowerRenderer**: Range-Indicator, Selection-Ring mit Pulse-Animation
- **ProjectileRenderer**: GPU-Instancing für Arrow/Cannonball/Magic
- **EffectsRenderer**: Partikel-Pools für Blood Splatter und Fire

---

## Phase 3: Manager-Migration ✅

### Modifizierte Dateien

| Datei | Änderungen |
|-------|------------|
| `managers/entity-manager.ts` | `threeEngine` Property, `useThreeJs` Getter |
| `managers/enemy.manager.ts` | `initializeWithCallbacks()`, Three.js Rendering |
| `managers/tower.manager.ts` | Three.js Integration in `placeTower()`, `selectTower()` |
| `managers/projectile.manager.ts` | `initializeWithCallbacks()`, Instanced Rendering |
| `managers/game-state.manager.ts` | Three.js Engine Weiterleitung, Effects Migration |
| `tower-defense.component.ts` | Canvas Setup, Engine Init, postRender Hook |

### Hybrid-Modus

```typescript
// Manager prüfen ob Three.js verfügbar ist
if (this.useThreeJs && this.threeEngine) {
  // Three.js Rendering
  this.threeEngine.enemies.create(...);
} else {
  // Cesium Fallback
  enemy.render.initialize(this.viewer, this.renderer, config);
}
```

---

## Phase 4: Cleanup (Ausstehend)

### Zu löschende Dateien

Nach erfolgreichem Test können diese Cesium-Renderer entfernt werden:

```
renderers/
├── enemy.renderer.ts         → Ersetzt durch three-enemy.renderer.ts
├── tower.renderer.ts         → Ersetzt durch three-tower.renderer.ts
├── projectile.renderer.ts    → Ersetzt durch three-projectile.renderer.ts
├── blood.renderer.ts         → Integriert in three-effects.renderer.ts
└── fire.renderer.ts          → Integriert in three-effects.renderer.ts
```

---

## Architektur

```
┌─────────────────────────────────────────────────────────────┐
│  Three.js Canvas (z-index: 10, pointer-events: none)        │
│  ├─ ThreeEnemyRenderer (GLB + AnimationMixer)               │
│  ├─ ThreeTowerRenderer (GLB + Range/Selection)              │
│  ├─ ThreeProjectileRenderer (InstancedMesh)                 │
│  └─ ThreeEffectsRenderer (Points + Particles)               │
├─────────────────────────────────────────────────────────────┤
│  Cesium Canvas (z-index: 0)                                 │
│  ├─ Google Photorealistic 3D Tiles                          │
│  ├─ Terrain                                                  │
│  └─ Kamera-Kontrolle                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Render Pipeline

```typescript
// Cesium postRender Hook
viewer.scene.postRender.addEventListener(() => {
  // 1. Kamera synchronisieren
  threeEngine.sync.syncCamera();

  // 2. Three.js rendern
  threeEngine.render();
});

// Game Loop
function gameLoop() {
  // 1. Game Logic
  gameState.update(deltaTime);

  // 2. Three.js Entity Updates
  threeEngine.update(deltaTime);

  // 3. Cesium requestRender
  viewer.scene.requestRender();
}
```

---

## Performance-Ziele

| Entity-Typ | Max Instanzen | Draw Calls | Status |
|------------|---------------|------------|--------|
| Zombies | 2000 | 1 (pro Typ) | ✅ Implementiert |
| Türme | 200 | 1 (pro Typ) | ✅ Implementiert |
| Projektile | 1000 | 3 (Arrow/Ball/Magic) | ✅ Implementiert |
| Partikel | 3000 | 2 (Blood/Fire) | ✅ Implementiert |

---

## Nächste Schritte

1. **Testen** - Spiel mit Three.js Rendering testen
2. **LOD-System** - VAT für ferne Entities (optional)
3. **Cleanup** - Alte Cesium Renderer entfernen
4. **Performance-Profiling** - 1000+ Entities testen

---

*Letzte Aktualisierung: 2026-01-07*
