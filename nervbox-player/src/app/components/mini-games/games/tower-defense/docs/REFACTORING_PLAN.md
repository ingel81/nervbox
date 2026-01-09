# Tower Defense Component - Refactoring Plan

**Stand:** 2026-01-09
**Branch:** `claude/refactoring-tower-defense-component-wm5WE`
**Ziel:** Komponente von 4098 Zeilen auf ~800-1000 Zeilen reduzieren

---

## Problem

Die `tower-defense.component.ts` ist mit **4098 Zeilen** viel zu groß und vereint zu viele Verantwortlichkeiten:

- 3D Engine Initialisierung
- Street & Path Management
- Location Management
- Tower Placement & Validation
- Marker Visualization
- Height Management
- Camera Controls
- UI State Management
- Preview Rendering
- Input Handling

Dies führt zu:
- Schlechter Wartbarkeit
- Schwieriger Testbarkeit
- Enger Kopplung
- Überlappenden Verantwortlichkeiten

---

## Lösung: Service-Extraktion

Wir extrahieren **9 spezialisierte Services**, die jeweils eine klare Verantwortlichkeit haben.

### Neue Ordnerstruktur

```
tower-defense/
├── tower-defense.component.ts          # 800-1000 Zeilen (Orchestrierung)
│
├── services/
│   ├── osm-street.service.ts           # ✓ Existiert bereits
│   ├── entity-pool.service.ts          # ✓ Existiert bereits
│   ├── model-preview.service.ts        # ✓ Existiert bereits
│   ├── geocoding.service.ts            # ✓ Existiert bereits
│   │
│   ├── path-route.service.ts           # NEU - Pfad-Caching & Route-Visualisierung
│   ├── location-management.service.ts  # NEU - Location CRUD & Persistence
│   ├── tower-placement.service.ts      # NEU - Build Mode & Validation
│   ├── marker-visualization.service.ts # NEU - 3D Marker Factory
│   ├── height-update.service.ts        # NEU - Height Updates & Stabilisierung
│   ├── engine-initialization.service.ts# NEU - Loading Steps Orchestration
│   ├── camera-control.service.ts       # NEU - Camera Position Management
│   ├── game-ui-state.service.ts        # NEU - UI State Signals
│   └── input-handler.service.ts        # NEU - Click/Pan Detection
│
├── managers/                            # ✓ Existiert bereits
│   ├── game-state.manager.ts
│   ├── enemy.manager.ts
│   ├── tower.manager.ts
│   ├── projectile.manager.ts
│   └── wave.manager.ts
│
├── three-engine/                        # ✓ Existiert bereits
├── entities/                            # ✓ Existiert bereits
├── game-components/                     # ✓ Existiert bereits
├── configs/                             # ✓ Existiert bereits
├── models/                              # ✓ Existiert bereits
├── components/                          # ✓ Existiert bereits
└── docs/
    ├── ARCHITECTURE.md
    ├── REFACTORING_PLAN.md             # Dieses Dokument
    └── ...
```

---

## Services im Detail

### 1. PathAndRouteService

**Verantwortung:** Pfad-Caching, Route-Visualisierung, Height Smoothing

```typescript
@Injectable({ providedIn: 'root' })
export class PathAndRouteService {
  // State
  private cachedPaths = new Map<string, GeoPosition[]>();
  private routeLines: THREE.Line[] = [];

  // Public API
  initialize(engine: ThreeTilesEngine, streetNetwork: StreetNetwork): void;

  // Pfad-Caching
  getCachedPath(spawnId: string): GeoPosition[] | undefined;
  cachePath(spawnId: string, path: GeoPosition[]): void;
  computeAndCachePath(from: GeoPosition, to: GeoPosition, spawnId: string): GeoPosition[];

  // Route-Visualisierung
  refreshRouteLines(spawnPoints: SpawnPoint[], baseCoords: GeoPosition, visible: boolean): void;
  clearRouteLines(): void;

  // Height Smoothing
  smoothPathHeights(points: THREE.Vector3[]): THREE.Vector3[];

  // Cleanup
  dispose(): void;
}
```

