# Tower Defense - OO Game Engine Architektur

## Übersicht

Component-basierte Game Engine Architektur für das Tower Defense Mini-Game.
Fokus auf Modularität, Wiederverwendbarkeit und klare Verantwortlichkeiten.

## Design Prinzipien

1. **Component-Based Architecture** - Flexibles GameObject-System mit austauschbaren Components
2. **Separation of Concerns** - Renderer bleiben getrennt von Game Logic
3. **Manager Pattern** - Spezialisierte Manager für Enemy, Tower, Projectile, Wave, Audio
4. **Single Responsibility** - Jede Klasse hat eine klare, fokussierte Aufgabe
5. **DRY** - Gemeinsame Funktionalität in Basisklassen

---

## 1. Core System: GameObject & Components

### 1.1 GameObject (Basis-Entity)

**Verantwortung:** Container für Components, gemeinsame Entity-Logik

```typescript
abstract class GameObject {
  readonly id: string;
  readonly type: GameObjectType; // 'enemy' | 'tower' | 'projectile'

  protected components = new Map<string, Component>();
  private _active = true;

  constructor(type: GameObjectType) {
    this.id = GameObject.generateId();
    this.type = type;
  }

  // Component Management
  addComponent<T extends Component>(component: T): T;
  getComponent<T extends Component>(type: ComponentType): T | null;
  hasComponent(type: ComponentType): boolean;
  removeComponent(type: ComponentType): void;

  // Lifecycle
  update(deltaTime: number): void; // Calls update on all components
  destroy(): void; // Cleanup

  get active(): boolean;
  set active(value: boolean);
}

type GameObjectType = 'enemy' | 'tower' | 'projectile';
```

### 1.2 Component (Abstract Base)

**Verantwortung:** Basis für alle Komponenten-Typen

```typescript
abstract class Component {
  protected gameObject: GameObject;
  enabled = true;

  constructor(gameObject: GameObject) {
    this.gameObject = gameObject;
  }

  abstract update(deltaTime: number): void;
  onDestroy(): void {} // Optional cleanup
}

enum ComponentType {
  TRANSFORM = 'transform',
  HEALTH = 'health',
  RENDER = 'render',
  AUDIO = 'audio',
  MOVEMENT = 'movement',
  COMBAT = 'combat',
  COLLISION = 'collision',
}
```

### 1.3 Konkrete Components

#### TransformComponent
```typescript
class TransformComponent extends Component {
  position: GeoPosition;
  rotation = 0; // Heading in radians
  scale = 1.0;
  terrainHeight = 235;

  setPosition(lat: number, lon: number, height?: number): void;
  getCartesian3(): Cesium.Cartesian3;
  lookAt(target: GeoPosition): void; // Berechnet rotation zu Target
}
```

#### HealthComponent
```typescript
class HealthComponent extends Component {
  private _hp: number;
  readonly maxHp: number;

  constructor(gameObject: GameObject, maxHp: number) {
    super(gameObject);
    this.maxHp = maxHp;
    this._hp = maxHp;
  }

  takeDamage(amount: number): boolean; // Returns true if dead
  heal(amount: number): void;

  get hp(): number;
  get healthPercent(): number;
  get isDead(): boolean;
}
```

#### RenderComponent
```typescript
class RenderComponent extends Component {
  entity: Cesium.Entity | null = null;
  model: Cesium.Model | null = null;
  additionalEntities: Cesium.Entity[] = []; // Health bars, range indicators, etc.

  private renderer: Renderer | null = null;

  initialize(viewer: Cesium.Viewer, renderer: Renderer, config: RenderConfig): void;
  show(): void;
  hide(): void;
  destroy(): void; // Delegates to renderer
}
```

#### AudioComponent
```typescript
class AudioComponent extends Component {
  private sounds = new Map<string, HTMLAudioElement>();
  private activeSounds = new Set<string>();

  registerSound(id: string, url: string, config?: AudioConfig): void;
  play(id: string, loop?: boolean): void;
  stop(id: string): void;
  stopAll(): void;
  setVolume(id: string, volume: number): void;

  update(deltaTime: number): void; // Distance-based volume
}

interface AudioConfig {
  volume?: number;
  loop?: boolean;
  spatial?: boolean; // Distance-based attenuation
}
```

#### MovementComponent
```typescript
class MovementComponent extends Component {
  speedMps: number; // Meters per second
  path: GeoPosition[] = [];
  currentIndex = 0;
  progress = 0; // 0-1 within current segment

  private segmentLengths: number[] = [];
  paused = false;

  setPath(path: GeoPosition[]): void; // Pre-computes segment lengths
  move(deltaTime: number): 'moving' | 'reached_end';
  pause(): void;
  resume(): void;

  getCurrentSegment(): { from: GeoPosition; to: GeoPosition };
  getNextWaypoint(): GeoPosition;
}
```

#### CombatComponent
```typescript
class CombatComponent extends Component {
  readonly damage: number;
  readonly range: number;
  readonly fireRate: number; // Shots per second

  private lastFireTime = 0;

  constructor(gameObject: GameObject, config: CombatConfig) {
    super(gameObject);
    this.damage = config.damage;
    this.range = config.range;
    this.fireRate = config.fireRate;
  }

  canFire(currentTime: number): boolean;
  fire(currentTime: number): void; // Updates lastFireTime
  isInRange(targetPosition: GeoPosition): boolean;
}

interface CombatConfig {
  damage: number;
  range: number;
  fireRate: number;
}
```

---

## 2. Entity Types (Specialized GameObjects)

### 2.1 Enemy

```typescript
class Enemy extends GameObject {
  readonly typeConfig: EnemyTypeConfig;

  // Component shortcuts (for convenience)
  private _transform: TransformComponent;
  private _health: HealthComponent;
  private _render: RenderComponent;
  private _movement: MovementComponent;
  private _audio: AudioComponent;

  constructor(typeId: EnemyTypeId, path: GeoPosition[], speedOverride?: number) {
    super('enemy');
    this.typeConfig = getEnemyType(typeId);

    // Add components
    this._transform = this.addComponent(new TransformComponent(this));
    this._health = this.addComponent(new HealthComponent(this, this.typeConfig.baseHp));
    this._render = this.addComponent(new RenderComponent(this));
    this._movement = this.addComponent(new MovementComponent(this));
    this._audio = this.addComponent(new AudioComponent(this));

    // Configure movement
    this._movement.setPath(path);
    this._movement.speedMps = speedOverride ?? this.typeConfig.baseSpeed;

    // Register sounds
    if (this.typeConfig.movingSound) {
      this._audio.registerSound('moving', this.typeConfig.movingSound, {
        volume: this.typeConfig.movingSoundVolume ?? 0.3,
        loop: true,
        spatial: true,
      });
    }
  }

  // Convenience getters
  get transform(): TransformComponent { return this._transform; }
  get health(): HealthComponent { return this._health; }
  get render(): RenderComponent { return this._render; }
  get movement(): MovementComponent { return this._movement; }
  get audio(): AudioComponent { return this._audio; }

  get alive(): boolean { return !this.health.isDead; }
  get position(): GeoPosition { return this.transform.position; }

  startMoving(): void {
    this.movement.resume();
    this.audio.play('moving', true);
  }

  stopMoving(): void {
    this.movement.pause();
    this.audio.stop('moving');
  }
}
```

