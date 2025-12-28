# Kayberg Greifvogel-Spiel - Implementierungsplan

## Spielkonzept

**"Kayberg Hunter"** - Ein 3D-Flugsimulator, in dem der Spieler einen Greifvogel steuert, der auf dem Kayberg lebt. Ziel ist es, Beutetiere zu jagen und dabei Jägern auszuweichen.

### Spielelemente
- **Setting:** Berg "Kayberg" mit Wald auf dem Gipfel, Weinbergen an den Hängen, Tal drumherum
- **Landmark:** Gipfelkreuz mit goldener Jesus-Statue am Waldrand
- **Spieler:** Greifvogel (Adler/Falke), frei steuerbar
- **Beute:** Mäuse, Hasen, kleine Vögel, Tauben
- **Gegner:** Jäger mit Gewehren
- **Mechanik:** Wave-basierte Level, 3 Leben, Credit-Belohnung pro Level

---

## Technologie-Entscheidungen

| Aspekt | Entscheidung | Begründung |
|--------|--------------|------------|
| 3D-Engine | Three.js | Populärste WebGL-Library, gute Doku, performant |
| Steuerung | Maus + WASD | Maus für Blickrichtung, WASD für Bewegung, Space für Sturzflug |
| Grafik | Realistisch (Texturen) | Detaillierte Terrain-Texturen, realistische Bäume |
| Level-System | Wave-basiert | X Beute fangen bei Y Jägern, steigende Schwierigkeit |
| Belohnung | Pro Level | CreditService.claimMinigameReward('KaybergHunter', level) |

---

## Dateistruktur

```
nervbox-player/src/app/components/mini-games/games/kayberg/
├── kayberg-game.component.ts      # Hauptkomponente (Angular)
├── kayberg-game.component.scss    # Styles
├── engine/
│   ├── kayberg-engine.ts          # Haupt-Game-Engine
│   ├── terrain.ts                 # Terrain-Generierung (Berg, Weinberge, Tal)
│   ├── entities/
│   │   ├── player-bird.ts         # Greifvogel-Controller
│   │   ├── prey.ts                # Beutetiere (Mäuse, Hasen, Vögel)
│   │   ├── hunter.ts              # Jäger mit Gewehr
│   │   └── projectile.ts          # Kugeln der Jäger
│   ├── controls/
│   │   └── flight-controls.ts     # Maus + WASD Flugsteuerung
│   └── utils/
│       ├── collision.ts           # Kollisionserkennung
│       └── wave-manager.ts        # Wave-/Level-Management
├── assets/                        # (Optional: lokale Modelle/Texturen)
└── kayberg.types.ts               # TypeScript Interfaces
```

---

## Implementierungsschritte

### Phase 1: Grundgerüst (Setup)

**1.1 Angular-Komponente erstellen**
- Neue `KaybergGameComponent` als standalone component
- Dialog-Pattern wie Arkanoid (MatDialog, disableClose)
- Game-States: `ready`, `playing`, `paused`, `gameover`, `won`
- Signals für: score, lives, level, waveProgress

**1.2 Three.js Integration**
- Three.js als npm dependency hinzufügen (falls nicht vorhanden)
- Canvas-Element mit WebGLRenderer
- Basis-Scene mit PerspectiveCamera
- Render-Loop mit requestAnimationFrame

**Dateien:**
- `nervbox-player/src/app/components/mini-games/games/kayberg/kayberg-game.component.ts`
- `nervbox-player/src/app/components/mini-games/games/kayberg/kayberg-game.component.scss`

---

### Phase 2: Terrain & Landschaft

**2.1 Terrain-Generierung**
- Berg-Geometrie mit PlaneGeometry + Heightmap oder procedural
- Kayberg: Zentral, erhöht, flacher Gipfel
- Tal: Umgebende niedrige Fläche
- Realistische Höhenwerte für Berg-Feeling

**2.2 Texturen & Materialien**
- Gras-Textur für Tal und Gipfel
- Weinberg-Textur für Hänge (Reihen-Pattern)
- Wald-Textur/Trees für Gipfelbereich
- Skybox mit blauem Himmel

**2.3 Landmarks**
- Gipfelkreuz am Waldrand (einfache Geometrie)
- Goldene Jesus-Statue (Sphere/Cylinder-Komposition oder glTF-Modell)
- Wälder als instanced Mesh (viele Bäume performant)