**Extrahiert aus Komponente:**
- `cachedPaths` Map
- `routeLines` Array
- `refreshRouteLines()` Methode
- `smoothPathHeights()` Methode

---

### 2. LocationManagementService

**Verantwortung:** Location CRUD, LocalStorage Persistence, Geocoding Integration

```typescript
export interface LocationConfig {
  center: { latitude: number; longitude: number; height: number };
  base: { latitude: number; longitude: number };
  spawnPoints: SpawnLocationConfig[];
}

@Injectable({ providedIn: 'root' })
export class LocationManagementService {
  // Signals
  readonly currentLocation = signal<LocationConfig | null>(null);
  readonly currentLocationName = computed(() => this.geocodeLocationName());

  // Public API
  initialize(geocodingService: GeocodingService): void;

  // Location CRUD
  loadLocation(config: LocationConfig): void;
  getDefaultLocation(): LocationConfig;
  resetToDefault(): void;

  // Persistence
  saveToStorage(config: LocationConfig): void;
  loadFromStorage(): LocationConfig | null;
  clearStorage(): void;

  // Geocoding
  private geocodeLocationName(): Promise<string>;
}
```

**Extrahiert aus Komponente:**
- `editableHqLocation`, `editableSpawnLocations` Signals
- `initializeEditableLocations()` Methode
- `saveLocationsToStorage()` / `loadLocationsFromStorage()` Methoden
- `currentLocationName` Computed Signal

---

### 3. TowerPlacementService

**Verantwortung:** Build Mode State, Placement Validation, Preview Mesh Management

```typescript
export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

@Injectable({ providedIn: 'root' })
export class TowerPlacementService {
  // State
  readonly buildMode = signal(false);
  readonly selectedTowerType = signal<TowerTypeId | null>(null);

  private buildPreviewMesh: THREE.Mesh | null = null;
  private lastPreviewValidation: boolean | null = null;

  // Public API
  initialize(
    engine: ThreeTilesEngine,
    streetNetwork: StreetNetwork,
    baseCoords: GeoPosition,
    spawnPoints: SpawnPoint[],
    towerManager: TowerManager
  ): void;

  // Build Mode
  toggleBuildMode(): void;
  selectTowerType(typeId: TowerTypeId | null): void;

  // Validation
  validatePosition(position: GeoPosition): ValidationResult;

  // Preview
  createPreview(): void;
  updatePreview(lat: number, lon: number): void;
  clearPreview(): void;

  // Placement
  placeTowerAt(lat: number, lon: number): Tower | null;

  // Cleanup
  dispose(): void;
}
```

**Extrahiert aus Komponente:**
- `buildMode`, `selectedTowerType` Signals
- `buildPreviewMesh`, `lastPreviewValidation` Properties
- `toggleBuildMode()`, `selectTowerType()` Methoden
- `validateTowerPosition()` (~70 Zeilen!)
- `createBuildPreview()`, `updatePreviewValidation()` Methoden
- `placeTower()` Methode

**Validation Rules:**
- Min. Abstand zu Straße: 10m
- Max. Abstand zu Straße: 50m
- Min. Abstand zu Basis: 30m
- Min. Abstand zu Spawn: 30m
- Min. Abstand zu anderen Towern: 20m

---

### 4. MarkerVisualizationService

**Verantwortung:** 3D Marker Factory, Spawn/Base/Debug Marker Creation