### 2.2 Tower

```typescript
class Tower extends GameObject {
  readonly typeConfig: TowerTypeConfig;

  private _transform: TransformComponent;
  private _combat: CombatComponent;
  private _render: RenderComponent;

  selected = false;

  constructor(position: GeoPosition, typeId: TowerTypeId) {
    super('tower');
    this.typeConfig = getTowerType(typeId);

    this._transform = this.addComponent(new TransformComponent(this));
    this._combat = this.addComponent(new CombatComponent(this, {
      damage: this.typeConfig.damage,
      range: this.typeConfig.range,
      fireRate: this.typeConfig.fireRate,
    }));
    this._render = this.addComponent(new RenderComponent(this));

    this._transform.setPosition(position.lat, position.lon);
  }

  get transform(): TransformComponent { return this._transform; }
  get combat(): CombatComponent { return this._combat; }
  get render(): RenderComponent { return this._render; }

  get position(): GeoPosition { return this.transform.position; }

  findTarget(enemies: Enemy[]): Enemy | null {
    let closest: Enemy | null = null;
    let closestDist = Infinity;

    for (const enemy of enemies) {
      if (!enemy.alive) continue;

      const dist = calculateDistance(this.position, enemy.position);
      if (dist <= this.combat.range && dist < closestDist) {
        closestDist = dist;
        closest = enemy;
      }
    }

    return closest;
  }

  select(): void {
    this.selected = true;
  }

  deselect(): void {
    this.selected = false;
  }
}

interface TowerTypeConfig {
  id: TowerTypeId;
  name: string;
  modelUrl: string;
  scale: number;

  damage: number;
  range: number;
  fireRate: number; // Shots per second
  projectileType: ProjectileTypeId;

  cost: number;
}

type TowerTypeId = 'archer' | 'cannon' | 'magic' | 'sniper';
```

### 2.3 Projectile

```typescript
class Projectile extends GameObject {
  readonly typeConfig: ProjectileTypeConfig;
  readonly targetEnemy: Enemy;

  private _transform: TransformComponent;
  private _combat: CombatComponent;
  private _movement: MovementComponent;
  private _render: RenderComponent;

  constructor(
    startPosition: GeoPosition,
    targetEnemy: Enemy,
    typeId: ProjectileTypeId,
    damage: number
  ) {
    super('projectile');
    this.typeConfig = getProjectileType(typeId);
    this.targetEnemy = targetEnemy;

    this._transform = this.addComponent(new TransformComponent(this));
    this._combat = this.addComponent(new CombatComponent(this, {
      damage,
      range: 0,
      fireRate: 0,
    }));
    this._movement = this.addComponent(new MovementComponent(this));
    this._render = this.addComponent(new RenderComponent(this));

    this._transform.setPosition(startPosition.lat, startPosition.lon);
    this._movement.speedMps = this.typeConfig.speed;
  }

  get transform(): TransformComponent { return this._transform; }
  get combat(): CombatComponent { return this._combat; }
  get movement(): MovementComponent { return this._movement; }
  get render(): RenderComponent { return this._render; }

  get position(): GeoPosition { return this.transform.position; }
  get damage(): number { return this.combat.damage; }

  updateTowardsTarget(deltaTime: number): boolean {
    if (!this.targetEnemy.alive) {
      return false; // Target dead
    }

    const targetPos = this.targetEnemy.position;
    const dist = calculateDistance(this.position, targetPos);
    const moveDistance = (this.movement.speedMps * deltaTime) / 1000;

    if (dist <= moveDistance) {
      // Hit target
      this.transform.setPosition(targetPos.lat, targetPos.lon);
      return true;
    }

    // Move towards target
    const ratio = moveDistance / dist;
    const newLat = this.position.lat + (targetPos.lat - this.position.lat) * ratio;
    const newLon = this.position.lon + (targetPos.lon - this.position.lon) * ratio;

    this.transform.setPosition(newLat, newLon);
    this.transform.lookAt(targetPos);

    return false;
  }
}

interface ProjectileTypeConfig {
  id: ProjectileTypeId;
  speed: number; // m/s
  visualType: 'arrow' | 'cannonball' | 'magic';
  scale: number;
}

type ProjectileTypeId = 'arrow' | 'cannonball' | 'fireball' | 'ice-shard';
```

---

## 3. Manager System

### 3.1 EntityManager (Abstract Base)

```typescript
abstract class EntityManager<T extends GameObject> {
  protected entities = new Map<string, T>();
  protected viewer: Cesium.Viewer | null = null;

  initialize(viewer: Cesium.Viewer): void {
    this.viewer = viewer;
  }

  add(entity: T): void {
    this.entities.set(entity.id, entity);
  }

  remove(entity: T): void {
    entity.destroy();
    this.entities.delete(entity.id);
  }

  getById(id: string): T | null {
    return this.entities.get(id) ?? null;
  }

  getAll(): T[] {
    return Array.from(this.entities.values());
  }

  getAllActive(): T[] {
    return this.getAll().filter(e => e.active);
  }

  clear(): void {
    this.getAll().forEach(e => this.remove(e));
    this.entities.clear();
  }

  update(deltaTime: number): void {
    for (const entity of this.getAllActive()) {
      entity.update(deltaTime);
    }
  }
}
```

### 3.2 EnemyManager

