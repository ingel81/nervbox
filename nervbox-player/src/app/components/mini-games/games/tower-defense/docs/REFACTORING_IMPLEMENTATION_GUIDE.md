# Tower Defense Component - Refactoring Implementation Guide

**Stand:** 2026-01-09
**Branch:** `claude/refactoring-tower-defense-component-wm5WE`
**Status:** Phase 1 abgeschlossen (3/9 Services erstellt)

---

## ✅ Abgeschlossene Services

### 1. GameUIStateService ✅
**Dateipfad:** `services/game-ui-state.service.ts`
**Zeilen:** 180

**Extrahierte Funktionalität:**
- UI State Signals: `debugMode`, `layerMenuExpanded`, `devMenuExpanded`
- Layer Visibility: `streetsVisible`, `routesVisible`, `towerDebugVisible`, `heightDebugVisible`
- Performance Stats: `fps`, `tileStats`
- Debug Log: `debugLog` (max 50 lines)

**Integration in Komponente:**
```typescript
// In tower-defense.component.ts

// Inject service
private readonly uiState = inject(GameUIStateService);

// Replace direct signals with service signals
readonly debugMode = this.uiState.debugMode;
readonly layerMenuExpanded = this.uiState.layerMenuExpanded;
readonly fps = this.uiState.fps;
// ... etc

// Replace toggle methods
toggleDebug(): void {
  this.uiState.toggleDebug();
}

toggleStreets(): void {
  this.uiState.toggleStreets();
  // Apply visibility to street lines
  for (const line of this.streetLines) {
    line.visible = this.uiState.streetsVisible();
  }
}
```

**Zu löschen aus Komponente:**
- Lines 1674-1680: Signal definitions
- Lines 1690, 1695-1696: debugLog, fps, tileStats signals
- Lines 3220-3230: toggleDebug, toggleLayerMenu, toggleDevMenu methods
- Lines 3323-3336: clearDebugLog, appendDebugLog methods

---

### 2. CameraControlService ✅
**Dateipfad:** `services/camera-control.service.ts`
**Zeilen:** 160

**Extrahierte Funktionalität:**
- Camera Position Management: `initialCameraPosition` storage
- Camera Reset: `resetCamera()` with fallback
- Fly-To Animations: `flyToCenter()`, `flyToLocation()`
- Debug: `logCameraPosition()`

**Integration in Komponente:**
```typescript
// Inject service
private readonly cameraControl = inject(CameraControlService);

// Initialize in ngAfterViewInit
this.cameraControl.initialize(this.engine, this.baseCoords());

// After engine initialization, save initial camera position
this.cameraControl.saveInitialPosition();

// Replace method calls
resetCamera(): void {
  this.cameraControl.resetCamera();
}

flyToCenter(): void {
  this.cameraControl.flyToCenter();
}

logCameraPosition(): void {
  this.cameraControl.logCameraPosition();
}
```

**Zu löschen aus Komponente:**
- Line 1763: `initialCameraPosition` property
- Lines 1992-1997, 3908-3913: initialCameraPosition assignments
- Lines 3172-3189: resetCamera method
- Lines 4074-4079: flyToCenter method
- Lines 3242-3260: logCameraPosition method

---

### 3. MarkerVisualizationService ✅
**Dateipfad:** `services/marker-visualization.service.ts`
**Zeilen:** 450

**Extrahierte Funktionalität:**
- Diamond Marker Factory: `createDiamondMarker()`, `disposeDiamondMarker()`
- Base Marker: `addBaseMarker()`, `removeBaseMarker()`
- Spawn Markers: `addSpawnMarker()`, `removeSpawnMarker()`, `clearSpawnMarkers()`
- Height Debug Markers: `addHeightDebugMarker()`, `clearHeightDebugMarkers()`, `toggleHeightDebug()`

**SpawnPoint Interface:** Moved to service

**Integration in Komponente:**
```typescript
// Import SpawnPoint from service
import { MarkerVisualizationService, SpawnPoint } from './services/marker-visualization.service';

// Inject service
private readonly markerViz = inject(MarkerVisualizationService);

// Initialize in ngAfterViewInit
this.markerViz.initialize(this.engine, this.baseCoords(), this.uiState.heightDebugVisible);

// Replace method calls
addBaseMarker(): void {
  this.markerViz.addBaseMarker();
}

addSpawnPoint(id: string, name: string, lat: number, lon: number, color: number): void {
  const spawn: SpawnPoint = { id, name, latitude: lat, longitude: lon, color };
  this.spawnPoints.update((points) => [...points, spawn]);

  const marker = this.markerViz.addSpawnMarker(id, name, lat, lon, color);

  // Continue with path visualization
  this.showPathFromSpawn(spawn);
}

toggleHeightDebug(): void {
  this.uiState.toggleHeightDebug();
  this.markerViz.toggleHeightDebug(this.uiState.heightDebugVisible());
}
```