```typescript
export interface DiamondMarkerOptions {
  color: number;
  size?: number;
  showRings?: boolean;
  height?: number;
}

@Injectable({ providedIn: 'root' })
export class MarkerVisualizationService {
  private spawnMarkers: THREE.Group[] = [];
  private baseMarker: THREE.Group | null = null;
  private heightDebugGroup: THREE.Group | null = null;

  // Public API
  initialize(engine: ThreeTilesEngine): void;

  // Diamond Marker Factory
  createDiamondMarker(options: DiamondMarkerOptions): THREE.Group;
  disposeDiamondMarker(marker: THREE.Group): void;

  // Spawn Markers
  addSpawnMarker(spawnPoint: SpawnPoint): THREE.Group;
  removeSpawnMarker(spawnId: string): void;
  clearSpawnMarkers(): void;

  // Base Marker
  addBaseMarker(baseCoords: GeoPosition): void;
  removeBaseMarker(): void;

  // Height Debug Markers
  addHeightDebugMarker(position: THREE.Vector3, height: number | null, isHit: boolean): void;
  clearHeightDebugMarkers(): void;
  toggleHeightDebug(visible: boolean): void;

  // Cleanup
  dispose(): void;
}
```

**Extrahiert aus Komponente:**
- `spawnMarkers` Array
- `baseMarker`, `heightDebugGroup` Properties
- `createDiamondMarker()`, `disposeDiamondMarker()` Methoden
- `addSpawnPoint()`, `addBaseMarker()` Methoden
- `addHeightDebugMarker()`, `clearHeightDebugMarkers()` Methoden

---

### 5. HeightUpdateService

**Verantwortung:** Height Updates Scheduling, Stabilization Detection

```typescript
@Injectable({ providedIn: 'root' })
export class HeightUpdateService {
  // State
  readonly heightsLoading = signal(false);

  private heightUpdateIntervalId: ReturnType<typeof setInterval> | null = null;
  private heightStableResolve: (() => void) | null = null;

  // Public API
  initialize(engine: ThreeTilesEngine): void;

  // Scheduling
  scheduleOverlayHeightUpdate(
    markers: THREE.Group[],
    baseMarker: THREE.Group | null
  ): Promise<void>;

  stopHeightUpdates(): void;

  // Height Application
  updateMarkerHeight(marker: THREE.Group, lat: number, lon: number): boolean;
  updateAllMarkerHeights(markers: THREE.Group[]): void;

  // Cleanup
  dispose(): void;
}
```

**Extrahiert aus Komponente:**
- `heightsLoading` Signal
- `heightUpdateIntervalId`, `heightStableResolve` Properties
- `scheduleOverlayHeightUpdate()` Methode
- `updateMarkerHeights()` Methode
- `stopHeightUpdates()` Methode

**Stabilisierung:**
- Update-Interval: 500ms
- Stabilisiert wenn alle Marker 3x hintereinander stabile Höhe haben
- Loading-Indicator während Updates

---

### 6. EngineInitializationService

**Verantwortung:** Loading Steps Orchestration, Sequential Initialization

```typescript
export interface LoadingStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'done';
  detail?: string;
}

@Injectable({ providedIn: 'root' })
export class EngineInitializationService {
  // Signals
  readonly loading = signal(true);
  readonly loadingStatus = signal('');
  readonly loadingSteps = signal<LoadingStep[]>([]);
  readonly tilesLoading = signal(true);
  readonly osmLoading = signal(true);

  // Public API
  async initializeEngine(
    container: HTMLElement,
    centerCoords: GeoPosition,
    config: EngineInitConfig
  ): Promise<ThreeTilesEngine>;

  // Step Management
  setStepActive(stepId: string): void;
  setStepDone(stepId: string, detail?: string): void;
  resetSteps(): void;

  // Callbacks
  onTilesLoaded(): void;
  onOsmLoaded(): void;
}
```

**Extrahiert aus Komponente:**
- `loading`, `loadingStatus`, `loadingSteps` Signals
- `tilesLoading`, `osmLoading` Signals
- `initEngine()` Methode (~140 Zeilen!)
- `setStepActive()`, `setStepDone()` Methoden
- `resetLoadingSteps()` Methode
- `checkAllLoaded()` Methode

**Loading Steps:**
1. Initialize 3D Engine
2. Load 3D Tiles
3. Load Street Network
4. Stabilize Heights
5. Setup Interactions
6. Ready