```typescript
@Injectable()
class EnemyManager extends EntityManager<Enemy> {
  private entityPool = inject(EntityPoolService);
  private renderManager = inject(RenderManager);
  private audioManager = inject(AudioManager);

  private onEnemyReachedBase?: (enemy: Enemy) => void;

  initialize(
    viewer: Cesium.Viewer,
    onEnemyReachedBase?: (enemy: Enemy) => void
  ): void {
    super.initialize(viewer);
    this.onEnemyReachedBase = onEnemyReachedBase;
  }

  spawn(
    path: GeoPosition[],
    typeId: EnemyTypeId,
    speedOverride?: number,
    paused = false
  ): Enemy {
    const enemy = new Enemy(typeId, path, speedOverride);

    // Initialize render component
    const renderer = this.renderManager.getRenderer('enemy');
    const config = {
      modelUrl: enemy.typeConfig.modelUrl,
      scale: enemy.typeConfig.scale,
      minimumPixelSize: enemy.typeConfig.minimumPixelSize,
      hasAnimations: enemy.typeConfig.hasAnimations,
      walkAnimation: enemy.typeConfig.walkAnimation,
      deathAnimation: enemy.typeConfig.deathAnimation,
      animationSpeed: enemy.typeConfig.animationSpeed,
      healthBarOffset: enemy.typeConfig.healthBarOffset,
    };
    enemy.render.initialize(this.viewer!, renderer, config);

    if (paused) {
      enemy.movement.pause();
    } else {
      enemy.startMoving();
    }

    this.add(enemy);
    return enemy;
  }

  kill(enemy: Enemy): void {
    enemy.health.takeDamage(enemy.health.hp);
    enemy.stopMoving();

    // Play death animation via renderer
    const renderer = this.renderManager.getRenderer('enemy') as EnemyRenderer;
    renderer.playDeathAnimation(enemy);

    // Remove after animation
    setTimeout(() => this.remove(enemy), 2000);
  }

  update(deltaTime: number): void {
    for (const enemy of this.getAllActive()) {
      if (!enemy.alive) continue;

      enemy.update(deltaTime);

      // Check if reached base
      const result = enemy.movement.move(deltaTime);
      if (result === 'reached_end') {
        this.onEnemyReachedBase?.(enemy);
        this.remove(enemy);
      }
    }
  }

  startAll(delayBetween = 300): void {
    const paused = this.getAll().filter(e => e.movement.paused);

    paused.forEach((enemy, index) => {
      setTimeout(() => {
        if (enemy.alive) {
          enemy.startMoving();
        }
      }, index * delayBetween);
    });
  }

  getAlive(): Enemy[] {
    return this.getAll().filter(e => e.alive);
  }
}
```

### 3.3 TowerManager

```typescript
@Injectable()
class TowerManager extends EntityManager<Tower> {
  private renderManager = inject(RenderManager);
  private osmService = inject(OsmStreetService);

  private selectedTowerId: string | null = null;
  private streetNetwork: StreetNetwork | null = null;
  private basePosition: GeoPosition | null = null;
  private spawnPoints: GeoPosition[] = [];

  // Placement constraints
  private readonly MIN_DISTANCE_TO_STREET = 10;
  private readonly MAX_DISTANCE_TO_STREET = 50;
  private readonly MIN_DISTANCE_TO_BASE = 30;
  private readonly MIN_DISTANCE_TO_SPAWN = 30;
  private readonly MIN_DISTANCE_TO_OTHER_TOWER = 20;

  initialize(
    viewer: Cesium.Viewer,
    streetNetwork: StreetNetwork,
    basePosition: GeoPosition,
    spawnPoints: GeoPosition[]
  ): void {
    super.initialize(viewer);
    this.streetNetwork = streetNetwork;
    this.basePosition = basePosition;
    this.spawnPoints = spawnPoints;
  }

  placeTower(position: GeoPosition, typeId: TowerTypeId): Tower | null {
    const validation = this.validatePosition(position);
    if (!validation.valid) {
      console.warn('Invalid tower position:', validation.reason);
      return null;
    }

    const tower = new Tower(position, typeId);

    // Initialize render component
    const renderer = this.renderManager.getRenderer('tower');
    const config = {
      modelUrl: tower.typeConfig.modelUrl,
      scale: tower.typeConfig.scale,
      range: tower.combat.range,
    };
    tower.render.initialize(this.viewer!, renderer, config);

    this.add(tower);
    return tower;
  }

  validatePosition(position: GeoPosition): { valid: boolean; reason?: string } {
    if (!this.streetNetwork || !this.basePosition) {
      return { valid: false, reason: 'Not initialized' };
    }

    // Check distance to base
    const distToBase = calculateDistance(position, this.basePosition);
    if (distToBase < this.MIN_DISTANCE_TO_BASE) {
      return { valid: false, reason: 'Too close to base' };
    }

    // Check distance to spawn points
    for (const spawn of this.spawnPoints) {
      const distToSpawn = calculateDistance(position, spawn);
      if (distToSpawn < this.MIN_DISTANCE_TO_SPAWN) {
        return { valid: false, reason: 'Too close to spawn point' };
      }
    }

    // Check distance to other towers
    for (const tower of this.getAll()) {
      const distToTower = calculateDistance(position, tower.position);
      if (distToTower < this.MIN_DISTANCE_TO_OTHER_TOWER) {
        return { valid: false, reason: 'Too close to another tower' };
      }
    }

    // Check distance to street
    const nearest = this.osmService.findNearestStreetPoint(
      this.streetNetwork,
      position.lat,
      position.lon
    );

    if (!nearest) {
      return { valid: false, reason: 'No street nearby' };
    }

    if (nearest.distance > this.MAX_DISTANCE_TO_STREET) {
      return { valid: false, reason: 'Too far from street' };
    }

    if (nearest.distance < this.MIN_DISTANCE_TO_STREET) {
      return { valid: false, reason: 'Cannot build directly on street' };
    }

    return { valid: true };
  }

  selectTower(id: string | null): void {
    // Deselect previous
    if (this.selectedTowerId) {
      const prev = this.getById(this.selectedTowerId);
      if (prev) {
        prev.deselect();
        const renderer = this.renderManager.getRenderer('tower') as TowerRenderer;
        renderer.updateSelection(prev, false);
      }
    }

    // Select new
    this.selectedTowerId = id;
    if (id) {
      const tower = this.getById(id);
      if (tower) {
        tower.select();
        const renderer = this.renderManager.getRenderer('tower') as TowerRenderer;
        renderer.updateSelection(tower, true);
      }
    }
  }

  getSelected(): Tower | null {
    return this.selectedTowerId ? this.getById(this.selectedTowerId) : null;
  }
}
```

### 3.4 ProjectileManager