**Dateien:**
- `nervbox-player/src/app/components/mini-games/games/kayberg/engine/terrain.ts`

---

### Phase 3: Spieler (Greifvogel)

**3.1 Vogel-Model (Geometrie-basiert)**
- Körper: Längliche Ellipsoid (SphereGeometry gestreckt)
- Kopf: Kleine Sphere
- Schnabel: ConeGeometry
- Flügel: 2x Dreieck-PlaneGeometry
- Schwanz: Dreieck-PlaneGeometry
- Farben: Braun/Beige für realistischen Greifvogel-Look
- Flügelschlag-Animation durch Rotation der Flügel-Meshes
- Third-Person-Kamera folgt Vogel

**3.2 Flugsteuerung**
- Maus: Blickrichtung / Zielrichtung
- W/S: Vorwärts/Bremsen
- A/D: Rollen/Seitwärts
- Space: Sturzflug-Attacke (schnelle Abwärtsbewegung)
- Physik: Geschwindigkeit, Beschleunigung, Höhenverlust bei Sturzflug

**3.3 Kamera**
- Third-Person, hinter dem Vogel
- Smooth-Follow mit Verzögerung
- Dynamischer FOV bei Sturzflug (optional)

**Dateien:**
- `nervbox-player/src/app/components/mini-games/games/kayberg/engine/entities/player-bird.ts`
- `nervbox-player/src/app/components/mini-games/games/kayberg/engine/controls/flight-controls.ts`

---

### Phase 4: Beutetiere (Prey)

**4.1 Tier-Typen (Geometrie-basiert)**
| Tier | Größe | Geschwindigkeit | Punkte | Verhalten | Geometrie |
|------|-------|-----------------|--------|-----------|-----------|
| Maus | Klein | Langsam | 10 | Am Boden, zufällig | Kleine Ellipse + Schwanz |
| Hase | Mittel | Schnell | 25 | Am Boden, flieht | Ellipse + Ohren (Cones) |
| Kleiner Vogel | Klein | Mittel | 15 | Fliegt niedrig | Mini-Vogel-Form |
| Taube | Mittel | Langsam | 20 | Fliegt mittel-hoch | Größerer Vogel, grau |

**4.2 KI-Verhalten**
- Zufällige Bewegung in Bereich
- Flucht bei Annäherung des Greifvogels
- Spawnen an zufälligen Positionen pro Wave

**4.3 Fang-Mechanik**
- Kollision Vogel → Beute bei Sturzflug
- Oder: Nähe + Attacke-Taste
- Partikeleffekt bei erfolgreichem Fang
- Sound-Effekt

**Dateien:**
- `nervbox-player/src/app/components/mini-games/games/kayberg/engine/entities/prey.ts`

---

### Phase 5: Gegner (Jäger)

**5.1 Jäger-Model (Geometrie-basiert)**
- Körper: CylinderGeometry (grüne Jäger-Jacke)
- Kopf: SphereGeometry + ConeGeometry (Hut)
- Arme: Kleine Cylinder
- Gewehr: BoxGeometry + CylinderGeometry
- Positioniert auf Boden (Weinberge, Waldrand)
- Rotation zum Vogel hin (Tracking)

**5.2 Schuss-Mechanik**
- Jäger zielen auf Vogel
- Schüsse als Projektile (kleine Spheres)
- Projektil-Geschwindigkeit: Ausweichbar
- Cooldown zwischen Schüssen

**5.3 Kollision Projektil → Vogel**
- Leben -1 bei Treffer
- Kurze Unverwundbarkeit nach Treffer
- Screen-Shake / Rot-Flash als Feedback
- Game Over bei 0 Leben

**Dateien:**
- `nervbox-player/src/app/components/mini-games/games/kayberg/engine/entities/hunter.ts`
- `nervbox-player/src/app/components/mini-games/games/kayberg/engine/entities/projectile.ts`

---

### Phase 6: Wave-System & Level

**6.1 Wave-Manager**
```typescript
interface WaveConfig {
  level: number;
  preyToKill: number;      // Beute die gefangen werden muss
  mice: number;            // Anzahl Mäuse
  rabbits: number;         // Anzahl Hasen
  birds: number;           // Anzahl kleine Vögel
  pigeons: number;         // Anzahl Tauben
  hunters: number;         // Anzahl Jäger
  hunterFireRate: number;  // Schuss-Cooldown (ms)
}
```