---

### 7. CameraControlService

**Verantwortung:** Camera Position Management, Fly-To Animations, Reset

```typescript
@Injectable({ providedIn: 'root' })
export class CameraControlService {
  private initialCameraPosition: { x: number; y: number; z: number } | null = null;

  // Public API
  initialize(engine: ThreeTilesEngine): void;

  // Position Management
  saveInitialPosition(): void;
  resetCamera(): void;

  // Fly-To Animations
  flyToLocation(lat: number, lon: number, height?: number, duration?: number): Promise<void>;
  flyToCenter(centerCoords: GeoPosition): Promise<void>;

  // Debug
  logCameraPosition(): void;
}
```

**Extrahiert aus Komponente:**
- `initialCameraPosition` Property
- `resetCamera()` Methode
- `flyToCenter()` Methode (aktuell inline in openLocationDialog)
- `logCameraPosition()` Methode

---

### 8. GameUIStateService

**Verantwortung:** UI State Signals, Layer Toggles, Menu States

```typescript
@Injectable({ providedIn: 'root' })
export class GameUIStateService {
  // Debug & Menus
  readonly debugMode = signal(false);
  readonly layerMenuExpanded = signal(false);
  readonly devMenuExpanded = signal(false);

  // Layer Visibility
  readonly streetsVisible = signal(false);
  readonly routesVisible = signal(false);
  readonly towerDebugVisible = signal(false);
  readonly heightDebugVisible = signal(false);

  // Stats
  readonly fps = signal(0);
  readonly tileStats = signal({ geometryMemory: 0, loaded: 0, downloading: 0, parsing: 0 });

  // Debug Log
  readonly debugLog = signal<string[]>([]);

  // Public API
  toggleDebug(): void;
  toggleLayerMenu(): void;
  toggleDevMenu(): void;

  toggleStreets(): void;
  toggleRoutes(): void;
  toggleTowerDebug(): void;
  toggleHeightDebug(): void;

  updateFps(fps: number): void;
  updateTileStats(stats: any): void;

  appendDebugLog(message: string): void;
  clearDebugLog(): void;
}
```

**Extrahiert aus Komponente:**
- Alle UI State Signals (debugMode, layerMenuExpanded, etc.)
- `fps`, `tileStats` Signals
- `debugLog` Signal
- Toggle-Methoden (toggleDebug, toggleStreets, etc.)
- Debug-Log Methoden

---

### 9. InputHandlerService

**Verantwortung:** Click vs Pan Detection, Mouse Event Management, Raycasting

```typescript
export interface ClickEvent {
  lat: number;
  lon: number;
  screenX: number;
  screenY: number;
}

@Injectable({ providedIn: 'root' })
export class InputHandlerService {
  private mouseDownPos: { x: number; y: number } | null = null;
  private readonly PAN_THRESHOLD_PX = 10;

  // Public API
  initialize(
    engine: ThreeTilesEngine,
    canvas: HTMLCanvasElement,
    onClick: (event: ClickEvent) => void
  ): void;

  // Click Detection
  private onPointerDown(event: PointerEvent): void;
  private onPointerUp(event: PointerEvent): void;

  // Raycasting
  raycastTerrain(screenX: number, screenY: number): { lat: number; lon: number } | null;

  // Cleanup
  dispose(): void;
}
```

**Extrahiert aus Komponente:**
- `mouseDownPos` Property
- `PAN_THRESHOLD_PX` Konstante
- `setupClickHandler()` Methode (~100 Zeilen!)
- Pan vs Click Detection Logic
- Raycasting Logic

---

## Komponente nach Refactoring

Die `tower-defense.component.ts` wird auf **~800-1000 Zeilen** reduziert und fokussiert sich auf:

### Hauptverantwortlichkeiten

1. **Template Binding** - UI bindet an Service Signals
2. **Lifecycle Orchestration** - ngOnInit, ngAfterViewInit, ngOnDestroy
3. **Service Koordination** - Services delegieren Arbeit
4. **Game Loop** - requestAnimationFrame tick()
5. **Event Handling** - User Interaktionen an Services delegieren