```typescript
@Injectable()
class ProjectileManager extends EntityManager<Projectile> {
  private entityPool = inject(EntityPoolService);
  private renderManager = inject(RenderManager);
  private audioManager = inject(AudioManager);

  private onProjectileHit?: (projectile: Projectile, enemy: Enemy) => void;

  initialize(
    viewer: Cesium.Viewer,
    onProjectileHit?: (projectile: Projectile, enemy: Enemy) => void
  ): void {
    super.initialize(viewer);
    this.onProjectileHit = onProjectileHit;
  }

  spawn(
    tower: Tower,
    targetEnemy: Enemy
  ): Projectile {
    const projectile = new Projectile(
      tower.position,
      targetEnemy,
      tower.typeConfig.projectileType,
      tower.combat.damage
    );

    // Initialize render component
    const renderer = this.renderManager.getRenderer('projectile');
    const config = projectile.typeConfig;
    projectile.render.initialize(this.viewer!, renderer, config);

    this.add(projectile);

    // Play projectile sound
    this.audioManager.play('projectile-fire', 0.3);

    return projectile;
  }

  update(deltaTime: number): void {
    const toRemove: Projectile[] = [];

    for (const projectile of this.getAllActive()) {
      const hit = projectile.updateTowardsTarget(deltaTime);

      if (hit) {
        // Notify hit
        this.onProjectileHit?.(projectile, projectile.targetEnemy);
        toRemove.push(projectile);
      } else if (!projectile.targetEnemy.alive) {
        // Target died, remove projectile
        toRemove.push(projectile);
      }
    }

    toRemove.forEach(p => this.remove(p));
  }
}
```

### 3.5 WaveManager

```typescript
@Injectable()
class WaveManager {
  private enemyManager = inject(EnemyManager);

  readonly phase = signal<GamePhase>('setup');
  readonly waveNumber = signal(0);
  readonly gatheringPhase = signal(false);

  private spawnPoints: SpawnPoint[] = [];
  private cachedPaths = new Map<string, GeoPosition[]>();

  initialize(spawnPoints: SpawnPoint[], cachedPaths: Map<string, GeoPosition[]>): void {
    this.spawnPoints = spawnPoints;
    this.cachedPaths = cachedPaths;
  }

  startWave(config: WaveConfig): void {
    this.waveNumber.update(n => n + 1);
    this.phase.set('wave');
    this.gatheringPhase.set(true);

    // Phase 1: Spawn enemies (paused)
    let spawnedCount = 0;
    const spawnDelay = 100;

    const spawnNext = () => {
      if (spawnedCount >= config.enemyCount) {
        // Phase 2: Start enemies
        setTimeout(() => {
          this.gatheringPhase.set(false);
          this.enemyManager.startAll(300);
        }, 500);
        return;
      }

      const spawn = this.selectSpawnPoint(config.spawnMode, spawnedCount);
      const path = this.cachedPaths.get(spawn.id);

      if (path && path.length > 1) {
        this.enemyManager.spawn(path, config.enemyType, config.enemySpeed, true);
        spawnedCount++;
      }

      setTimeout(spawnNext, spawnDelay);
    };

    spawnNext();
  }

  private selectSpawnPoint(mode: 'each' | 'random', index: number): SpawnPoint {
    if (mode === 'each') {
      return this.spawnPoints[index % this.spawnPoints.length];
    } else {
      return this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
    }
  }

  checkWaveComplete(): boolean {
    return this.enemyManager.getAlive().length === 0 && this.phase() === 'wave';
  }

  endWave(): void {
    this.enemyManager.clear();
    this.phase.set('setup');
  }

  reset(): void {
    this.enemyManager.clear();
    this.phase.set('setup');
    this.waveNumber.set(0);
    this.gatheringPhase.set(false);
  }
}

interface WaveConfig {
  enemyCount: number;
  enemyType: EnemyTypeId;
  enemySpeed: number;
  spawnMode: 'each' | 'random';
}

type GamePhase = 'setup' | 'wave' | 'gameover';
```

### 3.6 AudioManager

```typescript
@Injectable()
class AudioManager {
  private sounds = new Map<string, string>(); // id -> URL
  private audioInstances = new Map<string, HTMLAudioElement[]>();
  private viewer: Cesium.Viewer | null = null;

  initialize(viewer: Cesium.Viewer): void {
    this.viewer = viewer;
  }

  registerSound(id: string, url: string): void {
    this.sounds.set(id, url);
  }

  play(id: string, volume = 1.0, loop = false, position?: Cesium.Cartesian3): void {
    const url = this.sounds.get(id);
    if (!url) {
      console.warn(`Sound '${id}' not registered`);
      return;
    }

    const audio = new Audio(url);
    audio.volume = position ? this.calculateDistanceVolume(position, volume) : volume;
    audio.loop = loop;

    audio.play().catch(() => {
      // Ignore autoplay restrictions
    });

    // Track instance
    if (!this.audioInstances.has(id)) {
      this.audioInstances.set(id, []);
    }
    this.audioInstances.get(id)!.push(audio);

    // Cleanup after playback
    if (!loop) {
      audio.addEventListener('ended', () => {
        const instances = this.audioInstances.get(id);
        if (instances) {
          const index = instances.indexOf(audio);
          if (index > -1) instances.splice(index, 1);
        }
      });
    }
  }

  stop(id: string): void {
    const instances = this.audioInstances.get(id);
    if (instances) {
      instances.forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
      });
      instances.length = 0;
    }
  }

  stopAll(): void {
    for (const instances of this.audioInstances.values()) {
      instances.forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
      });
      instances.length = 0;
    }
  }

  private calculateDistanceVolume(position: Cesium.Cartesian3, baseVolume: number): number {
    if (!this.viewer) return baseVolume;

    const cameraPosition = this.viewer.camera.positionWC;
    const distance = Cesium.Cartesian3.distance(cameraPosition, position);

    const minDist = 10; // Full volume up to 10m
    const maxDist = 300; // Silent at 300m

    if (distance <= minDist) return baseVolume;
    if (distance >= maxDist) return 0;

    const attenuation = 1 - (distance - minDist) / (maxDist - minDist);
    return baseVolume * attenuation;
  }
}
```

### 3.7 RenderManager