**Zu löschen aus Komponente:**
- Lines 75-81: SpawnPoint interface (now in service)
- Lines 1651-1654: spawnMarkers, baseMarker, heightDebugGroup properties
- Lines 2509-2598: createDiamondMarker method
- Lines 2603-2615: disposeDiamondMarker method
- Lines 2617-2643: addBaseMarker method
- Lines 2355-2383: addHeightDebugMarker method
- Lines 2388-2407: clearHeightDebugMarkers method
- Parts of Lines 2409-2414: toggleHeightDebug method (visibility toggle stays)

---

## 🚧 Ausstehende Services

### 4. PathAndRouteService (noch zu erstellen)
**Geschätzte Zeilen:** ~400

**Zu extrahierende Funktionalität:**
- `cachedPaths` Map
- `routeLines` Array
- `refreshRouteLines()` method
- `showPathFromSpawn()` method (~140 lines!)
- `smoothPathHeights()` method
- `closestPointOnSegment()` method
- `extendPathToOptimalTurnoff()` method
- `snapSpawnMarkerToPathStart()` method

**Abhängigkeiten:**
- `OsmStreetService`
- `StreetNetwork`
- `ThreeTilesEngine`
- `MarkerVisualizationService` (für Spawn Markers)
- `GameUIStateService` (für routesVisible)

---

### 5. LocationManagementService (noch zu erstellen)
**Geschätzte Zeilen:** ~250

**Zu extrahierende Funktionalität:**
- `editableHqLocation` signal
- `editableSpawnLocations` signal
- `currentLocationName` computed signal
- `initializeEditableLocations()` method
- `saveLocationsToStorage()` method
- `loadLocationsFromStorage()` method
- `openLocationDialog()` method
- `onResetLocations()` method

**Abhängigkeiten:**
- `GeocodingService`
- `MatDialog`

**LocalStorage Key:** `'td-custom-location'`

---

### 6. InputHandlerService (noch zu erstellen)
**Geschätzte Zeilen:** ~200

**Zu extrahierende Funktionalität:**
- `mouseDownPos` property
- `PAN_THRESHOLD_PX` constant (10px)
- `setupClickHandler()` method (~100 lines!)
- Click vs Pan detection
- Raycasting for terrain clicks
- Pointer event handlers

**Abhängigkeiten:**
- `ThreeTilesEngine`
- Canvas element

**Callback:** `onClick(event: ClickEvent)` passed from component

---

### 7. TowerPlacementService (noch zu erstellen)
**Geschätzte Zeilen:** ~400

**Zu extrahierende Funktionalität:**
- `buildMode` signal
- `selectedTowerType` signal
- `buildPreviewMesh` property
- `lastPreviewValidation` property
- `toggleBuildMode()` method
- `selectTowerType()` method
- `validateTowerPosition()` method (~70 lines!)
- `createBuildPreview()` method
- `updatePreviewValidation()` method
- `placeTower()` method

**Validation Constants:**
- `MIN_DISTANCE_TO_STREET = 10`
- `MAX_DISTANCE_TO_STREET = 50`
- `MIN_DISTANCE_TO_BASE = 30`
- `MIN_DISTANCE_TO_SPAWN = 30`

**Abhängigkeiten:**
- `ThreeTilesEngine`
- `StreetNetwork`
- `TowerManager`
- `GameStateManager`
- Base coords
- Spawn points

---

### 8. HeightUpdateService (noch zu erstellen)
**Geschätzte Zeilen:** ~300

**Zu extrahierende Funktionalität:**
- `heightsLoading` signal
- `heightProgress` signal
- `heightUpdateIntervalId` property
- `heightStableResolve` property
- `heightUpdateAttempts` property
- `overlayHeightsUpdated` flag
- `scheduleOverlayHeightUpdate()` method
- `updateMarkerHeights()` method
- `stopHeightUpdates()` method

**Abhängigkeiten:**
- `ThreeTilesEngine`
- `MarkerVisualizationService` (für Marker)
- `PathAndRouteService` (für renderStreets Callback)
- `EngineInitializationService` (für setStepDone)

**Update Interval:** 500ms
**Max Attempts:** 20 (10 seconds)
**Min Attempts:** 4 (2 seconds)

---

### 9. EngineInitializationService (noch zu erstellen)
**Geschätzte Zeilen:** ~350