### Komponenten-Struktur

```typescript
@Component({ /* ... */ })
export class TowerDefenseComponent implements OnInit, AfterViewInit, OnDestroy {
  // ========================================
  // INJECTED SERVICES
  // ========================================

  // Game Managers (existierend)
  private readonly gameState = inject(GameStateManager);

  // Existing Services
  private readonly osmService = inject(OsmStreetService);
  private readonly modelPreview = inject(ModelPreviewService);
  private readonly geocoding = inject(GeocodingService);

  // NEW Services
  private readonly pathRoute = inject(PathAndRouteService);
  private readonly locationMgmt = inject(LocationManagementService);
  private readonly towerPlacement = inject(TowerPlacementService);
  private readonly markerViz = inject(MarkerVisualizationService);
  private readonly heightUpdate = inject(HeightUpdateService);
  private readonly engineInit = inject(EngineInitializationService);
  private readonly cameraControl = inject(CameraControlService);
  private readonly uiState = inject(GameUIStateService);
  private readonly inputHandler = inject(InputHandlerService);

  // ========================================
  // COMPONENT STATE
  // ========================================

  private engine: ThreeTilesEngine | null = null;
  private streetNetwork: StreetNetwork | null = null;
  private animationFrameId: number | null = null;

  // ========================================
  // SIGNALS (from Services)
  // ========================================

  // UI State (from GameUIStateService)
  readonly loading = this.uiState.loading;
  readonly debugMode = this.uiState.debugMode;
  readonly fps = this.uiState.fps;
  // ... etc

  // Build Mode (from TowerPlacementService)
  readonly buildMode = this.towerPlacement.buildMode;
  readonly selectedTowerType = this.towerPlacement.selectedTowerType;

  // Location (from LocationManagementService)
  readonly currentLocation = this.locationMgmt.currentLocation;
  readonly currentLocationName = this.locationMgmt.currentLocationName;

  // ========================================
  // LIFECYCLE
  // ========================================

  async ngOnInit() {
    // Initialize location management
    this.locationMgmt.initialize(this.geocoding);
    this.locationMgmt.loadFromStorage();
  }

  async ngAfterViewInit() {
    // Initialize engine via service
    this.engine = await this.engineInit.initializeEngine(
      this.canvasContainer.nativeElement,
      this.locationMgmt.currentLocation()!.center,
      { /* config */ }
    );

    // Initialize all services
    this.pathRoute.initialize(this.engine, this.streetNetwork);
    this.towerPlacement.initialize(this.engine, this.streetNetwork, /* ... */);
    this.markerViz.initialize(this.engine);
    this.cameraControl.initialize(this.engine);
    this.inputHandler.initialize(this.engine, canvas, this.onTerrainClick.bind(this));

    // Initialize previews
    await this.initPreviews();

    // Start game loop
    this.tick();
  }

  ngOnDestroy() {
    // Cleanup all services
    this.pathRoute.dispose();
    this.towerPlacement.dispose();
    this.markerViz.dispose();
    this.inputHandler.dispose();

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  // ========================================
  // GAME LOOP
  // ========================================

  private tick(): void {
    this.animationFrameId = requestAnimationFrame(() => this.tick());

    const currentTime = performance.now();
    this.gameState.update(currentTime);

    if (this.engine) {
      this.engine.update();
      this.uiState.updateFps(this.engine.getFps());
      this.uiState.updateTileStats(this.engine.getTileStats());
    }
  }

  // ========================================
  // EVENT HANDLERS (delegating to services)
  // ========================================

  toggleBuildMode(): void {
    this.towerPlacement.toggleBuildMode();
  }

  selectTowerType(typeId: TowerTypeId): void {
    this.towerPlacement.selectTowerType(typeId);
  }

  onTerrainClick(event: ClickEvent): void {
    if (this.buildMode()) {
      this.towerPlacement.placeTowerAt(event.lat, event.lon);
    }
  }

  resetCamera(): void {
    this.cameraControl.resetCamera();
  }

  openLocationDialog(): void {
    // Dialog handling
    const dialogRef = this.dialog.open(LocationDialogComponent, { /* ... */ });
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.locationMgmt.loadLocation(result);
        this.cameraControl.flyToCenter(result.center);
      }
    });
  }

  // ... weitere Event Handler (alle delegieren an Services)
}
```