```typescript
@Injectable()
class RenderManager {
  private renderers = new Map<string, Renderer>();
  private viewer: Cesium.Viewer | null = null;

  initialize(viewer: Cesium.Viewer): void {
    this.viewer = viewer;

    // Register default renderers
    this.registerRenderer('enemy', new EnemyRenderer());
    this.registerRenderer('tower', new TowerRenderer());
    this.registerRenderer('projectile', new ProjectileRenderer());
  }

  registerRenderer(type: string, renderer: Renderer): void {
    this.renderers.set(type, renderer);
  }

  getRenderer(type: string): Renderer {
    const renderer = this.renderers.get(type);
    if (!renderer) {
      throw new Error(`Renderer '${type}' not registered`);
    }
    return renderer;
  }
}
```

### 3.8 GameStateManager (Orchestrator)

```typescript
@Injectable()
class GameStateManager {
  private viewer: Cesium.Viewer | null = null;

  // Managers
  readonly enemyManager = inject(EnemyManager);
  readonly towerManager = inject(TowerManager);
  readonly projectileManager = inject(ProjectileManager);
  readonly waveManager = inject(WaveManager);
  readonly audioManager = inject(AudioManager);
  readonly renderManager = inject(RenderManager);

  // Game State
  readonly baseHealth = signal(100);
  readonly credits = signal(100);
  readonly showGameOverScreen = signal(false);

  private lastUpdateTime = 0;
  private basePosition: GeoPosition | null = null;

  initialize(
    viewer: Cesium.Viewer,
    streetNetwork: StreetNetwork,
    basePosition: GeoPosition,
    spawnPoints: SpawnPoint[],
    cachedPaths: Map<string, GeoPosition[]>
  ): void {
    this.viewer = viewer;
    this.basePosition = basePosition;

    // Initialize all managers
    this.renderManager.initialize(viewer);
    this.audioManager.initialize(viewer);

    this.enemyManager.initialize(viewer, (enemy) => this.onEnemyReachedBase(enemy));
    this.towerManager.initialize(viewer, streetNetwork, basePosition, spawnPoints.map(s => ({
      lat: s.latitude,
      lon: s.longitude,
    })));
    this.projectileManager.initialize(viewer, (proj, enemy) => this.onProjectileHit(proj, enemy));
    this.waveManager.initialize(spawnPoints, cachedPaths);

    // Register sounds
    this.audioManager.registerSound('projectile-fire', '/assets/sounds/projectile-fire.mp3');
    this.audioManager.registerSound('base-damage', '/assets/sounds/impactful-damage-425132.mp3');
  }

  update(currentTime: number): void {
    const deltaTime = this.lastUpdateTime ? currentTime - this.lastUpdateTime : 16;
    this.lastUpdateTime = currentTime;

    if (this.waveManager.phase() !== 'wave') return;

    this.enemyManager.update(deltaTime);
    this.updateTowerShooting(currentTime);
    this.projectileManager.update(deltaTime);

    // Check wave completion
    if (this.waveManager.checkWaveComplete()) {
      this.waveManager.endWave();
      this.credits.update(c => c + 50);
    }

    // Check game over
    if (this.baseHealth() <= 0 && this.waveManager.phase() !== 'gameover') {
      this.triggerGameOver();
    }
  }

  private updateTowerShooting(currentTime: number): void {
    const enemies = this.enemyManager.getAlive();

    for (const tower of this.towerManager.getAllActive()) {
      if (!tower.combat.canFire(currentTime)) continue;

      const target = tower.findTarget(enemies);
      if (target) {
        tower.combat.fire(currentTime);
        this.projectileManager.spawn(tower, target);
      }
    }
  }

  private onEnemyReachedBase(enemy: Enemy): void {
    this.baseHealth.update(h => Math.max(0, h - 10));
    this.audioManager.play('base-damage', 0.5);

    // Update fire intensity based on health
    this.updateFireIntensity();
  }

  private onProjectileHit(projectile: Projectile, enemy: Enemy): void {
    // Spawn blood effects
    if (this.viewer) {
      BloodRenderer.spawnBloodSplatter(
        this.viewer,
        enemy.position.lon,
        enemy.position.lat,
        enemy.transform.terrainHeight + 1
      );
      BloodRenderer.spawnBloodStain(
        this.viewer,
        enemy.position.lon,
        enemy.position.lat,
        enemy.transform.terrainHeight
      );
    }

    const killed = enemy.health.takeDamage(projectile.damage);
    if (killed) {
      this.enemyManager.kill(enemy);
      this.credits.update(c => c + 10);
    } else {
      // Update health bar via renderer
      const renderer = this.renderManager.getRenderer('enemy') as EnemyRenderer;
      renderer.updateHealthBar(enemy);
    }
  }

  private updateFireIntensity(): void {
    if (!this.basePosition || !this.viewer) return;

    const health = this.baseHealth();
    let intensity: FireIntensity;

    if (health < 20) intensity = 'large';
    else if (health < 40) intensity = 'medium';
    else if (health < 60) intensity = 'small';
    else intensity = 'tiny';

    FireRenderer.startFire(this.viewer, this.basePosition.lon, this.basePosition.lat, intensity);
  }

  private triggerGameOver(): void {
    this.waveManager.phase.set('gameover');
    this.enemyManager.clear();

    if (this.basePosition && this.viewer) {
      FireRenderer.startFire(this.viewer, this.basePosition.lon, this.basePosition.lat, 'inferno');
    }

    setTimeout(() => {
      this.showGameOverScreen.set(true);
    }, 5000);
  }

  reset(): void {
    this.enemyManager.clear();
    this.towerManager.clear();
    this.projectileManager.clear();
    this.waveManager.reset();
    this.audioManager.stopAll();

    if (this.viewer) {
      FireRenderer.stopFire(this.viewer);
      BloodRenderer.clearAllBloodStains(this.viewer);
    }

    this.baseHealth.set(100);
    this.credits.set(100);
    this.showGameOverScreen.set(false);

    GameObject.resetIdCounter();
  }
}
```

---

## 4. Renderer System (Bestehende Struktur)

### 4.1 Renderer Interface

```typescript
interface Renderer {
  create(viewer: Cesium.Viewer, config: RenderConfig): RenderResult;
  update(result: RenderResult, data: any): void;
  destroy(viewer: Cesium.Viewer, result: RenderResult): void;
}

interface RenderResult {
  entity: Cesium.Entity | null;
  model: Cesium.Model | null;
  additionalEntities: Cesium.Entity[];
}

interface RenderConfig {
  [key: string]: any;
}
```

### 4.2 EnemyRenderer