**6.2 Level-Progression**
| Level | Beute | Mäuse | Hasen | Vögel | Tauben | Jäger | Schuss-CD |
|-------|-------|-------|-------|-------|--------|-------|-----------|
| 1 | 5 | 3 | 2 | 2 | 1 | 1 | 4000ms |
| 2 | 8 | 4 | 3 | 3 | 2 | 2 | 3500ms |
| 3 | 10 | 5 | 4 | 4 | 3 | 3 | 3000ms |
| 4 | 12 | 6 | 5 | 5 | 4 | 4 | 2500ms |
| 5+ | 15+ | ... | ... | ... | ... | 5+ | 2000ms |

**6.3 Level-Ende**
- Gewonnen: Genug Beute gefangen
- Verloren: 0 Leben
- Credit-Belohnung bei Sieg (Level * 50 N$?)

**Dateien:**
- `nervbox-player/src/app/components/mini-games/games/kayberg/engine/utils/wave-manager.ts`

---

### Phase 7: UI & Overlays

**7.1 In-Game HUD**
- Oben links: Score, Level
- Oben rechts: Leben (Herzen)
- Mitte oben: Wave-Fortschritt (X/Y Beute gefangen)
- Crosshair in Bildschirmmitte

**7.2 Overlays (wie Arkanoid)**
- Ready: "Kayberg Hunter" + Level-Info + Start-Button
- Paused: Weiterspielen / Beenden
- Game Over: Score, Level, Nochmal, Beenden
- Won: Score, Reward, Nächstes Level

**7.3 Styling**
- Grüne/Braune Farbpalette passend zum Natur-Theme
- Waldgrün: #228B22, Bergbraun: #8B4513
- Hover-Effekte, Animationen

**Dateien:**
- Teil von `kayberg-game.component.ts` und `kayberg-game.component.scss`

---

### Phase 8: Integration

**8.1 Game-Selection-Dialog**
- Import der `KaybergGameComponent`
- Neue `startKayberg()` Methode
- Game-Card im Grid (Vogel-Icon oder Emoji)
- Badge: "SPIELEN" oder "NEU"

**8.2 Credit-Integration**
- Bei Level-Abschluss: `creditService.claimMinigameReward('KaybergHunter', level)`
- Response: `reward`, `newBalance`
- Reward-Anzeige im Win-Overlay

**Dateien zu bearbeiten:**
- `nervbox-player/src/app/components/mini-games/game-selection-dialog.component.ts`

---

### Phase 9: Polish & Sound

**9.1 Sound-Effekte**
- Flügelschlag (ambient)
- Beute gefangen (success)
- Schuss (gunshot)
- Treffer erhalten (damage)
- Level-Up (fanfare)

**9.2 Partikel-Effekte**
- Federn bei Beute-Fang
- Blut-Spray bei Treffer (oder rote Partikel)
- Mündungsfeuer bei Schuss

**9.3 Performance**
- Instanced Meshes für Bäume/Weinberge
- Frustum Culling
- LOD für entfernte Objekte (optional)

---

## Kritische Dateien

| Datei | Beschreibung |
|-------|--------------|
| `kayberg-game.component.ts` | Hauptkomponente, UI, Overlays |
| `kayberg-engine.ts` | Game-Loop, Scene-Setup, Entities |
| `terrain.ts` | Terrain-Generierung |
| `player-bird.ts` | Spieler-Logik |
| `prey.ts` | Beutetier-Logik |
| `hunter.ts` | Jäger-Logik |
| `wave-manager.ts` | Level-Progression |
| `game-selection-dialog.component.ts` | Spiel hinzufügen |

---

## Abhängigkeiten

**Three.js muss installiert werden** (noch nicht im Projekt vorhanden):

```bash
cd nervbox-player
npm install three @types/three
```

Bereits vorhandene relevante Dependencies:
- `cesium` - 3D-Engine (wird für Tower Defense verwendet, aber Three.js ist leichtgewichtiger für dieses Spiel)
- `kaplay` - 2D-Game-Library (wird für Hotdog verwendet)

---

## Geschätzter Umfang

- ~8-10 neue Dateien
- ~2000-3000 Zeilen Code
- Komplexität: Hoch (vergleichbar mit Tower Defense)