**Größe:** ~800-1000 Zeilen (Reduktion um ~75%)

---

## Implementierungsplan

### Phase 1: Preparation (Setup)

- [x] Branch erstellen: `claude/refactoring-tower-defense-component-wm5WE`
- [x] Dokumentation schreiben: `docs/REFACTORING_PLAN.md`
- [ ] Unit Test Setup für neue Services

### Phase 2: Service Extraction (Reihenfolge wichtig!)

**Reihenfolge nach Abhängigkeiten:**

1. **GameUIStateService** (keine Abhängigkeiten)
   - Einfachste Extraktion
   - Nur Signals und Toggle-Methoden

2. **CameraControlService** (nur Engine-Abhängigkeit)
   - Straightforward
   - Klare API

3. **MarkerVisualizationService** (Engine + UIState)
   - Diamond Marker Factory
   - Spawn/Base/Debug Markers

4. **HeightUpdateService** (Engine + Markers)
   - Braucht MarkerVisualizationService

5. **PathAndRouteService** (Engine + StreetNetwork)
   - Eigenständig
   - Cache-Logik

6. **LocationManagementService** (Geocoding)
   - Eigenständig
   - LocalStorage

7. **InputHandlerService** (Engine)
   - Click/Pan Detection

8. **TowerPlacementService** (viele Abhängigkeiten)
   - Braucht: Engine, StreetNetwork, PathRoute, Markers, TowerManager
   - Komplex wegen Validation

9. **EngineInitializationService** (orchestriert andere Services)
   - Als letztes, da es andere Services nutzt

### Phase 3: Component Refactoring

1. Injiziere alle neuen Services
2. Ersetze direkte Aufrufe durch Service-Delegation
3. Entferne extrahierte Properties/Methoden
4. Update Template Bindings

### Phase 4: Testing & Cleanup

1. Integration Tests
2. Code Review
3. Dokumentation Update
4. Commit & Push

---

## Breaking Changes

**Keine!** Dies ist ein internes Refactoring. Die öffentliche API der Komponente bleibt gleich.

- Template bleibt unverändert
- Öffentliche Methoden bleiben (delegieren nur)
- Signals bleiben verfügbar (proxied von Services)

---

## Vorteile

### Wartbarkeit

- Jeder Service hat eine klare Verantwortung
- Einfacher zu verstehen und zu ändern
- Bessere Code-Organisation

### Testbarkeit

- Services können isoliert getestet werden
- Mocking ist einfacher
- Unit Tests für einzelne Concerns

### Wiederverwendbarkeit

- Services können in anderen Komponenten genutzt werden
- Z.B. `CameraControlService` in anderen 3D-Spielen

### Performance

- Keine Performance-Einbußen
- Gleiche Struktur, nur besser organisiert
- Angular DI ist optimiert

---

## Risiken & Mitigation

### Risiko: Zu viele Services

**Mitigation:** Jeder Service hat klare Verantwortung, wird nur bei Bedarf injiziert

### Risiko: Service-Abhängigkeiten

**Mitigation:** Dependency Injection Tree beachten, Circular Dependencies vermeiden

### Risiko: Regression Bugs

**Mitigation:** Schrittweise Extraktion, Tests nach jedem Service, Feature-Testing

---

## Nächste Schritte

1. Review dieses Plans
2. Beginne mit Phase 2: Service Extraction
3. Start mit `GameUIStateService` (einfachster Service)

---

**Status:** ✅ Plan erstellt, bereit für Implementierung