```typescript
class EnemyRenderer implements Renderer {
  create(viewer: Cesium.Viewer, config: EnemyRenderConfig): RenderResult {
    const position = Cesium.Cartesian3.fromDegrees(
      config.position.lon,
      config.position.lat,
      config.terrainHeight
    );

    // Placeholder entity
    const entity = viewer.entities.add({
      position: position,
      point: { pixelSize: 1, color: Cesium.Color.TRANSPARENT },
    });

    // Health bar
    const healthBarEntity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(
        config.position.lon,
        config.position.lat,
        config.terrainHeight + config.healthBarOffset
      ),
      billboard: {
        image: this.createHealthBarCanvas(1.0),
        scale: 1.0,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });

    // Model (async)
    let model: Cesium.Model | null = null;
    Cesium.Model.fromGltfAsync({
      url: config.modelUrl,
      scale: config.scale,
      minimumPixelSize: config.minimumPixelSize,
    }).then((loadedModel) => {
      viewer.scene.primitives.add(loadedModel);
      model = loadedModel;

      const hpr = new Cesium.HeadingPitchRoll(0, 0, 0);
      loadedModel.modelMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(position, hpr);

      if (config.hasAnimations && config.walkAnimation) {
        this.startWalkAnimation(loadedModel, config.walkAnimation, config.animationSpeed);
      }
    });

    return {
      entity,
      model,
      additionalEntities: [healthBarEntity],
    };
  }

  updateHealthBar(enemy: Enemy): void {
    const healthBarEntity = enemy.render.additionalEntities[0];
    if (healthBarEntity?.billboard) {
      healthBarEntity.billboard.image = new Cesium.ConstantProperty(
        this.createHealthBarCanvas(enemy.health.healthPercent)
      );
    }
  }

  playDeathAnimation(enemy: Enemy): void {
    if (!enemy.render.model?.ready) return;

    const config = enemy.typeConfig;
    if (!config.hasAnimations || !config.deathAnimation) return;

    enemy.render.model.activeAnimations.removeAll();
    enemy.render.model.activeAnimations.add({
      name: config.deathAnimation,
      loop: Cesium.ModelAnimationLoop.NONE,
      multiplier: 1.0,
    });
  }

  private createHealthBarCanvas(healthPercent: number): HTMLCanvasElement {
    // ... existing implementation
  }

  private startWalkAnimation(model: Cesium.Model, animName: string, speed: number): void {
    // ... existing implementation
  }
}

interface EnemyRenderConfig extends RenderConfig {
  position: GeoPosition;
  terrainHeight: number;
  modelUrl: string;
  scale: number;
  minimumPixelSize: number;
  hasAnimations: boolean;
  walkAnimation?: string;
  deathAnimation?: string;
  animationSpeed?: number;
  healthBarOffset: number;
}
```

### 4.3 TowerRenderer

```typescript
class TowerRenderer implements Renderer {
  create(viewer: Cesium.Viewer, config: TowerRenderConfig): RenderResult {
    // Tower model
    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(config.position.lon, config.position.lat, 0),
      model: {
        uri: config.modelUrl,
        scale: config.scale,
        minimumPixelSize: 48,
        maximumScale: 3.0,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });

    // Range indicator
    const rangeEntity = this.createRangeIndicator(viewer, config.position, config.range, false);

    return {
      entity,
      model: null,
      additionalEntities: [rangeEntity],
    };
  }

  updateSelection(tower: Tower, selected: boolean): void {
    const rangeEntity = tower.render.additionalEntities[0];
    if (rangeEntity) {
      rangeEntity.show = selected;
    }
  }

  private createRangeIndicator(
    viewer: Cesium.Viewer,
    position: GeoPosition,
    range: number,
    visible: boolean
  ): Cesium.Entity {
    return viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(position.lon, position.lat, 0),
      ellipse: {
        semiMinorAxis: range,
        semiMajorAxis: range,
        material: Cesium.Color.CYAN.withAlpha(0.2),
        outline: true,
        outlineColor: Cesium.Color.CYAN,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
      show: visible,
    });
  }
}

interface TowerRenderConfig extends RenderConfig {
  position: GeoPosition;
  modelUrl: string;
  scale: number;
  range: number;
}
```

### 4.4 ProjectileRenderer

```typescript
class ProjectileRenderer implements Renderer {
  create(viewer: Cesium.Viewer, config: ProjectileRenderConfig): RenderResult {
    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(config.position.lon, config.position.lat, 2),
      billboard: {
        image: this.getProjectileImage(config.visualType),
        scale: config.scale ?? 0.5,
        heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
      },
    });

    return {
      entity,
      model: null,
      additionalEntities: [],
    };
  }

  update(result: RenderResult, data: { position: GeoPosition }): void {
    if (result.entity?.position) {
      (result.entity.position as unknown) = Cesium.Cartesian3.fromDegrees(
        data.position.lon,
        data.position.lat,
        2
      );
    }
  }

  destroy(viewer: Cesium.Viewer, result: RenderResult): void {
    if (result.entity) {
      viewer.entities.remove(result.entity);
    }
  }

  private getProjectileImage(visualType: string): string {
    const images: Record<string, string> = {
      'arrow': '/assets/projectiles/arrow.png',
      'cannonball': '/assets/projectiles/cannonball.png',
      'magic': '/assets/projectiles/magic.png',
    };
    return images[visualType] ?? '/assets/projectiles/default.png';
  }
}

interface ProjectileRenderConfig extends RenderConfig {
  position: GeoPosition;
  visualType: 'arrow' | 'cannonball' | 'magic';
  scale?: number;
}
```

### 4.5 Static Utility Renderers

```typescript
// BloodRenderer (bestehend, bleibt unverändert)
class BloodRenderer {
  static spawnBloodSplatter(viewer: Cesium.Viewer, lon: number, lat: number, height: number): void {
    // ... existing implementation
  }

  static spawnBloodStain(viewer: Cesium.Viewer, lon: number, lat: number, height: number): void {
    // ... existing implementation
  }

  static clearAllBloodStains(viewer: Cesium.Viewer): void {
    // ... existing implementation
  }
}

// FireRenderer (bestehend, bleibt unverändert)
class FireRenderer {
  static startFire(viewer: Cesium.Viewer, lon: number, lat: number, intensity: FireIntensity): void {
    // ... existing implementation
  }

  static stopFire(viewer: Cesium.Viewer): void {
    // ... existing implementation
  }

  static getCurrentIntensity(): FireIntensity | null {
    // ... existing implementation
  }
}
```

---

## 5. Type Configuration System

### 5.1 Tower Types Registry