**Zu extrahierende Funktionalität:**
- `loading` signal
- `loadingStatus` signal
- `loadingSteps` signal
- `tilesLoading` signal
- `osmLoading` signal
- `initEngine()` method (~140 lines!)
- `setStepActive()` method
- `setStepDone()` method
- `resetLoadingSteps()` method
- `checkAllLoaded()` method
- `onTilesLoaded()` callback
- `onEngineUpdate()` callback

**Loading Steps:**
1. Initialize 3D Engine
2. Load 3D Tiles
3. Load Street Network (OSM)
4. Stabilize Heights
5. Setup Interactions
6. Ready

**Abhängigkeiten:**
- `OsmStreetService`
- `PathAndRouteService`
- `MarkerVisualizationService`
- `HeightUpdateService`
- `InputHandlerService`
- All other services (orchestrates initialization)

---

## 📊 Aktuelle Bilanz

### Services Status

| Service | Status | Zeilen | Integration |
|---------|--------|--------|-------------|
| GameUIStateService | ✅ Erstellt | 180 | ⏳ Ausstehend |
| CameraControlService | ✅ Erstellt | 160 | ⏳ Ausstehend |
| MarkerVisualizationService | ✅ Erstellt | 450 | ⏳ Ausstehend |
| PathAndRouteService | ⏳ Ausstehend | ~400 | - |
| LocationManagementService | ⏳ Ausstehend | ~250 | - |
| InputHandlerService | ⏳ Ausstehend | ~200 | - |
| TowerPlacementService | ⏳ Ausstehend | ~400 | - |
| HeightUpdateService | ⏳ Ausstehend | ~300 | - |
| EngineInitializationService | ⏳ Ausstehend | ~350 | - |

**Gesamt extrahiert:** ~790 Zeilen
**Noch zu extrahieren:** ~1900 Zeilen
**Komponente aktuell:** 4098 Zeilen
**Komponente Ziel:** ~1400 Zeilen (nach Service-Extraktion, vor Template-Cleanup)

---

## 🎯 Nächste Schritte

### Phase 2: Service Completion (Priorität)
1. ✅ **PathAndRouteService** erstellen
2. ✅ **LocationManagementService** erstellen
3. ✅ **InputHandlerService** erstellen
4. **TowerPlacementService** erstellen
5. **HeightUpdateService** erstellen
6. **EngineInitializationService** erstellen

### Phase 3: Component Integration
1. Services in Komponente injizieren
2. Signal-Proxies erstellen
3. Methoden-Aufrufe delegieren
4. Alte Properties/Methoden löschen
5. Imports aktualisieren

### Phase 4: Testing & Cleanup
1. Build-Errors beheben
2. Runtime-Tests durchführen
3. Unused Code entfernen
4. Dokumentation aktualisieren

---

## ⚠️ Breaking Changes Vermeiden

**Wichtig:** Template bleibt unverändert!

Die Komponente muss ihre **öffentliche API** beibehalten:
- Alle Template-gebundenen Signals bleiben verfügbar (als Proxy zu Services)
- Alle Event-Handler Methoden bleiben verfügbar (delegieren zu Services)
- Keine Änderungen an `@Input()` oder `@Output()`

Beispiel:
```typescript
// FALSCH - bricht Template
// readonly debugMode = this.uiState.debugMode; // ❌ Template kann nicht binden

// RICHTIG - Template funktioniert weiter
readonly debugMode = computed(() => this.uiState.debugMode()); // ✅ oder:
readonly debugMode = this.uiState.debugMode; // ✅ direkt proxied (wenn WritableSignal)
```

---

## 📝 Commit-Strategie

**Schrittweise Commits:**
1. ✅ Services erstellen (ohne Integration)
2. Services in Komponente integrieren (Service-Gruppen)
3. Alte Code-Teile entfernen
4. Tests & Cleanup

**Commit-Messages:**
```
feat(td): extract UI state, camera, and marker services
feat(td): extract path, location, and input services
feat(td): extract tower placement and height update services
feat(td): extract engine initialization service
refactor(td): integrate all services into component
refactor(td): remove old code and cleanup
test(td): verify refactoring functionality
docs(td): update architecture documentation
```

---

## 🔍 Code Review Checklist

- [ ] Alle Services erstellt
- [ ] Services in Komponente injiziert
- [ ] Template funktioniert weiter
- [ ] Build erfolgreich
- [ ] Keine Linter-Fehler
- [ ] Game startet ohne Errors
- [ ] Alle Features funktionieren:
  - [ ] Location Dialog
  - [ ] Tower Placement
  - [ ] Wave Start
  - [ ] Camera Controls
  - [ ] Debug Panel
  - [ ] Layer Toggles
- [ ] Dokumentation aktualisiert

---

**Status:** 🟡 In Progress (3/9 Services fertig)
**Nächster Schritt:** PathAndRouteService erstellen
