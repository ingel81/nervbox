Bug:
 [ ] ist ein turm selektiert und man macht mit der LMB ein Pan und lässt los, wird der turm deselektiert. das soll nicht sein

Allgemein:
 [x] Soundlaustärke abhängig von Kamerentfernung (kein cutoff - natürliches Verhalten)
     - SpatialAudioManager mit Three.js PositionalAudio implementiert
     - Sounds werden automatisch leiser bei Entfernung (inverse distance model)
     - Siehe docs/SPATIAL_AUDIO.md

Gegner:
 [x] Blutsystem (Gegner hinterlassen Blutflecken bei Treffer und Tod)
     - ThreeEffectsRenderer.spawnBloodSplatter() für Partikel-Effekte
     - ThreeEffectsRenderer.spawnBloodDecal() für persistente Blutflecken am Boden
     - Bei Treffer: kleine Blut-Partikel (15) + kleiner Decal (0.8m)
     - Bei Tod: große Blut-Partikel (40) + großer Decal (2.0m)
     - Decals faden nach 20s aus (über 10s)

Projektile:
 [x] Sichtbarkeit (erledigt)
 [ ] Sollen nur ihr Ziel erreichen können wenn wirklich eine Sichtverbindung zum Gegner besteht (Line-of-Sight)

Türme:
 [x] Sollen selektiert werden können
     - Klick auf Tower selektiert ihn (15m Click-Radius)
     - Selection Ring Animation mit Pulse-Effekt
     - Radius-Anzeige wird eingeblendet
     - Bug-Fix: geoToLocalSimple statt geoToLocal für korrekte Distanzberechnung
     [ ] wenn ein turm selektiert ist sollen seine details (Type, range, damage,etc)) in der sidebar ersichtlich sein, mit später optionen für upgrade, verkaufen, etc.
     
 [x] Benötigen eine Radius-Anzeige wenn selektiert (diese soll wirklich satt auf dem Terrain liegen) und auch eventuelle Verdeckungen berücksichtigen
     - ThreeTowerRenderer.createTerrainDiscGeometry() erstellt terrain-konformes Mesh
     - Samplet Terrain-Höhen in konzentrischen Ringen (8 Ringe, 48 Segmente)
     - Passt sich automatisch an Hügel und Täler an
     - TerrainHeightSampler wird in engine.initialize() gesetzt

UI:
 [x] Sidebar rechts mit den Optionen wie "Start Welle" und "Tower platzieren" sowie Debug
     alles in eine einheitliche Sidebar bringen (WC3/Ancient Command Style)
 [x] FPS Anzeige
     - Im Header rechts neben den Stats
     - Aktualisiert jedes Frame vom Engine

Kamera:
 [x] Initiale Position optimiert
     - 45 Grad Blickwinkel, Blickrichtung Norden, HQ im Zentrum
     - Initiale Position wird nach 2s gespeichert (wenn Tiles geladen)
     - Reset-Button stellt exakt diese gespeicherte Position wieder her

Gameplay:
 [ ] User soll sich eine eigene Location durch Eingabe seines Ortes wählen können
    [ ] Spawn-Punkte sollen in der Nähe gewürfelt werden in diesem Fall
 [ ] Während Development unsere aktuelle Location als Default