```typescript
const TOWER_TYPES: Record<TowerTypeId, TowerTypeConfig> = {
  archer: {
    id: 'archer',
    name: 'Archer Tower',
    modelUrl: '/assets/models/tower_archer.glb',
    scale: 1.8,
    damage: 25,
    range: 60,
    fireRate: 1, // 1 shot/sec
    projectileType: 'arrow',
    cost: 100,
  },
  cannon: {
    id: 'cannon',
    name: 'Cannon Tower',
    modelUrl: '/assets/models/tower_cannon.glb',
    scale: 2.0,
    damage: 75,
    range: 80,
    fireRate: 0.5, // 0.5 shots/sec (slower)
    projectileType: 'cannonball',
    cost: 200,
  },
  magic: {
    id: 'magic',
    name: 'Magic Tower',
    modelUrl: '/assets/models/tower_magic.glb',
    scale: 1.5,
    damage: 40,
    range: 70,
    fireRate: 1.5, // 1.5 shots/sec (faster)
    projectileType: 'fireball',
    cost: 150,
  },
  sniper: {
    id: 'sniper',
    name: 'Sniper Tower',
    modelUrl: '/assets/models/tower_sniper.glb',
    scale: 1.6,
    damage: 150,
    range: 120,
    fireRate: 0.3, // Very slow but powerful
    projectileType: 'arrow',
    cost: 300,
  },
};

function getTowerType(id: TowerTypeId): TowerTypeConfig {
  return TOWER_TYPES[id];
}

function getAllTowerTypes(): TowerTypeConfig[] {
  return Object.values(TOWER_TYPES);
}
```

### 5.2 Projectile Types Registry

```typescript
const PROJECTILE_TYPES: Record<ProjectileTypeId, ProjectileTypeConfig> = {
  arrow: {
    id: 'arrow',
    speed: 100, // m/s
    visualType: 'arrow',
    scale: 0.5,
  },
  cannonball: {
    id: 'cannonball',
    speed: 60, // m/s (slower, heavier)
    visualType: 'cannonball',
    scale: 0.8,
  },
  fireball: {
    id: 'fireball',
    speed: 120, // m/s (fast magic)
    visualType: 'magic',
    scale: 0.6,
  },
  'ice-shard': {
    id: 'ice-shard',
    speed: 110,
    visualType: 'magic',
    scale: 0.5,
  },
};

function getProjectileType(id: ProjectileTypeId): ProjectileTypeConfig {
  return PROJECTILE_TYPES[id];
}
```

### 5.3 Enemy Types (bestehend, erweitert für Air)

```typescript
interface EnemyTypeConfig {
  // ... existing fields
  movementType: 'ground' | 'air'; // Neu: Für spätere Air-Enemies
}

const ENEMY_TYPES: Record<EnemyTypeId, EnemyTypeConfig> = {
  zombie: {
    // ... existing config
    movementType: 'ground',
  },
  // Später:
  drone: {
    id: 'drone',
    name: 'Attack Drone',
    modelUrl: '/assets/models/drone.glb',
    baseHp: 30,
    baseSpeed: 8,
    movementType: 'air', // Fliegt, ignoriert Pfade teilweise
    // ...
  },
};
```

---

## 6. Utility Services

### 6.1 Distance Service

```typescript
@Injectable({ providedIn: 'root' })
class DistanceService {
  haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  calculateDistance(pos1: GeoPosition, pos2: GeoPosition): number {
    return this.haversineDistance(pos1.lat, pos1.lon, pos2.lat, pos2.lon);
  }
}

// Global helper function
function calculateDistance(pos1: GeoPosition, pos2: GeoPosition): number {
  return inject(DistanceService).calculateDistance(pos1, pos2);
}
```

### 6.2 Entity Pool Service (bestehend)

```typescript
// Bleibt wie gehabt, wird von Managers genutzt
@Injectable()
class EntityPoolService {
  // ... existing implementation
}
```

### 6.3 OSM Street Service (bestehend)

```typescript
// Bleibt wie gehabt, wird von TowerManager genutzt
@Injectable({ providedIn: 'root' })
class OsmStreetService {
  // ... existing implementation
}
```

---

## 7. Migration Plan

### Phase 1: Core System (GameObject, Components)
1. Erstelle `core/` Ordner
2. Implementiere `GameObject` Base Class
3. Implementiere `Component` Base Class
4. Implementiere alle konkreten Components

### Phase 2: Entity Types
1. Erstelle `entities/` Ordner
2. Implementiere `Enemy` Class (basierend auf bestehendem Code)
3. Implementiere `Tower` Class
4. Implementiere `Projectile` Class

### Phase 3: Managers
1. Erstelle `managers/` Ordner
2. Implementiere `EntityManager` Base Class
3. Implementiere `EnemyManager`
4. Implementiere `TowerManager`
5. Implementiere `ProjectileManager`
6. Implementiere `WaveManager`
7. Implementiere `AudioManager`
8. Implementiere `RenderManager`
9. Implementiere `GameStateManager`

### Phase 4: Renderer System
1. Erstelle `Renderer` Interface
2. Refactore `EnemyRenderer` zu Interface
3. Refactore `TowerRenderer` zu Interface
4. Refactore `ProjectileRenderer` zu Interface
5. `BloodRenderer` und `FireRenderer` bleiben static utilities

### Phase 5: Type Configs
1. Erstelle `configs/` Ordner
2. Erstelle `tower-types.config.ts`
3. Erstelle `projectile-types.config.ts`
4. Erweitere `enemy-types.ts`

### Phase 6: Integration
1. Update `TowerDefenseComponent` zu Manager-basiert
2. Entferne alte direkte Entity-Handling
3. Teste alle Features

### Phase 7: Cleanup
1. Lösche alte Models (enemy.model.ts, tower.model.ts, projectile.model.ts)
2. Update Imports überall
3. Code Review & Optimierung

---

## 8. Ordnerstruktur

```
tower-defense/
├── core/
│   ├── game-object.ts          # GameObject Base Class
│   ├── component.ts             # Component Base Class + Types
│   └── index.ts
├── components/                  # Game Components
│   ├── transform.component.ts
│   ├── health.component.ts
│   ├── render.component.ts
│   ├── audio.component.ts
│   ├── movement.component.ts
│   ├── combat.component.ts
│   └── index.ts
├── entities/                    # Entity Types
│   ├── enemy.entity.ts
│   ├── tower.entity.ts
│   ├── projectile.entity.ts
│   └── index.ts
├── managers/                    # Manager System
│   ├── entity-manager.ts        # Base Manager
│   ├── enemy.manager.ts
│   ├── tower.manager.ts
│   ├── projectile.manager.ts
│   ├── wave.manager.ts
│   ├── audio.manager.ts
│   ├── render.manager.ts
│   ├── game-state.manager.ts
│   └── index.ts
├── renderers/                   # Renderer System
│   ├── renderer.interface.ts
│   ├── enemy.renderer.ts
│   ├── tower.renderer.ts
│   ├── projectile.renderer.ts
│   ├── blood.renderer.ts        # Static utility
│   ├── fire.renderer.ts         # Static utility
│   └── index.ts
├── configs/                     # Type Configurations
│   ├── tower-types.config.ts
│   ├── projectile-types.config.ts
│   ├── enemy-types.config.ts    # Erweitert aus models/enemy-types.ts
│   └── index.ts
├── services/                    # Utility Services
│   ├── distance.service.ts
│   ├── entity-pool.service.ts   # Bestehend
│   ├── osm-street.service.ts    # Bestehend
│   └── index.ts
├── models/                      # Shared Types
│   ├── game.types.ts            # GeoPosition, GamePhase, etc.
│   └── index.ts
├── components/                  # UI Components
│   └── debug-panel.component.ts
├── docs/
│   └── ARCHITECTURE.md          # This file
└── tower-defense.component.ts   # Main Component (vereinfacht)
```

---

## 9. Vorteile der neuen Architektur

### ✅ Modularität
- Components sind wiederverwendbar
- Neue Features durch neue Components
- Enemy/Tower/Projectile können Components mischen

### ✅ Separation of Concerns
- Jede Klasse hat eine klare Verantwortung
- Manager kümmern sich um Lifecycle
- Renderer kümmern sich nur um Visualisierung
- Components kapseln spezifische Funktionalität

### ✅ Erweiterbarkeit
- Neue Tower-Typen durch Config hinzufügen
- Neue Enemy-Typen (z.B. Air) ohne große Änderungen
- Neue Components ohne bestehenden Code zu ändern

### ✅ Testbarkeit
- Components isoliert testbar
- Managers mit Mocks testbar
- Weniger Abhängigkeiten

### ✅ Wartbarkeit
- Klare Struktur
- Vorhersehbare Datenpfade
- Einfaches Debuggen

### ✅ Performance
- Bestehende Pooling-Strategie bleibt
- Component-Update nur wenn enabled
- Manager können Batching implementieren

---

## 10. Beispiel: Neuer Tower-Typ hinzufügen

```typescript
// 1. Config hinzufügen in configs/tower-types.config.ts
const TOWER_TYPES = {
  // ... existing
  frost: {
    id: 'frost',
    name: 'Frost Tower',
    modelUrl: '/assets/models/tower_frost.glb',
    scale: 1.7,
    damage: 15,
    range: 65,
    fireRate: 2, // Fast firing
    projectileType: 'ice-shard',
    cost: 120,
  },
};

// 2. Projectile Config in configs/projectile-types.config.ts
const PROJECTILE_TYPES = {
  // ... existing
  'ice-shard': {
    id: 'ice-shard',
    speed: 110,
    visualType: 'magic',
    scale: 0.5,
  },
};

// 3. Das war's! Tower ist sofort verfügbar:
towerManager.placeTower({ lat: 49.17, lon: 9.27 }, 'frost');
```

---

## 11. Beispiel: Air-Enemy später hinzufügen

```typescript
// 1. Enemy Config erweitern
const ENEMY_TYPES = {
  // ... existing
  drone: {
    id: 'drone',
    name: 'Attack Drone',
    modelUrl: '/assets/models/drone.glb',
    baseHp: 40,
    baseSpeed: 10,
    movementType: 'air',
    healthBarOffset: 8,
    // ...
  },
};

// 2. Optional: AirMovementComponent erstellen (falls abweichendes Movement)
class AirMovementComponent extends MovementComponent {
  move(deltaTime: number): 'moving' | 'reached_end' {
    // Fliegt direkt zur Basis, ignoriert Straßenpfade
    // Oder: Folgt speziellem Air-Path
  }
}

// 3. Enemy Constructor erweitern
constructor(typeId: EnemyTypeId, path: GeoPosition[], speedOverride?: number) {
  super('enemy');
  this.typeConfig = getEnemyType(typeId);

  // ...

  // Conditional movement component
  if (this.typeConfig.movementType === 'air') {
    this._movement = this.addComponent(new AirMovementComponent(this));
  } else {
    this._movement = this.addComponent(new MovementComponent(this));
  }
}
```

---

## 12. Performance-Überlegungen

### Component Update Optimization
```typescript
// GameObject nur aktive Components updaten
update(deltaTime: number): void {
  for (const component of this.components.values()) {
    if (component.enabled) {
      component.update(deltaTime);
    }
  }
}
```

### Manager Batching
```typescript
// EnemyManager: Batch Cesium Updates
update(deltaTime: number): void {
  const updates: Array<{ entity: Cesium.Entity; position: Cesium.Cartesian3 }> = [];

  for (const enemy of this.getAllActive()) {
    enemy.update(deltaTime);

    const pos = enemy.transform.getCartesian3();
    updates.push({ entity: enemy.render.entity!, position: pos });
  }

  // Batch apply positions
  updates.forEach(({ entity, position }) => {
    (entity.position as unknown) = position;
  });
}
```

### Object Pooling Integration
```typescript
// GameObject Factory mit Pooling
class GameObjectPool {
  private pools = new Map<GameObjectType, GameObject[]>();

  acquire<T extends GameObject>(type: GameObjectType, factory: () => T): T {
    const pool = this.pools.get(type) ?? [];
    return pool.pop() as T ?? factory();
  }

  release(obj: GameObject): void {
    obj.active = false;
    const pool = this.pools.get(obj.type) ?? [];
    pool.push(obj);
    this.pools.set(obj.type, pool);
  }
}
```

---

## Fazit

Diese Architektur bietet:
- **Klare Struktur** durch Component-System und Manager
- **Flexibilität** für neue Tower/Enemy/Projectile-Typen
- **Wartbarkeit** durch Separation of Concerns
- **Performance** durch bestehende Optimierungen (Pooling, Rendering)
- **Erweiterbarkeit** für zukünftige Features (Air-Enemies, neue Components)

Die Migration kann schrittweise erfolgen, ohne bestehende Funktionalität zu brechen.
